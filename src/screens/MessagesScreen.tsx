import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Buffer } from "buffer";
import { Feather } from "@expo/vector-icons";
import { ConversationItem } from "../components/chat/ConversationItem";
import { MessageBubble } from "../components/chat/MessageBubble";
import { MessageInput } from "../components/chat/MessageInput";
import { EmptyState } from "../components/common/EmptyState";
import { TopBar } from "../components/common/TopBar";
import { SearchBar } from "../components/search/SearchBar";
import { api, authStore, getSocket } from "../lib";
import type { Conversation, Message } from "../types";
import { ComposeConversationModal } from "./messages/components";
import { useConversationCompose } from "./messages/hooks";
import type { MessagesScreenProps } from "./messages/types";

const DEFAULT_API_URL = "http://10.0.2.2:5000";
const DEFAULT_VIDEO_CALL_BASE_URL = "https://meet.jit.si";

type CallPayload = {
  conversationId: string;
  roomId: string;
  fromUserId: number;
  fromUserName: string;
  targetUserId?: number;
  mode?: "video";
  answeredAt?: number;
  reason?: string;
};

type IncomingCallState = {
  payload: CallPayload;
  conversationName: string;
};

type OutgoingCallState = {
  payload: CallPayload;
  conversationName: string;
};

function resolveChatMediaUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (
    /^https?:\/\//i.test(raw) ||
    raw.startsWith("data:") ||
    raw.startsWith("file:") ||
    raw.startsWith("blob:")
  ) {
    return raw;
  }
  const base = String(process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(
    /\/+$/,
    "",
  );
  if (raw.startsWith("/")) return `${base}${raw}`;
  return `${base}/${raw.replace(/^\/+/, "")}`;
}

function getExtensionFromMimeType(mimeType?: string | null): string {
  const value = String(mimeType || "").toLowerCase();
  if (value.includes("png")) return "png";
  if (value.includes("webp")) return "webp";
  if (value.includes("gif")) return "gif";
  if (value.includes("heic") || value.includes("heif")) return "heic";
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("pdf")) return "pdf";
  if (value.includes("json")) return "json";
  if (value.includes("zip")) return "zip";
  if (value.includes("csv")) return "csv";
  if (value.includes("mp4")) return "mp4";
  return "bin";
}

async function ensureBase64Data(
  input: {
    base64?: string | null;
    uri?: string | null;
  },
) {
  const direct = String(input.base64 || "").trim();
  if (direct) return direct;

  const uri = String(input.uri || "").trim();
  if (!uri) return "";

  const response = await fetch(uri);
  if (!response.ok) return "";
  const arr = await response.arrayBuffer();
  return Buffer.from(arr).toString("base64");
}

function sanitizeRoomName(input: string): string {
  const value = String(input || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return value || `zchat-${Date.now()}`;
}

function buildCallRoomId(conversationId: string, userId: number): string {
  return sanitizeRoomName(`zchat-${conversationId}-${userId}-${Date.now()}`);
}

function resolveVideoCallUrl(roomId: string): string {
  const base = String(
    process.env.EXPO_PUBLIC_VIDEO_CALL_BASE_URL || DEFAULT_VIDEO_CALL_BASE_URL,
  ).replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(roomId)}`;
}

function resolveDirectPeerUserId(
  conversation: Conversation | null | undefined,
  currentUserId: number,
): number | null {
  if (!conversation || conversation.isGroup) return null;

  const directPeerId = Number(conversation.directPeerId || 0);
  if (directPeerId > 0) return directPeerId;

  const fromMembers = (conversation.members || []).find(
    (member) =>
      Number(member?.userId || 0) > 0 &&
      Number(member?.userId || 0) !== Number(currentUserId),
  );
  if (fromMembers?.userId) return Number(fromMembers.userId);

  const fromParticipants = (conversation.participants || []).find(
    (participant) =>
      Number(participant?.userId || 0) > 0 &&
      Number(participant?.userId || 0) !== Number(currentUserId),
  );
  if (fromParticipants?.userId) return Number(fromParticipants.userId);

  return null;
}

export function MessagesScreen({
  user,
  mode = "all",
  initialDirectUserId,
  initialDirectRouteKey,
  onInitialDirectHandled,
  onOpenUserProfile,
  onOpenPost,
  incomingCallBootstrap,
  onIncomingCallBootstrapHandled,
}: MessagesScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [conversationKeyword, setConversationKeyword] = useState("");
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [conversationDetail, setConversationDetail] = useState<Conversation | null>(null);
  const [isLoadingConversationDetail, setIsLoadingConversationDetail] =
    useState(false);
  const [isMutatingConversation, setIsMutatingConversation] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCallState | null>(null);
  const [isOpeningCallRoom, setIsOpeningCallRoom] = useState(false);
  const messageListRef = useRef<FlatList<Message> | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const activeJoinedConversationIdsRef = useRef<string[]>([]);
  const createdConversationIdsRef = useRef<Set<string>>(new Set());
  const conversationsRef = useRef<Conversation[]>([]);
  const handledMessageEventRef = useRef<Set<string>>(new Set());
  const handledIncomingBootstrapRef = useRef<number>(0);

  const filteredConversations = useMemo(() => {
    const q = conversationKeyword.trim().toLowerCase();
    if (!q) return conversations;

    return conversations.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const participants = (item.participants || [])
        .map((p) => String(p.name || "").toLowerCase())
        .join(" ");

      return (
        name.includes(q) ||
        participants.includes(q) ||
        (item.isGroup && "nhom group".includes(q))
      );
    });
  }, [conversations, conversationKeyword]);

  const conversationsForView = useMemo(() => {
    if (mode !== "groups") return filteredConversations;
    return filteredConversations.filter((item) => item.isGroup);
  }, [filteredConversations, mode]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const scrollMessagesToEnd = useCallback((animated = true) => {
    setTimeout(() => {
      messageListRef.current?.scrollToEnd({ animated });
    }, 60);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.listConversations();
      const normalized = (res.conversations || []).filter((item) => {
        const hasLastMessage = Boolean(String(item.lastMessage || "").trim());
        const hasUnread = Number(item.unreadCount || 0) > 0;
        const isNamedGroup = Boolean(item.isGroup && String(item.name || "").trim());
        const wasCreatedLocally = createdConversationIdsRef.current.has(item.id);
        return hasLastMessage || hasUnread || isNamedGroup || wasCreatedLocally;
      });
      setConversations(normalized);
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await api.listMessages(convId);
      setMessages(res.messages || []);
      scrollMessagesToEnd(false);
    } catch {
      /* silent */
    }
  }, [scrollMessagesToEnd]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const upsertConversation = useCallback((conversation: Conversation) => {
    createdConversationIdsRef.current.add(conversation.id);
    setConversations((prev) => {
      const found = prev.find((item) => item.id === conversation.id);
      if (!found) return [conversation, ...prev];
      return prev.map((item) =>
        item.id === conversation.id ? conversation : item,
      );
    });
  }, []);

  const openConversation = useCallback(
    async (conversation: Conversation) => {
      createdConversationIdsRef.current.add(conversation.id);
      setSelectedConv(conversation);
      setConversations((prev) =>
        prev.map((item) =>
          item.id === conversation.id ? { ...item, unreadCount: 0 } : item,
        ),
      );
      await loadMessages(conversation.id);
      scrollMessagesToEnd(false);
    },
    [loadMessages, scrollMessagesToEnd],
  );

  useEffect(() => {
    const payload = incomingCallBootstrap;
    if (!payload?.conversationId || !payload?.roomId) return;

    const routeKey = Number(payload.routeKey || 0);
    if (routeKey && handledIncomingBootstrapRef.current === routeKey) return;
    if (routeKey) handledIncomingBootstrapRef.current = routeKey;

    const normalizedPayload: CallPayload = {
      conversationId: String(payload.conversationId),
      roomId: String(payload.roomId),
      fromUserId: Number(payload.fromUserId || 0),
      fromUserName: String(payload.fromUserName || "Nguoi dung"),
      targetUserId: Number(payload.targetUserId || 0) || undefined,
      mode: "video",
    };

    const matchedConversation = conversationsRef.current.find(
      (item) => String(item.id) === normalizedPayload.conversationId,
    );
    const conversationName = String(
      matchedConversation?.name ||
        normalizedPayload.fromUserName ||
        "Cuoc goi video",
    );

    setIncomingCall({ payload: normalizedPayload, conversationName });
    if (
      matchedConversation &&
      activeConversationIdRef.current !== normalizedPayload.conversationId
    ) {
      void openConversation(matchedConversation);
    }
    onIncomingCallBootstrapHandled?.();
  }, [incomingCallBootstrap, onIncomingCallBootstrapHandled, openConversation]);

  const loadConversationDetail = useCallback(async (conversationId: string) => {
    setIsLoadingConversationDetail(true);
    try {
      const res = await api.getConversationDetail(conversationId);
      setConversationDetail(res.conversation);
      setSelectedConv((prev) =>
        prev && prev.id === conversationId ? { ...prev, ...res.conversation } : prev,
      );
      setConversations((prev) =>
        prev.map((item) =>
          item.id === conversationId ? { ...item, ...res.conversation } : item,
        ),
      );
    } catch {
      setConversationDetail(null);
    } finally {
      setIsLoadingConversationDetail(false);
    }
  }, []);

  const openVideoCallRoom = useCallback(async (roomId: string) => {
    const url = resolveVideoCallUrl(roomId);
    setIsOpeningCallRoom(true);
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error("Thiet bi khong mo duoc lien ket cuoc goi video.");
      }
      await Linking.openURL(url);
    } finally {
      setIsOpeningCallRoom(false);
    }
  }, []);

  const markMessageEventHandled = useCallback((eventId: string) => {
    const key = String(eventId || "").trim();
    if (!key) return false;
    if (handledMessageEventRef.current.has(key)) return false;
    handledMessageEventRef.current.add(key);

    if (handledMessageEventRef.current.size > 1200) {
      const first = handledMessageEventRef.current.values().next()
        .value as string | undefined;
      if (first) handledMessageEventRef.current.delete(first);
    }
    return true;
  }, []);

  useEffect(() => {
    const token = authStore.getTokens()?.accessToken;
    if (!token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    const onSocketConnect = () => {
      const roomIds = activeJoinedConversationIdsRef.current;
      roomIds.forEach((roomId) => {
        if (roomId) {
          socket.emit("join-conversation", roomId);
        }
      });
    };

    const onMessageNew = (payload: any) => {
      const normalized: Message = {
        id: String(payload?.id || ""),
        conversationId: String(payload?.conversationId || ""),
        senderId: Number(payload?.senderId || 0),
        senderName: String(payload?.senderName || "Nguoi dung"),
        content: String(payload?.content ?? payload?.text ?? ""),
        type: payload?.type ? String(payload.type) : "text",
        mediaUrl: resolveChatMediaUrl(payload?.mediaUrl),
        fileName: payload?.fileName ? String(payload.fileName) : "",
        fileSize: Number(payload?.fileSize || 0),
        meta: payload?.meta || null,
        createdAt: String(payload?.createdAt || new Date().toISOString()),
        isRecalled: Boolean(payload?.isRecalled),
      };

      if (!normalized.id || !normalized.conversationId) return;
      const eventKey = `new:${normalized.conversationId}:${normalized.id}`;
      if (!markMessageEventHandled(eventKey)) return;

      const activeJoinedConversationIds = activeJoinedConversationIdsRef.current;
      const isInActiveJoinedRoom = activeJoinedConversationIds.includes(
        normalized.conversationId,
      );

      if (isInActiveJoinedRoom) {
        setMessages((prev) => {
          if (prev.some((item) => item.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
        scrollMessagesToEnd();
      }

      setConversations((prev) => {
        const target = prev.find((item) => item.id === normalized.conversationId);
        if (!target) {
          void loadConversations();
          return prev;
        }

        const nextUnread =
          isInActiveJoinedRoom
            ? 0
            : (target.unreadCount || 0) + 1;

        const updated: Conversation = {
          ...target,
          lastMessage: normalized.content,
          lastMessageAt: normalized.createdAt,
          unreadCount: nextUnread,
        };

        return [updated, ...prev.filter((item) => item.id !== updated.id)];
      });
    };

    const onMessageUpdated = (payload: any) => {
      const messageId = String(payload?.id || "");
      if (!messageId) return;
      const conversationId = String(payload?.conversationId || "");
      const eventKey = `update:${conversationId}:${messageId}:${Boolean(payload?.isRecalled)}:${Number(payload?.removedForUserId || 0)}`;
      if (!markMessageEventHandled(eventKey)) return;

      if (Number(payload?.removedForUserId || 0) === Number(user.id)) {
        setMessages((prev) => prev.filter((item) => item.id !== messageId));
        return;
      }

      setMessages((prev) =>
        prev.map((item) =>
          item.id === messageId
            ? {
                ...item,
                content: String(payload?.content ?? "Tin nhan da duoc thu hoi"),
                type: payload?.type ? String(payload.type) : item.type,
                mediaUrl: resolveChatMediaUrl(payload?.mediaUrl),
                fileName: payload?.fileName ? String(payload.fileName) : "",
                fileSize: Number(payload?.fileSize || 0),
                meta: payload?.meta || null,
                isRecalled: Boolean(payload?.isRecalled ?? true),
              }
            : item,
        ),
      );
    };

    const onCallOffer = (raw: any) => {
      const payload: CallPayload = {
        conversationId: String(raw?.conversationId || "").trim(),
        roomId: String(raw?.roomId || "").trim(),
        fromUserId: Number(raw?.fromUserId || 0),
        fromUserName: String(raw?.fromUserName || "Nguoi dung"),
        targetUserId: Number(raw?.targetUserId || 0) || undefined,
        mode: "video",
      };

      if (!payload.conversationId || !payload.roomId) return;
      if (payload.fromUserId === Number(user.id)) return;

      const matchedConversation = conversationsRef.current.find(
        (item) => String(item.id) === payload.conversationId,
      );
      const conversationName = String(
        matchedConversation?.name || payload.fromUserName || "Cuoc goi video",
      );

      setIncomingCall({ payload, conversationName });

      if (
        matchedConversation &&
        activeConversationIdRef.current !== payload.conversationId
      ) {
        void openConversation(matchedConversation);
      }
    };

    const onCallAnswer = (raw: any) => {
      const payload: CallPayload = {
        conversationId: String(raw?.conversationId || "").trim(),
        roomId: String(raw?.roomId || "").trim(),
        fromUserId: Number(raw?.fromUserId || 0),
        fromUserName: String(raw?.fromUserName || "Nguoi dung"),
        answeredAt: Number(raw?.answeredAt || 0) || Date.now(),
      };
      if (!payload.conversationId || !payload.roomId) return;

      let shouldOpen = false;
      setOutgoingCall((prev) => {
        if (!prev) return prev;
        if (prev.payload.roomId !== payload.roomId) return prev;
        shouldOpen = true;
        return null;
      });

      if (shouldOpen) {
        void openVideoCallRoom(payload.roomId).catch((err) => {
          Alert.alert(
            "Khong the mo cuoc goi video",
            err instanceof Error ? err.message : "Vui long thu lai",
          );
        });
      }
    };

    const onCallEnd = (raw: any) => {
      const payload: CallPayload = {
        conversationId: String(raw?.conversationId || "").trim(),
        roomId: String(raw?.roomId || "").trim(),
        fromUserId: Number(raw?.fromUserId || 0),
        fromUserName: String(raw?.fromUserName || "Nguoi dung"),
        reason: String(raw?.reason || "").trim().toLowerCase(),
      };
      if (!payload.conversationId || !payload.roomId) return;

      let outgoingStopped = false;
      setOutgoingCall((prev) => {
        if (!prev) return prev;
        if (prev.payload.roomId !== payload.roomId) return prev;
        outgoingStopped = true;
        return null;
      });

      setIncomingCall((prev) => {
        if (!prev) return prev;
        if (prev.payload.roomId !== payload.roomId) return prev;
        return null;
      });

      if (outgoingStopped && payload.reason === "rejected") {
        Alert.alert("Cuoc goi bi tu choi", "Nguoi nhan da tu choi cuoc goi.");
      }
    };

    socket.on("message:new", onMessageNew);
    socket.on("message:updated", onMessageUpdated);
    socket.on("call:offer", onCallOffer);
    socket.on("call:answer", onCallAnswer);
    socket.on("call:end", onCallEnd);
    socket.on("connect", onSocketConnect);
    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("message:updated", onMessageUpdated);
      socket.off("call:offer", onCallOffer);
      socket.off("call:answer", onCallAnswer);
      socket.off("call:end", onCallEnd);
      socket.off("connect", onSocketConnect);
    };
  }, [
    loadConversations,
    markMessageEventHandled,
    openConversation,
    openVideoCallRoom,
    scrollMessagesToEnd,
    user.id,
  ]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const previousRoomIds = activeJoinedConversationIdsRef.current;
    const nextId = selectedConv?.id || null;
    const nextRoomIds: string[] = [];

    if (nextId) {
      nextRoomIds.push(nextId);

      const activeConversation =
        selectedConv ||
        conversationsRef.current.find((item) => String(item.id) === String(nextId));
      const activePeerId = resolveDirectPeerUserId(activeConversation, user.id);

      if (activePeerId) {
        for (const conversation of conversationsRef.current) {
          const conversationId = String(conversation?.id || "").trim();
          if (!conversationId || conversation.isGroup) continue;
          const peerId = resolveDirectPeerUserId(conversation, user.id);
          if (peerId && Number(peerId) === Number(activePeerId)) {
            nextRoomIds.push(conversationId);
          }
        }
      }
    }

    const uniqueNextRoomIds = Array.from(
      new Set(nextRoomIds.map((id) => String(id || "").trim()).filter(Boolean)),
    );

    previousRoomIds
      .filter((roomId) => !uniqueNextRoomIds.includes(roomId))
      .forEach((roomId) => {
        socket.emit("leave-conversation", roomId);
      });

    uniqueNextRoomIds
      .filter((roomId) => !previousRoomIds.includes(roomId))
      .forEach((roomId) => {
        socket.emit("join-conversation", roomId);
      });

    activeJoinedConversationIdsRef.current = uniqueNextRoomIds;
    activeConversationIdRef.current = nextId;
  }, [selectedConv, user.id]);

  useEffect(() => {
    if (!selectedConv?.id) {
      setConversationDetail(null);
      setShowConversationMenu(false);
      setShowMembersModal(false);
      return;
    }
    void loadConversationDetail(selectedConv.id);
  }, [loadConversationDetail, selectedConv?.id]);

  useEffect(() => {
    if (!selectedConv?.id) return;
    scrollMessagesToEnd(false);
  }, [messages.length, scrollMessagesToEnd, selectedConv?.id]);

  const {
    showComposeModal,
    composeMode,
    composeKeyword,
    searchUsers,
    groupName,
    groupMemberIds,
    filteredFriends,
    isSearchingUsers,
    isSubmittingCompose,
    setComposeMode,
    setComposeKeyword,
    setGroupName,
    openCompose,
    closeCompose,
    toggleGroupMember,
    handleCreateDirect,
    handleCreateGroup,
  } = useConversationCompose({
    upsertConversation,
    openConversation,
    initialDirectUserId,
    initialDirectRouteKey,
    onInitialDirectHandled,
  });

  const handleSend = useCallback(async () => {
    const text = messageText.trim();
    if (!text || !selectedConv || isUploadingAttachment) return;

    const optimisticId = `local-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversationId: selectedConv.id,
      senderId: Number(user.id),
      senderName: user.fullName || "Nguoi dung",
      content: text,
      type: "text",
      createdAt: new Date().toISOString(),
      mediaUrl: "",
      fileName: "",
      fileSize: 0,
      meta: null,
      isRecalled: false,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setMessageText("");
    scrollMessagesToEnd();

    try {
      const res = await api.sendMessagePayload(selectedConv.id, {
        type: "text",
        text,
      });
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((item) => item.id !== optimisticId);
        if (withoutOptimistic.some((item) => item.id === res.message.id)) {
          return withoutOptimistic;
        }
        return [...withoutOptimistic, res.message];
      });
      scrollMessagesToEnd();
    } catch (err) {
      setMessages((prev) => prev.filter((item) => item.id !== optimisticId));
      setMessageText(text);
      Alert.alert(
        "Khong the gui tin nhan",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    }
  }, [
    isUploadingAttachment,
    messageText,
    scrollMessagesToEnd,
    selectedConv,
    user.fullName,
    user.id,
  ]);

  const handlePickImage = useCallback(async () => {
    if (!selectedConv) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Thieu quyen", "Vui long cap quyen thu vien anh.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.5,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const base64 = await ensureBase64Data({
        base64: (asset as any).base64,
        uri: asset.uri,
      });
      if (!base64) {
        Alert.alert("Khong the gui anh", "Khong doc duoc du lieu anh.");
        return;
      }

      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > 12 * 1024 * 1024) {
        Alert.alert("Anh qua lon", "Vui long chon anh nho hon 12MB.");
        return;
      }

      setIsUploadingAttachment(true);
      const ext = getExtensionFromMimeType(asset.mimeType);
      const uploaded = await api.uploadChatFileBase64({
        fileName: asset.fileName || `chat-image-${Date.now()}.${ext}`,
        contentType: asset.mimeType || "image/jpeg",
        base64Data: base64,
      });

      if (!uploaded.fileUrl) {
        throw new Error("Upload anh that bai");
      }

      const res = await api.sendMessagePayload(selectedConv.id, {
        type: "image",
        text: messageText.trim() || "",
        mediaUrl: uploaded.fileUrl,
        fileName: uploaded.fileName,
        fileSize: uploaded.size,
        meta: {
          width: Number(asset.width || 0),
          height: Number(asset.height || 0),
        },
      });
      setMessages((prev) => [...prev, res.message]);
      setMessageText("");
      scrollMessagesToEnd();
    } catch (err) {
      Alert.alert(
        "Khong the gui anh",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsUploadingAttachment(false);
    }
  }, [messageText, scrollMessagesToEnd, selectedConv]);

  const handlePickFile = useCallback(async () => {
    if (!selectedConv) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "*/*",
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const base64 = await ensureBase64Data({
        base64: (asset as any).base64,
        uri: (asset as any).uri,
      });
      if (!base64) {
        Alert.alert("Khong the gui tep", "Khong doc duoc du lieu tep.");
        return;
      }

      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > 15 * 1024 * 1024) {
        Alert.alert("Tep qua lon", "Vui long chon tep nho hon 15MB.");
        return;
      }

      setIsUploadingAttachment(true);
      const uploaded = await api.uploadChatFileBase64({
        fileName: asset.name || `chat-file-${Date.now()}`,
        contentType: asset.mimeType || "application/octet-stream",
        base64Data: base64,
      });

      if (!uploaded.fileUrl) {
        throw new Error("Upload tep that bai");
      }

      const res = await api.sendMessagePayload(selectedConv.id, {
        type: "file",
        text: messageText.trim() || "",
        mediaUrl: uploaded.fileUrl,
        fileName: uploaded.fileName || asset.name || "tep-dinh-kem",
        fileSize: uploaded.size || approxBytes,
      });
      setMessages((prev) => [...prev, res.message]);
      setMessageText("");
      scrollMessagesToEnd();
    } catch (err) {
      Alert.alert(
        "Khong the gui tep",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsUploadingAttachment(false);
    }
  }, [messageText, scrollMessagesToEnd, selectedConv]);

  const handleLongPressMessage = useCallback(
    (message: Message) => {
      if (!selectedConv) return;
      if (message.senderId !== user.id) return;
      if (message.isRecalled) return;

      Alert.alert("Thu hoi tin nhan", "Chon pham vi thu hoi", [
        { text: "Huy", style: "cancel" },
        {
          text: "Thu hoi ben toi",
          onPress: async () => {
            try {
              const res = await api.recallMessage(selectedConv.id, message.id, "me");
              if (res.removed) {
                setMessages((prev) => prev.filter((item) => item.id !== message.id));
              }
            } catch (err) {
              Alert.alert(
                "Khong the thu hoi",
                err instanceof Error ? err.message : "Vui long thu lai",
              );
            }
          },
        },
        {
          text: "Thu hoi tat ca",
          onPress: async () => {
            try {
              const res = await api.recallMessage(selectedConv.id, message.id, "all");
              const recalledMessage = res.message;
              if (recalledMessage) {
                setMessages((prev) =>
                  prev.map((item) => (item.id === message.id ? recalledMessage : item)),
                );
              }
            } catch (err) {
              Alert.alert(
                "Khong the thu hoi",
                err instanceof Error ? err.message : "Vui long thu lai",
              );
            }
          },
        },
      ]);
    },
    [selectedConv, user.id],
  );

  const activeConversation = conversationDetail || selectedConv;
  const peerUserId = useMemo(() => {
    return resolveDirectPeerUserId(activeConversation, user.id);
  }, [activeConversation, user.id]);

  const conversationNotificationsEnabled = Boolean(
    activeConversation?.viewerSettings?.notificationsEnabled ?? true,
  );
  const myMemberRole = useMemo(() => {
    if (!activeConversation?.isGroup) return null;
    const me = (activeConversation.members || []).find(
      (member) => Number(member.userId) === Number(user.id),
    );
    return String(me?.role || "").toLowerCase() || null;
  }, [activeConversation, user.id]);
  const canDissolveGroup = activeConversation?.isGroup && myMemberRole === "leader";
  const canLeaveGroup = Boolean(activeConversation?.isGroup);
  const conversationTitle = String(
    activeConversation?.name || selectedConv?.name || "Cuoc tro chuyen",
  );
  const callTargetUserId = useMemo(() => {
    if (typeof peerUserId === "number" && peerUserId > 0) return peerUserId;
    const fromMembers = (activeConversation?.members || []).find(
      (member) =>
        Number(member?.userId || 0) > 0 &&
        Number(member?.userId || 0) !== Number(user.id),
    );
    if (fromMembers?.userId) return Number(fromMembers.userId);

    const fromParticipants = (activeConversation?.participants || []).find(
      (participant) =>
        Number(participant?.userId || 0) > 0 &&
        Number(participant?.userId || 0) !== Number(user.id),
    );
    if (fromParticipants?.userId) return Number(fromParticipants.userId);

    return null;
  }, [
    activeConversation?.members,
    activeConversation?.participants,
    peerUserId,
    user.id,
  ]);
  const isGroupCallConversation = Boolean(
    activeConversation?.isGroup && !callTargetUserId,
  );
  const directConversationBlocked = Boolean(
    !isGroupCallConversation &&
      (activeConversation?.isBlockedByMe || activeConversation?.isBlockedMe),
  );
  const canStartVideoCall = Boolean(
    selectedConv &&
      !directConversationBlocked &&
      !isOpeningCallRoom &&
      !outgoingCall &&
      !incomingCall,
  );

  const emitCallEnd = useCallback(
    (
      payload: Pick<CallPayload, "conversationId" | "roomId" | "targetUserId"> & {
        reason: string;
      },
    ) => {
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit("call:end", {
        conversationId: payload.conversationId,
        roomId: payload.roomId,
        targetUserId: payload.targetUserId,
        fromUserId: user.id,
        fromUserName: user.fullName || "Nguoi dung",
        reason: payload.reason,
      });
    },
    [user.fullName, user.id],
  );

  const handleStartVideoCall = useCallback(async () => {
    if (!selectedConv || !canStartVideoCall) return;
    const socket = socketRef.current;
    if (!socket) {
      Alert.alert("Chua ket noi socket", "Vui long thu lai sau it giay.");
      return;
    }

    const roomId = buildCallRoomId(String(selectedConv.id), Number(user.id));
    const payload: CallPayload = {
      conversationId: String(selectedConv.id),
      roomId,
      fromUserId: Number(user.id),
      fromUserName: user.fullName || "Nguoi dung",
      mode: "video",
      targetUserId: isGroupCallConversation
        ? undefined
        : callTargetUserId || undefined,
    };

    socket.emit("call:offer", payload);

    if (isGroupCallConversation) {
      try {
        await openVideoCallRoom(roomId);
      } catch (err) {
        Alert.alert(
          "Khong the mo cuoc goi video",
          err instanceof Error ? err.message : "Vui long thu lai",
        );
        emitCallEnd({
          conversationId: payload.conversationId,
          roomId: payload.roomId,
          targetUserId: payload.targetUserId,
          reason: "error",
        });
      }
      return;
    }

    setOutgoingCall({
      payload,
      conversationName: conversationTitle,
    });
  }, [
    callTargetUserId,
    canStartVideoCall,
    conversationTitle,
    emitCallEnd,
    isGroupCallConversation,
    openVideoCallRoom,
    selectedConv,
    user.fullName,
    user.id,
  ]);

  const handleAcceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    const socket = socketRef.current;
    if (!socket) {
      Alert.alert("Chua ket noi socket", "Vui long thu lai sau it giay.");
      return;
    }

    const payload = incomingCall.payload;
    socket.emit("call:answer", {
      conversationId: payload.conversationId,
      roomId: payload.roomId,
      targetUserId: payload.fromUserId || undefined,
      fromUserId: user.id,
      fromUserName: user.fullName || "Nguoi dung",
      answeredAt: Date.now(),
    });
    setIncomingCall(null);

    try {
      await openVideoCallRoom(payload.roomId);
    } catch (err) {
      Alert.alert(
        "Khong the mo cuoc goi video",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
      emitCallEnd({
        conversationId: payload.conversationId,
        roomId: payload.roomId,
        targetUserId: payload.fromUserId || undefined,
        reason: "error",
      });
    }
  }, [emitCallEnd, incomingCall, openVideoCallRoom, user.fullName, user.id]);

  const handleDeclineIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    emitCallEnd({
      conversationId: incomingCall.payload.conversationId,
      roomId: incomingCall.payload.roomId,
      targetUserId: incomingCall.payload.fromUserId || undefined,
      reason: "rejected",
    });
    setIncomingCall(null);
  }, [emitCallEnd, incomingCall]);

  const handleCancelOutgoingCall = useCallback(() => {
    if (!outgoingCall) return;
    emitCallEnd({
      conversationId: outgoingCall.payload.conversationId,
      roomId: outgoingCall.payload.roomId,
      targetUserId: outgoingCall.payload.targetUserId,
      reason: "cancelled",
    });
    setOutgoingCall(null);
  }, [emitCallEnd, outgoingCall]);

  useEffect(() => {
    if (!outgoingCall) return;
    const timer = setTimeout(() => {
      emitCallEnd({
        conversationId: outgoingCall.payload.conversationId,
        roomId: outgoingCall.payload.roomId,
        targetUserId: outgoingCall.payload.targetUserId,
        reason: "timeout",
      });
      setOutgoingCall(null);
      Alert.alert("Khong co phan hoi", "Nguoi nhan chua tra loi cuoc goi.");
    }, 25000);

    return () => clearTimeout(timer);
  }, [emitCallEnd, outgoingCall]);

  const handleToggleNotifications = useCallback(async () => {
    if (!selectedConv) return;
    setIsMutatingConversation(true);
    try {
      await api.toggleConversationNotifications(
        selectedConv.id,
        !conversationNotificationsEnabled,
      );
      await loadConversationDetail(selectedConv.id);
      setShowConversationMenu(false);
    } catch (err) {
      Alert.alert(
        "Khong cap nhat duoc",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsMutatingConversation(false);
    }
  }, [
    conversationNotificationsEnabled,
    loadConversationDetail,
    selectedConv,
  ]);

  const handleToggleBlockPeer = useCallback(async () => {
    if (!selectedConv || !peerUserId) return;
    setIsMutatingConversation(true);
    try {
      if (activeConversation?.isBlockedByMe) {
        await api.unblockUser(peerUserId);
      } else {
        await api.blockUser(peerUserId);
      }
      await loadConversationDetail(selectedConv.id);
      void loadConversations();
      setShowConversationMenu(false);
    } catch (err) {
      Alert.alert(
        "Khong the cap nhat chan tin nhan",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsMutatingConversation(false);
    }
  }, [
    activeConversation?.isBlockedByMe,
    loadConversationDetail,
    loadConversations,
    peerUserId,
    selectedConv,
  ]);

  const handleUpdateGroupAvatar = useCallback(async () => {
    if (!selectedConv || !activeConversation?.isGroup) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Thieu quyen", "Vui long cap quyen thu vien anh.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.55,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert("Khong the doi avatar", "Khong doc duoc du lieu anh.");
        return;
      }

      const approxBytes = Math.floor((asset.base64.length * 3) / 4);
      if (approxBytes > 8 * 1024 * 1024) {
        Alert.alert("Anh qua lon", "Vui long chon anh nho hon 8MB.");
        return;
      }

      setIsMutatingConversation(true);
      const uploaded = await api.uploadChatFileBase64({
        fileName: asset.fileName || `group-avatar-${Date.now()}.jpg`,
        contentType: asset.mimeType || "image/jpeg",
        base64Data: asset.base64,
      });
      if (!uploaded.fileUrl) {
        throw new Error("Upload avatar that bai");
      }

      await api.updateGroupConversationAvatar(selectedConv.id, uploaded.fileUrl);
      await loadConversationDetail(selectedConv.id);
      await loadConversations();
      setShowConversationMenu(false);
    } catch (err) {
      Alert.alert(
        "Khong the doi avatar nhom",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsMutatingConversation(false);
    }
  }, [activeConversation?.isGroup, loadConversationDetail, loadConversations, selectedConv]);

  const handleLeaveGroup = useCallback(() => {
    if (!selectedConv) return;
    Alert.alert("Roi nhom", "Ban chac chan muon roi nhom?", [
      { text: "Huy", style: "cancel" },
      {
        text: "Roi nhom",
        style: "destructive",
        onPress: async () => {
          setIsMutatingConversation(true);
          try {
            await api.leaveGroupConversation(selectedConv.id);
            setShowConversationMenu(false);
            setSelectedConv(null);
            setConversationDetail(null);
            setMessages([]);
            void loadConversations();
          } catch (err) {
            Alert.alert(
              "Khong the roi nhom",
              err instanceof Error ? err.message : "Vui long thu lai",
            );
          } finally {
            setIsMutatingConversation(false);
          }
        },
      },
    ]);
  }, [loadConversations, selectedConv]);

  const handleDissolveGroup = useCallback(() => {
    if (!selectedConv) return;
    Alert.alert(
      "Giai tan nhom",
      "Giai tan nhom se xoa cuoc tro chuyen nay cho tat ca thanh vien.",
      [
        { text: "Huy", style: "cancel" },
        {
          text: "Giai tan",
          style: "destructive",
          onPress: async () => {
            setIsMutatingConversation(true);
            try {
              await api.dissolveGroupConversation(selectedConv.id);
              setShowConversationMenu(false);
              setSelectedConv(null);
              setConversationDetail(null);
              setMessages([]);
              void loadConversations();
            } catch (err) {
              Alert.alert(
                "Khong the giai tan nhom",
                err instanceof Error ? err.message : "Vui long thu lai",
              );
            } finally {
              setIsMutatingConversation(false);
            }
          },
        },
      ],
    );
  }, [loadConversations, selectedConv]);

  return (
    <View className="flex-1 bg-background">
      <TopBar
        title={
          selectedConv
            ? selectedConv.name || "Cuoc tro chuyen"
            : mode === "groups"
              ? "Nhom chat"
              : "Tin nhan"
        }
        leftAction={
          selectedConv
            ? { label: "Quay lai", onPress: () => setSelectedConv(null) }
            : undefined
        }
        rightAction={
          !selectedConv ? (
            <TouchableOpacity
              className="px-3 py-1.5 rounded-full bg-primary"
              onPress={() => openCompose("group")}
            >
              <Text className="text-white text-xs font-semibold">+ Nhom</Text>
            </TouchableOpacity>
          ) : (
            <View className="flex-row items-center">
              <TouchableOpacity
                className={`w-9 h-9 rounded-full border items-center justify-center mr-2 ${
                  canStartVideoCall
                    ? "bg-primary border-primary"
                    : "bg-surface-secondary border-border"
                }`}
                onPress={() => {
                  void handleStartVideoCall();
                }}
                disabled={!canStartVideoCall}
                activeOpacity={0.8}
              >
                {isOpeningCallRoom ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Feather
                    name="video"
                    size={16}
                    color={canStartVideoCall ? "#ffffff" : "#6b7280"}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                className="w-9 h-9 rounded-full bg-surface-secondary border border-border items-center justify-center"
                onPress={() => setShowConversationMenu(true)}
                activeOpacity={0.8}
              >
                <Feather name="alert-circle" size={16} color="#374151" />
              </TouchableOpacity>
            </View>
          )
        }
      />

      {!selectedConv ? (
        <>
          <SearchBar
            value={conversationKeyword}
            onChangeText={setConversationKeyword}
            placeholder={
              mode === "groups"
                ? "Tim nhom tro chuyen..."
                : "Tim cuoc tro chuyen hoac nhom..."
            }
          />

          <FlatList
            data={conversationsForView}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <ConversationItem
                conversation={item}
                onPress={() => {
                  void openConversation(item);
                }}
              />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadConversations();
                }}
                tintColor="#0052ce"
              />
            }
            ListEmptyComponent={
              !isLoading ? (
                <EmptyState
                  icon="💬"
                  title={
                    conversationKeyword.trim().length
                      ? "Khong tim thay cuoc tro chuyen phu hop"
                      : mode === "groups"
                        ? "Chua co nhom nao"
                        : "Chua co cuoc tro chuyen nao"
                  }
                  subtitle={
                    conversationKeyword.trim().length
                      ? "Thu tu khoa khac de tim nhom hoac ban be"
                      : mode === "groups"
                        ? "Tao nhom de bat dau chat theo nhom"
                        : "Bat dau tro chuyen voi ban be!"
                  }
                />
              ) : null
            }
          />
        </>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
        >
          <FlatList
            ref={messageListRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                currentUserId={user.id}
                onLongPress={handleLongPressMessage}
                onOpenPost={onOpenPost}
              />
            )}
            onContentSizeChange={() => {
              scrollMessagesToEnd();
            }}
            contentContainerStyle={{
              paddingVertical: 12,
              paddingBottom: 8,
            }}
          />
          <View style={{ marginBottom: Platform.OS === "ios" ? 82 : 70 }}>
            <MessageInput
              value={messageText}
              onChangeText={setMessageText}
              onSend={handleSend}
              onPickImage={() => {
                void handlePickImage();
              }}
              onPickFile={() => {
                void handlePickFile();
              }}
              disabled={Boolean(
                !activeConversation?.isGroup &&
                  (activeConversation?.isBlockedByMe ||
                    activeConversation?.isBlockedMe),
              )}
              disableAttachments={isUploadingAttachment}
              placeholder={
                !activeConversation?.isGroup &&
                activeConversation?.isBlockedByMe
                  ? "Ban dang chan nguoi nay"
                  : !activeConversation?.isGroup &&
                      activeConversation?.isBlockedMe
                    ? "Ban da bi chan tin nhan"
                    : isUploadingAttachment
                      ? "Dang tai tep..."
                      : "Nhan tin..."
              }
            />
          </View>
        </KeyboardAvoidingView>
      )}

      <Modal
        visible={Boolean(outgoingCall)}
        transparent
        animationType="fade"
        onRequestClose={handleCancelOutgoingCall}
      >
        <View className="flex-1 bg-black/45 items-center justify-center px-6">
          <View className="w-full rounded-2xl bg-surface border border-border p-5">
            <View className="w-12 h-12 rounded-full bg-primary/15 items-center justify-center self-center mb-3">
              <Feather name="video" size={22} color="#0052ce" />
            </View>
            <Text className="text-base font-bold text-foreground text-center mb-1">
              Dang goi video...
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-4">
              {outgoingCall?.conversationName || "Cuoc tro chuyen"}
            </Text>

            <View className="items-center mb-4">
              <ActivityIndicator color="#0052ce" />
            </View>

            <TouchableOpacity
              className="h-11 rounded-xl border border-red-200 bg-red-50 items-center justify-center"
              onPress={handleCancelOutgoingCall}
              activeOpacity={0.85}
            >
              <Text className="text-danger font-semibold">Huy cuoc goi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(incomingCall)}
        transparent
        animationType="fade"
        onRequestClose={handleDeclineIncomingCall}
      >
        <View className="flex-1 bg-black/45 items-center justify-center px-6">
          <View className="w-full rounded-2xl bg-surface border border-border p-5">
            <View className="w-12 h-12 rounded-full bg-primary/15 items-center justify-center self-center mb-3">
              <Feather name="video" size={22} color="#0052ce" />
            </View>
            <Text className="text-base font-bold text-foreground text-center mb-1">
              Cuoc goi video den
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-5">
              {incomingCall?.payload.fromUserName || "Nguoi dung"} dang goi cho ban
            </Text>

            <View className="flex-row items-center">
              <TouchableOpacity
                className="flex-1 h-11 rounded-xl border border-red-200 bg-red-50 items-center justify-center mr-2"
                onPress={handleDeclineIncomingCall}
                activeOpacity={0.85}
              >
                <Text className="text-danger font-semibold">Tu choi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 h-11 rounded-xl bg-primary items-center justify-center ml-2"
                onPress={() => {
                  void handleAcceptIncomingCall();
                }}
                activeOpacity={0.85}
              >
                {isOpeningCallRoom ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-semibold">Nhan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ComposeConversationModal
        visible={showComposeModal}
        composeMode={composeMode}
        composeKeyword={composeKeyword}
        searchUsers={searchUsers}
        filteredFriends={filteredFriends}
        groupName={groupName}
        groupMemberIds={groupMemberIds}
        isSearchingUsers={isSearchingUsers}
        isSubmittingCompose={isSubmittingCompose}
        onClose={closeCompose}
        onChangeComposeMode={setComposeMode}
        onChangeComposeKeyword={setComposeKeyword}
        onChangeGroupName={setGroupName}
        onToggleGroupMember={toggleGroupMember}
        onCreateDirect={(targetUserId) => {
          void handleCreateDirect(targetUserId);
        }}
        onCreateGroup={() => {
          void handleCreateGroup();
        }}
      />

      <Modal
        visible={showConversationMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConversationMenu(false)}
      >
        <View className="flex-1 bg-black/35 justify-end">
          <View className="bg-surface rounded-t-3xl px-4 py-4 border-t border-border">
            <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />

            <Text className="text-foreground text-base font-bold mb-3">
              Tuy chon cuoc tro chuyen
            </Text>

            {isLoadingConversationDetail ? (
              <View className="py-3 items-center">
                <ActivityIndicator color="#0052ce" />
              </View>
            ) : null}

            {!activeConversation?.isGroup && peerUserId ? (
              <TouchableOpacity
                className="h-12 rounded-xl border border-border bg-surface-secondary px-4 mb-2 flex-row items-center"
                onPress={() => {
                  setShowConversationMenu(false);
                  onOpenUserProfile?.(peerUserId);
                }}
                activeOpacity={0.8}
              >
                <Feather name="user" size={16} color="#111827" />
                <Text className="ml-3 text-sm font-medium text-foreground">
                  Xem trang ca nhan
                </Text>
              </TouchableOpacity>
            ) : null}

            {activeConversation?.isGroup ? (
              <TouchableOpacity
                className="h-12 rounded-xl border border-border bg-surface-secondary px-4 mb-2 flex-row items-center"
                onPress={() => {
                  setShowConversationMenu(false);
                  setShowMembersModal(true);
                }}
                activeOpacity={0.8}
              >
                <Feather name="users" size={16} color="#111827" />
                <Text className="ml-3 text-sm font-medium text-foreground">
                  Xem thanh vien
                </Text>
              </TouchableOpacity>
            ) : null}

            {activeConversation?.isGroup ? (
              <TouchableOpacity
                className="h-12 rounded-xl border border-border bg-surface-secondary px-4 mb-2 flex-row items-center"
                onPress={() => {
                  void handleUpdateGroupAvatar();
                }}
                disabled={isMutatingConversation}
                activeOpacity={0.8}
              >
                <Feather name="image" size={16} color="#111827" />
                <Text className="ml-3 text-sm font-medium text-foreground">
                  Doi avatar nhom
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              className="h-12 rounded-xl border border-border bg-surface-secondary px-4 mb-2 flex-row items-center"
              onPress={() => {
                void handleToggleNotifications();
              }}
              disabled={isMutatingConversation}
              activeOpacity={0.8}
            >
              <Feather
                name={conversationNotificationsEnabled ? "bell" : "bell-off"}
                size={16}
                color="#111827"
              />
              <Text className="ml-3 text-sm font-medium text-foreground">
                {conversationNotificationsEnabled
                  ? "Tat thong bao cuoc tro chuyen"
                  : "Bat thong bao cuoc tro chuyen"}
              </Text>
            </TouchableOpacity>

            {!activeConversation?.isGroup && peerUserId ? (
              <TouchableOpacity
                className={`h-12 rounded-xl border px-4 mb-2 flex-row items-center ${
                  activeConversation?.isBlockedByMe
                    ? "border-border bg-surface-secondary"
                    : "border-red-200 bg-red-50"
                }`}
                onPress={() => {
                  void handleToggleBlockPeer();
                }}
                disabled={isMutatingConversation || Boolean(activeConversation?.isBlockedMe)}
                activeOpacity={0.8}
              >
                <Feather
                  name={activeConversation?.isBlockedByMe ? "unlock" : "slash"}
                  size={16}
                  color={activeConversation?.isBlockedByMe ? "#111827" : "#dc2626"}
                />
                <Text
                  className={`ml-3 text-sm font-medium ${
                    activeConversation?.isBlockedByMe
                      ? "text-foreground"
                      : "text-danger"
                  }`}
                >
                  {activeConversation?.isBlockedByMe ? "Bo chan tin nhan" : "Chan tin nhan"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {canLeaveGroup ? (
              <TouchableOpacity
                className="h-12 rounded-xl border border-red-200 bg-red-50 px-4 mb-2 flex-row items-center"
                onPress={handleLeaveGroup}
                disabled={isMutatingConversation}
                activeOpacity={0.8}
              >
                <Feather name="log-out" size={16} color="#dc2626" />
                <Text className="ml-3 text-sm font-medium text-danger">
                  Roi khoi nhom
                </Text>
              </TouchableOpacity>
            ) : null}

            {canDissolveGroup ? (
              <TouchableOpacity
                className="h-12 rounded-xl border border-red-200 bg-red-50 px-4 mb-2 flex-row items-center"
                onPress={handleDissolveGroup}
                disabled={isMutatingConversation}
                activeOpacity={0.8}
              >
                <Feather name="trash-2" size={16} color="#dc2626" />
                <Text className="ml-3 text-sm font-medium text-danger">
                  Giai tan nhom
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              className="h-11 rounded-xl items-center justify-center mt-2"
              onPress={() => setShowConversationMenu(false)}
              activeOpacity={0.8}
            >
              <Text className="text-sm font-semibold text-muted-foreground">Dong</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showMembersModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMembersModal(false)}
      >
        <View className="flex-1 bg-black/35 items-center justify-center px-6">
          <View className="w-full max-h-[80%] rounded-2xl bg-surface border border-border p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-foreground">
                Thanh vien nhom
              </Text>
              <TouchableOpacity onPress={() => setShowMembersModal(false)}>
                <Feather name="x" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={activeConversation?.members || []}
              keyExtractor={(item) => String(item.userId)}
              renderItem={({ item }) => (
                <View className="py-2.5 border-b border-border flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-full bg-surface-secondary items-center justify-center mr-3">
                      <Text className="text-xs text-foreground font-semibold">
                        {String(item.fullName || "U")
                          .trim()
                          .slice(0, 1)
                          .toUpperCase()}
                      </Text>
                    </View>
                    <Text className="text-sm text-foreground">{item.fullName}</Text>
                  </View>
                  {item.role ? (
                    <Text className="text-xs text-muted-foreground">{item.role}</Text>
                  ) : null}
                </View>
              )}
              ListEmptyComponent={
                <View className="py-6 items-center">
                  <Text className="text-sm text-muted-foreground">
                    Khong co thanh vien de hien thi
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
