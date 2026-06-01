import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import type { AuthUser, Conversation, Message } from "../types";
import { MediaGalleryModal } from "../components/chat/MediaGalleryModal";
import { ComposeConversationModal } from "./messages/components";
import { useConversationCompose } from "./messages/hooks";
import type { MessagesScreenProps } from "./messages/types";

const DEFAULT_API_URL = "http://10.0.2.2:5000";
const DEFAULT_VIDEO_CALL_BASE_URL = "https://meet.jit.si";

// Bộ sticker emoji — trùng token với web (STICKER_EMOJI_TOKENS) để liên thông.
const STICKER_TOKENS: string[] = [
  "emoji:🤩", "emoji:🥰", "emoji:😂", "emoji:🥹",
  "emoji:🔥", "emoji:🎉", "emoji:🚀", "emoji:🌈",
  "emoji:👏", "emoji:🙌", "emoji:💪", "emoji:🤝",
  "emoji:✅", "emoji:❓", "emoji:💡", "emoji:📎",
];

// Sticker icon-token từ web (icon:*) → emoji gần nghĩa để hiển thị trên mobile.
const STICKER_ICON_FALLBACK: Record<string, string> = {
  "icon:smile": "🙂", "icon:smile-plus": "😄", "icon:heart": "❤️",
  "icon:sparkles": "✨", "icon:flame": "🔥", "icon:party": "🎉",
  "icon:rocket": "🚀", "icon:star": "⭐", "icon:like": "👍",
  "icon:thanks": "🤝", "icon:strong": "💪", "icon:zap": "⚡",
  "icon:badge-check": "✅", "icon:question": "❓", "icon:sticker": "🎴",
  "icon:file": "📎",
};

export function resolveStickerGlyph(token: string): string {
  const raw = String(token || "").trim();
  if (raw.startsWith("emoji:")) return raw.slice(6) || "🙂";
  if (STICKER_ICON_FALLBACK[raw]) return STICKER_ICON_FALLBACK[raw];
  return raw || "🙂";
}

type CallPayload = {
  conversationId: string;
  roomId: string;
  fromUserId: number;
  fromUserName: string;
  targetUserId?: number;
  mode?: "video";
  answeredAt?: number;
  reason?: string;
  // Liên thông với web: báo bên gọi (web đang WebRTC) chuyển sang mở Jitsi.
  useJitsi?: boolean;
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

// Fallback (cố định theo hội thoại) khi server không cấp phát phòng — vẫn hội tụ về cùng 1 phòng.
function buildCallRoomId(conversationId: string): string {
  return sanitizeRoomName(`zchat-${conversationId}`);
}

// Lấy phòng Jitsi của phiên gọi từ server (tái dùng nếu cuộc gọi đang diễn ra). Có timeout fallback.
function acquireCallRoom(
  socket: { emit: (ev: string, data: unknown, ack?: (resp: unknown) => void) => void } | null | undefined,
  conversationId: string,
): Promise<string> {
  return new Promise((resolve) => {
    const fallback = buildCallRoomId(conversationId);
    if (!socket) {
      resolve(fallback);
      return;
    }
    let done = false;
    const finish = (roomId?: string) => {
      if (done) return;
      done = true;
      resolve(roomId || fallback);
    };
    const timer = setTimeout(() => finish(), 4000);
    try {
      socket.emit("call:room:acquire", { conversationId }, (resp: unknown) => {
        clearTimeout(timer);
        finish(String((resp as { roomId?: string })?.roomId || ""));
      });
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

function resolveVideoCallUrl(roomId: string, displayName?: string): string {
  const base = String(
    process.env.EXPO_PUBLIC_VIDEO_CALL_BASE_URL || DEFAULT_VIDEO_CALL_BASE_URL,
  ).replace(/\/+$/, "");
  // Bỏ màn hình prejoin để vào thẳng phòng, hiển thị tên người dùng.
  const hash = [
    "config.prejoinConfig.enabled=false",
    "config.prejoinPageEnabled=false",
    displayName
      ? `userInfo.displayName=${encodeURIComponent(`"${displayName}"`)}`
      : "",
  ]
    .filter(Boolean)
    .join("&");
  return `${base}/${encodeURIComponent(roomId)}${hash ? `#${hash}` : ""}`;
}

function resolveConvDisplayName(
  conv: Conversation | null | undefined,
  currentUserId: number,
): string {
  if (!conv) return "Tin nhắn";
  if (conv.isGroup) return conv.name || "Nhóm chat";

  const peer = (conv.members || []).find(
    (m) => Number(m.userId) !== Number(currentUserId),
  );
  if (peer?.fullName) return peer.fullName;

  const peerP = (conv.participants || []).find(
    (p) => Number(p.userId) !== Number(currentUserId),
  );
  if (peerP?.name) return peerP.name;

  return conv.name || "Cuộc trò chuyện";
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
  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + Math.max(insets.bottom, 4);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [messageSearchKeyword, setMessageSearchKeyword] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState<Message[]>([]);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [nicknameDialog, setNicknameDialog] = useState<{
    userId: number;
    fullName: string;
  } | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameGroupInput, setRenameGroupInput] = useState("");
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberKeyword, setAddMemberKeyword] = useState("");
  const [addMemberResults, setAddMemberResults] = useState<AuthUser[]>([]);
  const [isSearchingAddMember, setIsSearchingAddMember] = useState(false);
  const [emojiPickerMessage, setEmojiPickerMessage] = useState<Message | null>(null);
  const [forwardTargetMessage, setForwardTargetMessage] = useState<Message | null>(null);
  const [isForwarding, setIsForwarding] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [actionMenuMessage, setActionMenuMessage] = useState<Message | null>(null);
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [showGallery, setShowGallery] = useState(false);
  const messageListRef = useRef<FlatList<Message> | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const activeJoinedConversationIdsRef = useRef<string[]>([]);
  const createdConversationIdsRef = useRef<Set<string>>(new Set());
  const conversationsRef = useRef<Conversation[]>([]);
  const handledMessageEventRef = useRef<Set<string>>(new Set());
  const handledIncomingBootstrapRef = useRef<number>(0);
  const pendingJitsiCleanupRef = useRef<boolean>(false);
  const callLogRef = useRef<{
    conversationId: string;
    roomId: string;
    startedAt: number;
    answeredAt: number | null;
    targetUserId?: number;
    logged: boolean;
  } | null>(null);

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
      setAiSuggestions([]);
      setConversations((prev) =>
        prev.map((item) =>
          item.id === conversation.id ? { ...item, unreadCount: 0 } : item,
        ),
      );
      await loadMessages(conversation.id);
      scrollMessagesToEnd(false);
      // Đánh dấu đã đọc trên server (reset unread thật + báo "đã xem" cho thành viên khác).
      void api.markConversationRead(conversation.id).catch(() => undefined);
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

  const openVideoCallRoom = useCallback(
    async (roomId: string, displayName?: string) => {
      const url = resolveVideoCallUrl(
        roomId,
        displayName || user.fullName || "Nguoi dung",
      );
      setIsOpeningCallRoom(true);
      // Đánh dấu để dọn modal treo khi quay lại app từ trình duyệt Jitsi.
      pendingJitsiCleanupRef.current = true;
      try {
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          throw new Error("Thiet bi khong mo duoc lien ket cuoc goi video.");
        }
        await Linking.openURL(url);
      } finally {
        setIsOpeningCallRoom(false);
      }
    },
    [user.fullName],
  );

  // Ghi lịch sử cuộc gọi — chỉ phía người khởi tạo (callLogRef được set khi bắt đầu gọi).
  const logCall = useCallback(
    (
      status:
        | "completed"
        | "missed"
        | "rejected"
        | "no_answer"
        | "cancelled"
        | "failed",
    ) => {
      const meta = callLogRef.current;
      if (!meta || meta.logged) return;
      meta.logged = true;
      const conv = conversationsRef.current.find(
        (c) => String(c.id) === meta.conversationId,
      );
      const participantIds =
        (conv?.members || [])
          .map((m: any) => Number(m.userId))
          .filter((id: number) => id > 0) ||
        (meta.targetUserId
          ? [Number(user.id), meta.targetUserId]
          : [Number(user.id)]);
      void api
        .createCall({
          conversationId: meta.conversationId,
          initiatorId: Number(user.id),
          participantIds: participantIds.length
            ? participantIds
            : [Number(user.id), ...(meta.targetUserId ? [meta.targetUserId] : [])],
          callType: "video",
          mode: conv?.isGroup ? "group" : "private",
          status,
          startedAt: meta.startedAt,
          answeredAt: meta.answeredAt,
          endedAt: Date.now(),
          durationSec: meta.answeredAt
            ? Math.max(0, Math.round((Date.now() - meta.answeredAt) / 1000))
            : 0,
          withName: conv?.name || undefined,
        })
        .catch(() => undefined);
    },
    [user.id],
  );

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
        // Hội thoại đang mở + tin của người khác → đánh dấu đã đọc ngay trên server.
        if (
          normalized.conversationId === activeConversationIdRef.current &&
          Number(normalized.senderId) !== Number(user.id)
        ) {
          void api
            .markConversationRead(normalized.conversationId, normalized.id)
            .catch(() => undefined);
        }
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

    const onMessageReaction = (payload: any) => {
      const msgPayload = payload?.message;
      if (!msgPayload) return;
      const normalized = api.mapMessage(msgPayload);
      if (!normalized.id || !normalized.conversationId) return;

      const eventKey = `reaction:${normalized.conversationId}:${normalized.id}:${JSON.stringify(normalized.reactions)}`;
      if (!markMessageEventHandled(eventKey)) return;

      const activeJoinedConversationIds = activeJoinedConversationIdsRef.current;
      const isInActiveJoinedRoom = activeJoinedConversationIds.includes(
        normalized.conversationId,
      );

      if (isInActiveJoinedRoom) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === normalized.id
              ? { ...item, reactions: normalized.reactions }
              : item,
          ),
        );
      }
    };

    const onMessageDeleted = (payload: any) => {
      const messageId = String(payload?.messageId || "");
      if (!messageId) return;
      const conversationId = String(payload?.conversationId || "");

      const eventKey = `delete:${conversationId}:${messageId}`;
      if (!markMessageEventHandled(eventKey)) return;

      const activeJoinedConversationIds = activeJoinedConversationIdsRef.current;
      const isInActiveJoinedRoom = activeJoinedConversationIds.includes(
        conversationId,
      );

      if (isInActiveJoinedRoom) {
        setMessages((prev) => prev.filter((item) => item.id !== messageId));
      }
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
      let openName = "";
      setOutgoingCall((prev) => {
        if (!prev) return prev;
        if (prev.payload.roomId !== payload.roomId) return prev;
        shouldOpen = true;
        openName = prev.conversationName || "";
        return null;
      });

      if (shouldOpen) {
        // Cuộc gọi đã được trả lời → ghi nhận đã kết nối (chỉ phía gọi).
        if (callLogRef.current && callLogRef.current.roomId === payload.roomId) {
          callLogRef.current.answeredAt = payload.answeredAt || Date.now();
        }
        socket.emit("call:join", {
          conversationId: payload.conversationId,
          callType: "video",
          mode: "private",
          micMuted: false,
          cameraOff: false,
        });
        void openVideoCallRoom(payload.roomId, openName).catch((err) => {
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

      if (outgoingStopped) {
        const rejected = payload.reason === "rejected";
        logCall(rejected ? "rejected" : "completed");
        if (rejected) {
          Alert.alert("Cuoc goi bi tu choi", "Nguoi nhan da tu choi cuoc goi.");
        }
      }
    };

    // Web/mobile từ chối nay dùng call:reject (phân biệt với call:end).
    const onCallReject = (raw: any) => {
      const roomId = String(raw?.roomId || "").trim();
      let stopped = false;
      setOutgoingCall((prev) => {
        if (!prev) return prev;
        if (roomId && prev.payload.roomId !== roomId) return prev;
        stopped = true;
        return null;
      });
      if (stopped) {
        logCall("rejected");
        Alert.alert("Cuoc goi bi tu choi", "Nguoi nhan da tu choi cuoc goi.");
      }
    };

    // Người được gọi không trực tuyến (backend phản hồi trực tiếp cho người gọi).
    const onCallUnavailable = (raw: any) => {
      const roomId = String(raw?.roomId || "").trim();
      let stopped = false;
      setOutgoingCall((prev) => {
        if (!prev) return prev;
        if (roomId && prev.payload.roomId !== roomId) return prev;
        stopped = true;
        return null;
      });
      if (stopped || !roomId) {
        logCall("no_answer");
        Alert.alert(
          "Khong the goi",
          "Nguoi dung hien khong truc tuyen.",
        );
      }
    };

    // Backend emit "message:typing" { conversationId, fromUserId, isTyping }
    const onMessageTyping = (payload: any) => {
      const fromUserId = Number(payload?.fromUserId ?? payload?.userId ?? 0);
      if (!fromUserId || fromUserId === Number(user.id)) return;
      if (String(payload?.conversationId) !== String(activeConversationIdRef.current)) return;

      const isTyping = payload?.isTyping !== false;
      setPeerIsTyping(isTyping);

      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
      if (isTyping) {
        // Tự tắt khi không nhận thêm sự kiện (tránh kẹt "Đang soạn tin...").
        peerTypingTimeoutRef.current = setTimeout(() => setPeerIsTyping(false), 4000);
      }
    };
    const onTypingStop = (payload: any) => {
      const fromUserId = Number(payload?.fromUserId ?? payload?.userId ?? 0);
      if (fromUserId && fromUserId === Number(user.id)) return;
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
      setPeerIsTyping(false);
    };

    const onMessageSeen = (payload: any) => {
      const messageId = String(payload?.messageId || "");
      const seenUserId = Number(payload?.userId || 0);
      const conversationId = String(payload?.conversationId || "");
      if (!messageId || !seenUserId) return;
      if (!activeJoinedConversationIdsRef.current.includes(conversationId)) return;
      if (seenUserId === Number(user.id)) return;
      const seenAt = payload?.seenAt ? String(payload.seenAt) : new Date().toISOString();
      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== messageId) return item;
          const readBy = Array.isArray(item.readBy) ? [...item.readBy] : [];
          if (readBy.some((r) => Number(r.userId) === seenUserId)) return item;
          readBy.push({ userId: seenUserId, at: seenAt });
          return { ...item, readBy };
        }),
      );
    };

    // Đồng bộ thay đổi nhóm do người khác thực hiện (đổi tên/role/avatar, mute…).
    const onConversationUpdated = (payload: any) => {
      const convId = String(
        payload?.conversation?.id || payload?.conversationId || "",
      );
      if (convId && convId === activeConversationIdRef.current) {
        void loadConversationDetail(convId);
      }
      void loadConversations();
    };

    // Thêm/xóa/rời thành viên.
    const onConversationMembers = (payload: any) => {
      const convId = String(
        payload?.conversationId || payload?.conversation?.id || "",
      );
      if (!convId) return;
      const removedMe =
        payload?.action === "removed" &&
        Number(payload?.userId) === Number(user.id);
      if (removedMe && convId === activeConversationIdRef.current) {
        setSelectedConv(null);
        setConversationDetail(null);
        setMessages([]);
      } else if (convId === activeConversationIdRef.current) {
        void loadConversationDetail(convId);
      }
      void loadConversations();
    };

    // Đổi biệt danh thành viên.
    const onConversationNickname = (payload: any) => {
      const convId = String(payload?.conversationId || "");
      if (convId && convId === activeConversationIdRef.current) {
        void loadConversationDetail(convId);
      }
    };

    socket.on("message:new", onMessageNew);
    socket.on("message:updated", onMessageUpdated);
    socket.on("message:reaction", onMessageReaction);
    socket.on("message:deleted", onMessageDeleted);
    socket.on("call:offer", onCallOffer);
    socket.on("call:answer", onCallAnswer);
    socket.on("call:end", onCallEnd);
    // Backend emits "call:ended" (with "d") from endActiveCallRoom — listen to both.
    socket.on("call:ended", onCallEnd);
    socket.on("call:reject", onCallReject);
    socket.on("call:unavailable", onCallUnavailable);
    socket.on("connect", onSocketConnect);
    socket.on("message:typing", onMessageTyping);
    socket.on("typing", onMessageTyping);
    socket.on("stopTyping", onTypingStop);
    socket.on("message:seen", onMessageSeen);
    socket.on("conversation:updated", onConversationUpdated);
    socket.on("conversation:members", onConversationMembers);
    socket.on("conversation:nickname", onConversationNickname);
    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("message:updated", onMessageUpdated);
      socket.off("message:reaction", onMessageReaction);
      socket.off("message:deleted", onMessageDeleted);
      socket.off("call:offer", onCallOffer);
      socket.off("call:answer", onCallAnswer);
      socket.off("call:end", onCallEnd);
      socket.off("call:ended", onCallEnd);
      socket.off("call:reject", onCallReject);
      socket.off("call:unavailable", onCallUnavailable);
      socket.off("connect", onSocketConnect);
      socket.off("message:typing", onMessageTyping);
      socket.off("typing", onMessageTyping);
      socket.off("stopTyping", onTypingStop);
      socket.off("message:seen", onMessageSeen);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("conversation:members", onConversationMembers);
      socket.off("conversation:nickname", onConversationNickname);
    };
  }, [
    loadConversationDetail,
    loadConversations,
    logCall,
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

  useEffect(() => {
    const onShow = () => {
      setIsKeyboardVisible(true);
    };
    const onHide = () => {
      setIsKeyboardVisible(false);
    };

    const showSub = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    setPeerIsTyping(false);
    if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
    };
  }, [selectedConv?.id]);

  // Cuộn xuống cuối khi bàn phím hiện ra trên Android để tin nhắn không bị che
  useEffect(() => {
    if (Platform.OS !== "android" || !isKeyboardVisible || !selectedConv) return;
    const t = setTimeout(() => scrollMessagesToEnd(false), 80);
    return () => clearTimeout(t);
  }, [isKeyboardVisible, scrollMessagesToEnd, selectedConv]);

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

  const handleMessageTextChange = useCallback(
    (text: string) => {
      setMessageText(text);
      const socket = socketRef.current;
      if (!socket || !selectedConv) return;

      if (text.trim()) {
        socket.emit("message:typing", {
          conversationId: selectedConv.id,
          isTyping: true,
        });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          socket.emit("message:typing", {
            conversationId: selectedConv.id,
            isTyping: false,
          });
        }, 2500);
      } else {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        socket.emit("message:typing", {
          conversationId: selectedConv.id,
          isTyping: false,
        });
      }
    },
    [selectedConv],
  );

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

    const replyId = replyToMessage?.id ?? undefined;
    setMessages((prev) => [...prev, optimisticMessage]);
    setMessageText("");
    setReplyToMessage(null);
    scrollMessagesToEnd();

    try {
      const res = await api.sendMessagePayload(selectedConv.id, {
        type: "text",
        text,
        ...(replyId !== undefined ? { replyToId: replyId } : {}),
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
    replyToMessage,
    scrollMessagesToEnd,
    selectedConv,
    user.fullName,
    user.id,
  ]);

  const handleGetSuggestions = useCallback(async () => {
    if (isLoadingSuggestions || !selectedConv) return;
    setIsLoadingSuggestions(true);
    try {
      const last10 = messages.slice(-10).map((m) => ({
        role: Number(m.senderId) === Number(user.id) ? "user" : "other",
        text: m.content,
      }));
      const res = await api.suggestReplies(last10, user.fullName || "Ban");
      setAiSuggestions((res.suggestions || []).slice(0, 3));
    } catch {
      setAiSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [isLoadingSuggestions, selectedConv, messages, user.id, user.fullName]);

  const handlePickImage = useCallback(async () => {
    if (!selectedConv) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Thieu quyen", "Vui long cap quyen thu vien anh.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.5,
        base64: true,
        videoMaxDuration: 120,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === "video";

      const base64 = await ensureBase64Data({
        base64: (asset as any).base64,
        uri: asset.uri,
      });
      if (!base64) {
        Alert.alert(isVideo ? "Khong the gui video" : "Khong the gui anh", "Khong doc duoc du lieu.");
        return;
      }

      const sizeLimit = isVideo ? 50 * 1024 * 1024 : 12 * 1024 * 1024;
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > sizeLimit) {
        Alert.alert(isVideo ? "Video qua lon" : "Anh qua lon", `Vui long chon ${isVideo ? "video nho hon 50MB" : "anh nho hon 12MB"}.`);
        return;
      }

      setIsUploadingAttachment(true);
      const ext = getExtensionFromMimeType(asset.mimeType);
      const defaultMime = isVideo ? "video/mp4" : "image/jpeg";
      const uploaded = await api.uploadChatFileBase64(selectedConv.id, {
        fileName: asset.fileName || `chat-${isVideo ? "video" : "image"}-${Date.now()}.${ext}`,
        contentType: asset.mimeType || defaultMime,
        base64Data: base64,
      });

      if (!uploaded.fileUrl) {
        throw new Error(`Upload ${isVideo ? "video" : "anh"} that bai`);
      }

      const replyId = replyToMessage?.id ?? undefined;
      const res = await api.sendMessagePayload(selectedConv.id, {
        type: isVideo ? "video" : "image",
        text: messageText.trim() || "",
        mediaUrl: uploaded.fileUrl,
        fileName: uploaded.fileName,
        fileSize: uploaded.size,
        meta: isVideo
          ? { duration: Number((asset as any).duration || 0) }
          : { width: Number(asset.width || 0), height: Number(asset.height || 0) },
        ...(replyId !== undefined ? { replyToId: replyId } : {}),
      });
      setMessages((prev) => {
        if (prev.some((item) => item.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      setMessageText("");
      setReplyToMessage(null);
      scrollMessagesToEnd();
    } catch (err) {
      Alert.alert(
        "Khong the gui",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsUploadingAttachment(false);
    }
  }, [messageText, replyToMessage, scrollMessagesToEnd, selectedConv]);

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
      const uploaded = await api.uploadChatFileBase64(selectedConv.id, {
        fileName: asset.name || `chat-file-${Date.now()}`,
        contentType: asset.mimeType || "application/octet-stream",
        base64Data: base64,
      });

      if (!uploaded.fileUrl) {
        throw new Error("Upload tep that bai");
      }

      const replyId = replyToMessage?.id ?? undefined;
      const res = await api.sendMessagePayload(selectedConv.id, {
        type: "file",
        text: messageText.trim() || "",
        mediaUrl: uploaded.fileUrl,
        fileName: uploaded.fileName || asset.name || "tep-dinh-kem",
        fileSize: uploaded.size || approxBytes,
        ...(replyId !== undefined ? { replyToId: replyId } : {}),
      });
      setMessages((prev) => {
        if (prev.some((item) => item.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      setMessageText("");
      setReplyToMessage(null);
      scrollMessagesToEnd();
    } catch (err) {
      Alert.alert(
        "Khong the gui tep",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsUploadingAttachment(false);
    }
  }, [messageText, replyToMessage, scrollMessagesToEnd, selectedConv]);

  // Backend accepts: "like","love","smile","wow","sad","cry","angry"
  const EMOJI_TYPE_MAP: Record<string, string> = {
    "👍": "like", "❤️": "love", "😆": "smile",
    "😮": "wow", "😢": "sad", "😡": "angry",
  };

  const handleReactMessage = useCallback(
    async (message: Message, emoji: string) => {
      setEmojiPickerMessage(null);
      
      try {
        let res;
        if (emoji === "🚫") {
          res = await api.unreactMessage(message.id);
        } else {
          const type = EMOJI_TYPE_MAP[emoji] ?? "like";
          const myExistingReaction = message.reactions?.find((r) => r.viewerReacted);

          if (myExistingReaction && myExistingReaction.type === type) {
            res = await api.unreactMessage(message.id);
          } else {
            res = await api.reactMessage(message.id, type);
          }
        }

        if (res.message?.id) {
          setMessages((prev) =>
            prev.map((item) => (item.id === res.message!.id ? res.message! : item)),
          );
        }
      } catch {
        /* silent — reaction không critical */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleForwardMessage = useCallback(
    async (targetConvId: string) => {
      if (!forwardTargetMessage) return;
      setIsForwarding(true);
      try {
        await api.forwardMessage(forwardTargetMessage.id, targetConvId);
        setForwardTargetMessage(null);
        Alert.alert("Da chuyen tiep", "Tin nhan da duoc chuyen tiep thanh cong.");
      } catch (err) {
        Alert.alert(
          "Khong the chuyen tiep",
          err instanceof Error ? err.message : "Vui long thu lai",
        );
      } finally {
        setIsForwarding(false);
      }
    },
    [forwardTargetMessage],
  );

  const handleTranslateMessage = useCallback(async (message: Message) => {
    const text = String(message.content || "").trim();
    if (!text) return;
    try {
      const result = await api.translateMessage(text, "vi");
      setTranslatedMessages((prev) => ({ ...prev, [String(message.id)]: result.translatedText }));
    } catch {
      Alert.alert("Khong the dich", "Vui long thu lai sau.");
    }
  }, []);

  const handleDeleteMessage = useCallback(async (message: Message) => {
    try {
      await api.deleteMessage(message.id);
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
    } catch (err) {
      Alert.alert("Khong the xoa", err instanceof Error ? err.message : "Vui long thu lai.");
    }
  }, []);

  const handleLongPressMessage = useCallback(
    (message: Message) => {
      if (!selectedConv || message.isRecalled) return;
      setActionMenuMessage(message);
    },
    [selectedConv],
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

    const roomId = await acquireCallRoom(socket, String(selectedConv.id));
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

    callLogRef.current = {
      conversationId: payload.conversationId,
      roomId,
      startedAt: Date.now(),
      answeredAt: null,
      targetUserId: payload.targetUserId,
      logged: false,
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
    const callName = incomingCall.conversationName;
    socket.emit("call:answer", {
      conversationId: payload.conversationId,
      roomId: payload.roomId,
      targetUserId: payload.fromUserId || undefined,
      fromUserId: user.id,
      fromUserName: user.fullName || "Nguoi dung",
      answeredAt: Date.now(),
      // Báo cho bên gọi (có thể là web đang WebRTC) chuyển sang mở Jitsi cùng phòng.
      useJitsi: true,
    });
    socket.emit("call:join", {
      conversationId: payload.conversationId,
      callType: "video",
      mode: payload.mode || "private",
      micMuted: false,
      cameraOff: false,
    });
    setIncomingCall(null);

    try {
      await openVideoCallRoom(payload.roomId, callName);
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
    const socket = socketRef.current;
    // Dùng call:reject để bên gọi phân biệt rõ "bị từ chối".
    socket?.emit("call:reject", {
      conversationId: incomingCall.payload.conversationId,
      roomId: incomingCall.payload.roomId,
      targetUserId: incomingCall.payload.fromUserId || undefined,
      fromUserId: user.id,
      fromUserName: user.fullName || "Nguoi dung",
      reason: "rejected",
    });
    setIncomingCall(null);
  }, [incomingCall, user.fullName, user.id]);

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
        reason: "no_answer",
      });
      logCall("no_answer");
      setOutgoingCall(null);
      Alert.alert("Không có phản hồi", "Người nhận chưa trả lời cuộc gọi.");
    }, 25000);

    return () => clearTimeout(timer);
  }, [emitCallEnd, logCall, outgoingCall]);

  // Khi quay lại app từ trình duyệt Jitsi: dọn modal cuộc gọi còn treo + ghi nhận đã kết thúc.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (!pendingJitsiCleanupRef.current) return;
      pendingJitsiCleanupRef.current = false;
      // Nếu cuộc gọi đã được trả lời mà chưa ghi log → ghi 'completed' với thời lượng thực.
      if (callLogRef.current?.answeredAt && !callLogRef.current.logged) {
        logCall("completed");
      }
      setOutgoingCall(null);
      setIncomingCall(null);
    });
    return () => sub.remove();
  }, [logCall]);

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
      const uploaded = await api.uploadChatFileBase64(selectedConv.id, {
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

  const handleRenameGroup = useCallback(async () => {
    if (!selectedConv || !renameGroupInput.trim()) return;
    setIsMutatingConversation(true);
    try {
      await api.renameGroupConversation(selectedConv.id, renameGroupInput.trim());
      const newName = renameGroupInput.trim();
      setSelectedConv((prev) => (prev ? { ...prev, name: newName } : prev));
      setConversations((prev) =>
        prev.map((item) =>
          item.id === selectedConv.id ? { ...item, name: newName } : item,
        ),
      );
      await loadConversationDetail(selectedConv.id);
      setShowRenameModal(false);
    } catch (err) {
      Alert.alert(
        "Khong the doi ten nhom",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsMutatingConversation(false);
    }
  }, [loadConversationDetail, renameGroupInput, selectedConv]);

  const handleSearchAddMember = useCallback(async (keyword: string) => {
    setAddMemberKeyword(keyword);
    if (!keyword.trim()) {
      setAddMemberResults([]);
      return;
    }
    setIsSearchingAddMember(true);
    try {
      const res = await api.searchUsers(keyword.trim());
      const existingIds = new Set(
        (activeConversation?.members || []).map((m) => m.userId),
      );
      setAddMemberResults(
        res.users.filter((u) => !existingIds.has(u.id) && u.id !== user.id),
      );
    } catch {
      /* silent */
    } finally {
      setIsSearchingAddMember(false);
    }
  }, [activeConversation?.members, user.id]);

  const handleAddMember = useCallback(
    async (targetUserId: number) => {
      if (!selectedConv) return;
      setIsMutatingConversation(true);
      try {
        await api.addGroupMember(selectedConv.id, targetUserId);
        await loadConversationDetail(selectedConv.id);
        setAddMemberResults((prev) => prev.filter((u) => u.id !== targetUserId));
      } catch (err) {
        Alert.alert(
          "Khong the them thanh vien",
          err instanceof Error ? err.message : "Vui long thu lai",
        );
      } finally {
        setIsMutatingConversation(false);
      }
    },
    [loadConversationDetail, selectedConv],
  );

  const handleMemberLongPress = useCallback(
    (member: { userId: number; fullName: string; role?: string }) => {
      if (!selectedConv || !activeConversation?.isGroup) return;
      const isMe = member.userId === Number(user.id);
      const amLeader = myMemberRole === "leader";
      const amDeputy = myMemberRole === "deputy";
      // Đặt biệt danh: mọi thành viên đều được (backend chỉ yêu cầu là thành viên).
      // Quản trị (phân quyền/xóa): chỉ leader/deputy.
      if (isMe) return;

      const options: Array<{
        text: string;
        style?: "cancel" | "destructive" | "default";
        onPress?: () => void;
      }> = [{ text: "Huy", style: "cancel" }];

      options.push({
        text: "Dat biet danh",
        onPress: () => {
          setNicknameInput(
            String(
              (activeConversation.members || []).find(
                (m) => Number(m.userId) === Number(member.userId),
              )?.nickname || "",
            ),
          );
          setNicknameDialog({ userId: member.userId, fullName: member.fullName });
        },
      });

      if (amLeader) {
        if (member.role !== "deputy") {
          options.push({
            text: "Phan quyen Pho nhom",
            onPress: async () => {
              try {
                await api.setGroupDeputy(selectedConv.id, member.userId);
                await loadConversationDetail(selectedConv.id);
              } catch (err) {
                Alert.alert("Loi", err instanceof Error ? err.message : "Thu lai sau");
              }
            },
          });
        } else {
          options.push({
            text: "Bo quyen Pho nhom",
            onPress: async () => {
              try {
                await api.setGroupDeputy(selectedConv.id, null);
                await loadConversationDetail(selectedConv.id);
              } catch (err) {
                Alert.alert("Loi", err instanceof Error ? err.message : "Thu lai sau");
              }
            },
          });
        }

        options.push({
          text: "Chuyen quyen truong nhom",
          onPress: () => {
            Alert.alert(
              "Chuyen quyen truong nhom",
              `Chuyen quyen truong nhom cho ${member.fullName}? Ban se tro thanh thanh vien thuong.`,
              [
                { text: "Huy", style: "cancel" },
                {
                  text: "Chuyen quyen",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await api.transferGroupLeader(selectedConv.id, member.userId);
                      await loadConversationDetail(selectedConv.id);
                    } catch (err) {
                      Alert.alert("Loi", err instanceof Error ? err.message : "Thu lai sau");
                    }
                  },
                },
              ],
            );
          },
        });
      }

      if (amLeader || amDeputy) {
        options.push({
          text: "Xoa khoi nhom",
          style: "destructive",
          onPress: async () => {
            try {
              await api.removeGroupMember(selectedConv.id, member.userId);
              await loadConversationDetail(selectedConv.id);
            } catch (err) {
              Alert.alert("Loi", err instanceof Error ? err.message : "Thu lai sau");
            }
          },
        });
      }

      Alert.alert(member.fullName, "Chon hanh dong", options);
    },
    [activeConversation, loadConversationDetail, myMemberRole, selectedConv, user.id],
  );

  const handleSaveNickname = useCallback(async () => {
    if (!selectedConv || !nicknameDialog) return;
    const value = nicknameInput.trim();
    try {
      await api.updateConversationNickname(
        selectedConv.id,
        nicknameDialog.userId,
        value ? value : null,
      );
      setNicknameDialog(null);
      setNicknameInput("");
      await loadConversationDetail(selectedConv.id);
    } catch (err) {
      Alert.alert(
        "Khong the dat biet danh",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    }
  }, [loadConversationDetail, nicknameDialog, nicknameInput, selectedConv]);

  // B2 — Tìm kiếm tin nhắn trong hội thoại (debounce qua server, dùng listMessages?q=).
  useEffect(() => {
    if (!isMessageSearchOpen || !selectedConv?.id) {
      setMessageSearchResults([]);
      return;
    }
    const keyword = messageSearchKeyword.trim();
    if (!keyword) {
      setMessageSearchResults([]);
      setIsSearchingMessages(false);
      return;
    }
    let cancelled = false;
    setIsSearchingMessages(true);
    const handle = setTimeout(() => {
      void api
        .listMessages(selectedConv.id, { q: keyword })
        .then((res) => {
          if (!cancelled) setMessageSearchResults(res.messages || []);
        })
        .catch(() => {
          if (!cancelled) setMessageSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingMessages(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [isMessageSearchOpen, messageSearchKeyword, selectedConv?.id]);

  // Đóng tìm kiếm khi đổi hội thoại.
  useEffect(() => {
    setIsMessageSearchOpen(false);
    setMessageSearchKeyword("");
    setMessageSearchResults([]);
    setShowStickerPanel(false);
  }, [selectedConv?.id]);

  const isMessageSearchActive =
    isMessageSearchOpen && messageSearchKeyword.trim().length > 0;
  const displayedMessages = isMessageSearchActive ? messageSearchResults : messages;

  // B1 — tin cuối do mình gửi đã được người khác xem (hiển thị "Đã xem").
  const lastSeenOwnMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (Number(m.senderId) !== Number(user.id)) continue;
      const readers = (m.readBy || []).filter(
        (r) => Number(r.userId) !== Number(user.id),
      );
      if (readers.length > 0) return m.id;
    }
    return null;
  }, [messages, user.id]);

  // B5 — map nickname theo userId để hiển thị tên người gửi.
  const memberNicknameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const m of activeConversation?.members || []) {
      if (m.nickname && String(m.nickname).trim()) {
        map[Number(m.userId)] = String(m.nickname).trim();
      }
    }
    return map;
  }, [activeConversation?.members]);

  const handleSendSticker = useCallback(
    async (token: string) => {
      if (!selectedConv) return;
      setShowStickerPanel(false);
      const optimisticId = `local-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const optimistic: Message = {
        id: optimisticId,
        conversationId: selectedConv.id,
        senderId: Number(user.id),
        senderName: user.fullName || "Nguoi dung",
        content: token,
        type: "sticker",
        createdAt: new Date().toISOString(),
        mediaUrl: "",
        fileName: "",
        fileSize: 0,
        meta: { sticker: token },
        isRecalled: false,
      };
      setMessages((prev) => [...prev, optimistic]);
      scrollMessagesToEnd();
      try {
        const res = await api.sendMessagePayload(selectedConv.id, {
          type: "sticker",
          text: token,
          sticker: token,
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
        Alert.alert(
          "Khong the gui sticker",
          err instanceof Error ? err.message : "Vui long thu lai",
        );
      }
    },
    [scrollMessagesToEnd, selectedConv, user.fullName, user.id],
  );

  const handleTogglePinConversation = useCallback(async () => {
    if (!selectedConv) return;
    const next = !activeConversation?.isPinned;
    setIsMutatingConversation(true);
    try {
      await api.pinConversation(selectedConv.id, next);
      setShowConversationMenu(false);
      await loadConversationDetail(selectedConv.id);
      void loadConversations();
    } catch (err) {
      Alert.alert(
        "Khong the cap nhat ghim",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    } finally {
      setIsMutatingConversation(false);
    }
  }, [activeConversation?.isPinned, loadConversationDetail, loadConversations, selectedConv]);

  const handleMuteConversation = useCallback(() => {
    if (!selectedConv) return;
    const convId = selectedConv.id;
    const applyMute = async (muted: boolean, hours: number | null) => {
      setIsMutatingConversation(true);
      try {
        const mutedUntil =
          muted && hours
            ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
            : null;
        await api.muteConversation(convId, muted, mutedUntil);
        setShowConversationMenu(false);
        await loadConversationDetail(convId);
        void loadConversations();
      } catch (err) {
        Alert.alert(
          "Khong the cap nhat tat tieng",
          err instanceof Error ? err.message : "Vui long thu lai",
        );
      } finally {
        setIsMutatingConversation(false);
      }
    };

    if (activeConversation?.isMuted) {
      void applyMute(false, null);
      return;
    }
    Alert.alert("Tat tieng hoi thoai", "Chon thoi gian tat tieng", [
      { text: "1 gio", onPress: () => void applyMute(true, 1) },
      { text: "8 gio", onPress: () => void applyMute(true, 8) },
      { text: "Vo thoi han", onPress: () => void applyMute(true, null) },
      { text: "Huy", style: "cancel" },
    ]);
  }, [activeConversation?.isMuted, loadConversationDetail, loadConversations, selectedConv]);

  const handleClearHistory = useCallback(() => {
    if (!selectedConv) return;
    const convId = selectedConv.id;
    Alert.alert(
      "Xoa lich su tro chuyen",
      "Toan bo tin nhan se bi xoa khoi phia ban (nguoi khac van thay).",
      [
        { text: "Huy", style: "cancel" },
        {
          text: "Xoa",
          style: "destructive",
          onPress: async () => {
            setIsMutatingConversation(true);
            try {
              await api.clearConversationMessages(convId);
              setMessages([]);
              setShowConversationMenu(false);
              void loadConversations();
            } catch (err) {
              Alert.alert(
                "Khong the xoa lich su",
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
            ? resolveConvDisplayName(selectedConv, user.id)
            : mode === "groups"
              ? "Nhóm chat"
              : "Tin nhắn"
        }
        subtitle={selectedConv && peerIsTyping ? "Đang soạn tin..." : undefined}
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
                className={`w-9 h-9 rounded-full border items-center justify-center mr-2 ${isMessageSearchOpen
                  ? "bg-primary border-primary"
                  : "bg-surface-secondary border-border"
                  }`}
                onPress={() => {
                  setIsMessageSearchOpen((prev) => {
                    const next = !prev;
                    if (!next) {
                      setMessageSearchKeyword("");
                      setMessageSearchResults([]);
                    }
                    return next;
                  });
                }}
                activeOpacity={0.8}
              >
                <Feather
                  name="search"
                  size={16}
                  color={isMessageSearchOpen ? "#ffffff" : "#374151"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                className={`w-9 h-9 rounded-full border items-center justify-center mr-2 ${canStartVideoCall
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

      {selectedConv && isMessageSearchOpen ? (
        <View className="flex-row items-center px-3 py-2 bg-surface border-b border-border">
          <Feather name="search" size={16} color="#6b7280" />
          <TextInput
            className="flex-1 mx-2 text-sm text-foreground"
            value={messageSearchKeyword}
            onChangeText={setMessageSearchKeyword}
            placeholder="Tim tin nhan trong hoi thoai..."
            placeholderTextColor="#9ca3af"
            autoFocus
            returnKeyType="search"
          />
          {isSearchingMessages ? (
            <ActivityIndicator size="small" color="#0052ce" />
          ) : messageSearchKeyword ? (
            <TouchableOpacity
              onPress={() => {
                setMessageSearchKeyword("");
                setMessageSearchResults([]);
              }}
              className="p-1"
            >
              <Feather name="x" size={16} color="#6b7280" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {selectedConv && (() => {
        const pinnedMessage = messages.find(m => m.isPinned);
        if (!pinnedMessage) return null;
        return (
          <TouchableOpacity 
            className="flex-row items-center px-4 py-2 bg-indigo-50 border-b border-indigo-100"
            activeOpacity={0.8}
            onPress={() => {
              const idx = messages.findIndex(m => m.id === pinnedMessage.id);
              if (idx !== -1 && messageListRef.current) {
                try {
                  messageListRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
                } catch {
                  // Ignore scroll error if item is not rendered yet
                }
              }
            }}
          >
            <Feather name="paperclip" size={14} color="#4f46e5" />
            <View className="ml-2 flex-1">
              <Text className="text-xs font-semibold text-indigo-600 mb-0.5">Tin nhan da ghim</Text>
              <Text className="text-[13px] text-foreground" numberOfLines={1}>
                {pinnedMessage.type === "image" ? "🖼 Anh" : pinnedMessage.type === "video" ? "📹 Video" : pinnedMessage.type === "file" ? "📎 Tep dinh kem" : String(pinnedMessage.content || "")}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => {
                void api.unpinMessage(pinnedMessage.id).then(() => {
                  setMessages(prev => prev.map(m => m.id === pinnedMessage.id ? {...m, isPinned: false} : m));
                }).catch(() => {});
              }} 
              className="p-1"
            >
              <Feather name="x" size={16} color="#6b7280" />
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })()}

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
                displayName={resolveConvDisplayName(item, user.id)}
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
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 90}
        >
          <FlatList
            ref={messageListRef}
            data={displayedMessages}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="interactive"
            renderItem={({ item }) => {
              let resolvedItem = item;
              const activeConv = conversationDetail || selectedConv;
              // Ưu tiên biệt danh; nếu không có thì lấy tên thật từ member khi thiếu.
              const nickname = memberNicknameMap[Number(item.senderId)];
              if (nickname) {
                resolvedItem = { ...item, senderName: nickname };
              } else if (
                activeConv &&
                (item.senderName === `Người dùng #${item.senderId}` ||
                  item.senderName.startsWith("Người dùng #") ||
                  !item.senderName)
              ) {
                const member = (activeConv.members || []).find(
                  (m) => Number(m.userId) === Number(item.senderId),
                );
                if (member?.fullName) {
                  resolvedItem = { ...item, senderName: member.fullName };
                }
              }
              return (
                <MessageBubble
                  message={resolvedItem}
                  currentUserId={user.id}
                  onLongPress={handleLongPressMessage}
                  onOpenPost={onOpenPost}
                  translatedText={translatedMessages[String(item.id)]}
                  isGroup={Boolean(activeConversation?.isGroup)}
                  showSeen={!isMessageSearchActive && item.id === lastSeenOwnMessageId}
                />
              );
            }}
            ListEmptyComponent={
              isMessageSearchActive ? (
                <View className="py-10 items-center">
                  <Text className="text-sm text-muted-foreground">
                    {isSearchingMessages
                      ? "Dang tim..."
                      : "Khong tim thay tin nhan phu hop"}
                  </Text>
                </View>
              ) : null
            }
            onContentSizeChange={() => {
              if (!isMessageSearchActive) scrollMessagesToEnd();
            }}
            contentContainerStyle={{
              paddingVertical: 12,
              paddingBottom: 12,
            }}
          />
          <View
            style={{
              marginBottom: isKeyboardVisible ? 8 : tabBarHeight,
            }}
          >
            {aiSuggestions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ paddingHorizontal: 12, paddingVertical: 8, flexGrow: 0 }}
                keyboardShouldPersistTaps="always"
              >
                {aiSuggestions.map((s, i) => (
                  <TouchableOpacity
                    key={`suggestion-${i}-${s.slice(0, 15)}`}
                    onPress={() => { setMessageText(s); setAiSuggestions([]); }}
                    style={{
                      backgroundColor: "#e0e7ff",
                      borderRadius: 99,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      marginRight: 8,
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 12, color: "#4f46e5" }}>{s}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => setAiSuggestions([])}
                  style={{ padding: 7 }}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={14} color="#9ca3af" />
                </TouchableOpacity>
              </ScrollView>
            )}
            {replyToMessage && (
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#f0f4ff", borderLeftWidth: 3, borderLeftColor: "#4f46e5", paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 8, marginBottom: 4, borderRadius: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: "#4f46e5", fontWeight: "600", marginBottom: 1 }} numberOfLines={1}>
                    {replyToMessage.senderName || "Tin nhan"}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#6b7280" }} numberOfLines={1}>
                    {replyToMessage.type === "image" ? "🖼 Anh"
                      : replyToMessage.type === "video" ? "📹 Video"
                      : replyToMessage.type === "file" ? "📎 Tep dinh kem"
                      : String(replyToMessage.content || "")}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReplyToMessage(null)} style={{ padding: 4 }} activeOpacity={0.7}>
                  <Feather name="x" size={14} color="#9ca3af" />
                </TouchableOpacity>
              </View>
            )}
            {showStickerPanel && (
              <View
                style={{
                  backgroundColor: "#f8fafc",
                  borderTopWidth: 1,
                  borderTopColor: "#e5e7eb",
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                }}
              >
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {STICKER_TOKENS.map((token) => (
                    <TouchableOpacity
                      key={token}
                      onPress={() => { void handleSendSticker(token); }}
                      style={{ width: "12.5%", alignItems: "center", paddingVertical: 8 }}
                      activeOpacity={0.6}
                    >
                      <Text style={{ fontSize: 28 }}>{resolveStickerGlyph(token)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => { void handleGetSuggestions(); }}
                disabled={isLoadingSuggestions}
                style={{ paddingHorizontal: 8, paddingVertical: 10 }}
                activeOpacity={0.7}
              >
                {isLoadingSuggestions ? (
                  <ActivityIndicator size="small" color="#0052ce" />
                ) : (
                  <Feather name="zap" size={20} color="#0052ce" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setShowStickerPanel((prev) => !prev);
                }}
                style={{ paddingHorizontal: 6, paddingVertical: 10 }}
                activeOpacity={0.7}
              >
                <Feather
                  name="smile"
                  size={20}
                  color={showStickerPanel ? "#0052ce" : "#6b7280"}
                />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <MessageInput
                  value={messageText}
                  onChangeText={handleMessageTextChange}
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
            </View>
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

      {/* Media Gallery */}
      <MediaGalleryModal
        visible={showGallery}
        conversationId={selectedConv?.id || null}
        conversationName={conversationTitle}
        onClose={() => setShowGallery(false)}
      />

      {/* Rename Group Modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View className="flex-1 bg-black/35 items-center justify-center px-6">
          <View className="w-full rounded-2xl bg-surface border border-border p-5">
            <Text className="text-base font-bold text-foreground mb-3">
              Doi ten nhom
            </Text>
            <TextInput
              className="h-11 border border-border rounded-xl px-3 text-sm text-foreground bg-surface-secondary mb-4"
              value={renameGroupInput}
              onChangeText={setRenameGroupInput}
              placeholder="Nhap ten nhom moi..."
              placeholderTextColor="#9ca3af"
              maxLength={60}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => { void handleRenameGroup(); }}
            />
            <View className="flex-row">
              <TouchableOpacity
                className="flex-1 h-11 rounded-xl border border-border items-center justify-center mr-2"
                onPress={() => setShowRenameModal(false)}
              >
                <Text className="text-sm font-semibold text-muted-foreground">Huy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 h-11 rounded-xl items-center justify-center ml-2 ${isMutatingConversation || !renameGroupInput.trim()
                  ? "bg-primary/50"
                  : "bg-primary"
                  }`}
                onPress={() => { void handleRenameGroup(); }}
                disabled={isMutatingConversation || !renameGroupInput.trim()}
                activeOpacity={0.85}
              >
                {isMutatingConversation ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-white font-semibold text-sm">Luu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Nickname Modal */}
      <Modal
        visible={Boolean(nicknameDialog)}
        transparent
        animationType="fade"
        onRequestClose={() => setNicknameDialog(null)}
      >
        <View className="flex-1 bg-black/35 items-center justify-center px-6">
          <View className="w-full rounded-2xl bg-surface border border-border p-5">
            <Text className="text-base font-bold text-foreground mb-1">
              Dat biet danh
            </Text>
            <Text className="text-xs text-muted-foreground mb-3">
              {nicknameDialog?.fullName}
            </Text>
            <TextInput
              className="h-11 border border-border rounded-xl px-3 text-sm text-foreground bg-surface-secondary mb-4"
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Nhap biet danh (de trong de xoa)..."
              placeholderTextColor="#9ca3af"
              maxLength={60}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => { void handleSaveNickname(); }}
            />
            <View className="flex-row">
              <TouchableOpacity
                className="flex-1 h-11 rounded-xl border border-border items-center justify-center mr-2"
                onPress={() => setNicknameDialog(null)}
              >
                <Text className="text-sm font-semibold text-muted-foreground">Huy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 h-11 rounded-xl items-center justify-center ml-2 bg-primary"
                onPress={() => { void handleSaveNickname(); }}
                activeOpacity={0.85}
              >
                <Text className="text-white font-semibold text-sm">Luu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Emoji Reaction Picker */}
      <Modal
        visible={Boolean(emojiPickerMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setEmojiPickerMessage(null)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 items-center justify-center"
          activeOpacity={1}
          onPress={() => setEmojiPickerMessage(null)}
        >
          <View className="bg-surface border border-border rounded-2xl px-5 py-4 flex-row">
            {(["👍", "❤️", "😆", "😮", "😢", "😡", "🚫"] as const).map((emoji) => (
              <TouchableOpacity
                key={emoji}
                className="w-11 h-11 items-center justify-center mx-1"
                onPress={() => {
                  if (emojiPickerMessage) {
                    void handleReactMessage(emojiPickerMessage, emoji);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 28 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward Message Picker */}
      <Modal
        visible={Boolean(forwardTargetMessage)}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardTargetMessage(null)}
      >
        <View className="flex-1 bg-black/35 justify-end">
          <View className="bg-surface rounded-t-3xl px-4 pt-4 pb-6 border-t border-border" style={{ maxHeight: "65%" }}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-foreground">Chuyen tiep den</Text>
              <TouchableOpacity onPress={() => setForwardTargetMessage(null)}>
                <Feather name="x" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={conversations}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const displayName = resolveConvDisplayName(item, user.id);
                return (
                <TouchableOpacity
                  className="flex-row items-center py-3 border-b border-border"
                  onPress={() => { void handleForwardMessage(item.id); }}
                  disabled={isForwarding}
                  activeOpacity={0.75}
                >
                  <View className="w-9 h-9 rounded-full bg-surface-secondary items-center justify-center mr-3">
                    <Text className="text-sm font-semibold text-foreground">
                      {String(displayName || "?").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                    {displayName}
                  </Text>
                  {isForwarding ? (
                    <ActivityIndicator size="small" color="#0052ce" />
                  ) : (
                    <Feather name="send" size={16} color="#0052ce" />
                  )}
                </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View className="py-6 items-center">
                  <Text className="text-sm text-muted-foreground">Chua co cuoc tro chuyen nao</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        visible={showAddMemberModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowAddMemberModal(false);
          setAddMemberKeyword("");
          setAddMemberResults([]);
        }}
      >
        <View className="flex-1 bg-black/35 justify-end">
          <View
            className="bg-surface rounded-t-3xl px-4 pt-4 pb-6 border-t border-border"
            style={{ maxHeight: "75%" }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-foreground">
                Them thanh vien
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddMemberModal(false);
                  setAddMemberKeyword("");
                  setAddMemberResults([]);
                }}
              >
                <Feather name="x" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <SearchBar
              value={addMemberKeyword}
              onChangeText={(text) => { void handleSearchAddMember(text); }}
              placeholder="Tim nguoi dung de them..."
            />
            {isSearchingAddMember ? (
              <View className="py-4 items-center">
                <ActivityIndicator color="#0052ce" />
              </View>
            ) : (
              <FlatList
                data={addMemberResults}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="always"
                renderItem={({ item }) => (
                  <View className="flex-row items-center py-2.5 border-b border-border">
                    <View className="w-9 h-9 rounded-full bg-surface-secondary items-center justify-center mr-3">
                      <Text className="text-sm font-semibold text-foreground">
                        {String(item.fullName || "U").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text className="flex-1 text-sm text-foreground">
                      {item.fullName}
                    </Text>
                    <TouchableOpacity
                      className="px-3 py-1.5 rounded-full bg-primary"
                      onPress={() => { void handleAddMember(item.id); }}
                      disabled={isMutatingConversation}
                      activeOpacity={0.8}
                    >
                      <Text className="text-white text-xs font-semibold">Them</Text>
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={
                  <View className="py-6 items-center">
                    <Text className="text-sm text-muted-foreground">
                      {addMemberKeyword.trim()
                        ? "Khong tim thay nguoi dung"
                        : "Nhap ten hoac email de tim..."}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

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
                  setShowConversationMenu(false);
                  setRenameGroupInput(String(activeConversation?.name || ""));
                  setShowRenameModal(true);
                }}
                activeOpacity={0.8}
              >
                <Feather name="edit-2" size={16} color="#111827" />
                <Text className="ml-3 text-sm font-medium text-foreground">
                  Doi ten nhom
                </Text>
              </TouchableOpacity>
            ) : null}

            {activeConversation?.isGroup && (myMemberRole === "leader" || myMemberRole === "deputy") ? (
              <TouchableOpacity
                className="h-12 rounded-xl border border-border bg-surface-secondary px-4 mb-2 flex-row items-center"
                onPress={() => {
                  setShowConversationMenu(false);
                  setAddMemberKeyword("");
                  setAddMemberResults([]);
                  setShowAddMemberModal(true);
                }}
                activeOpacity={0.8}
              >
                <Feather name="user-plus" size={16} color="#111827" />
                <Text className="ml-3 text-sm font-medium text-foreground">
                  Them thanh vien
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
                setShowConversationMenu(false);
                setShowGallery(true);
              }}
              activeOpacity={0.8}
            >
              <Feather name="image" size={16} color="#111827" />
              <Text className="ml-3 text-sm font-medium text-foreground">
                Anh, video va tep da chia se
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="h-12 rounded-xl border border-border bg-surface-secondary px-4 mb-2 flex-row items-center"
              onPress={() => {
                void handleTogglePinConversation();
              }}
              disabled={isMutatingConversation}
              activeOpacity={0.8}
            >
              <Feather
                name="bookmark"
                size={16}
                color={activeConversation?.isPinned ? "#0052ce" : "#111827"}
              />
              <Text className="ml-3 text-sm font-medium text-foreground">
                {activeConversation?.isPinned
                  ? "Bo ghim hoi thoai"
                  : "Ghim hoi thoai"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="h-12 rounded-xl border border-border bg-surface-secondary px-4 mb-2 flex-row items-center"
              onPress={handleMuteConversation}
              disabled={isMutatingConversation}
              activeOpacity={0.8}
            >
              <Feather
                name={activeConversation?.isMuted ? "volume-2" : "volume-x"}
                size={16}
                color="#111827"
              />
              <Text className="ml-3 text-sm font-medium text-foreground">
                {activeConversation?.isMuted ? "Bo tat tieng" : "Tat tieng hoi thoai"}
              </Text>
            </TouchableOpacity>

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

            <TouchableOpacity
              className="h-12 rounded-xl border border-border bg-surface-secondary px-4 mb-2 flex-row items-center"
              onPress={handleClearHistory}
              disabled={isMutatingConversation}
              activeOpacity={0.8}
            >
              <Feather name="trash" size={16} color="#111827" />
              <Text className="ml-3 text-sm font-medium text-foreground">
                Xoa lich su tro chuyen
              </Text>
            </TouchableOpacity>

            {!activeConversation?.isGroup && peerUserId ? (
              <TouchableOpacity
                className={`h-12 rounded-xl border px-4 mb-2 flex-row items-center ${activeConversation?.isBlockedByMe
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
                  className={`ml-3 text-sm font-medium ${activeConversation?.isBlockedByMe
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
              renderItem={({ item }) => {
                const isMe = item.userId === Number(user.id);
                return (
                  <TouchableOpacity
                    className="py-2.5 border-b border-border flex-row items-center justify-between"
                    onLongPress={() => handleMemberLongPress(item)}
                    activeOpacity={!isMe ? 0.7 : 1}
                  >
                    <View className="flex-row items-center flex-1">
                      <View className="w-8 h-8 rounded-full bg-surface-secondary items-center justify-center mr-3">
                        <Text className="text-xs text-foreground font-semibold">
                          {String(item.fullName || "U")
                            .trim()
                            .slice(0, 1)
                            .toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm text-foreground">
                          {item.nickname && item.nickname.trim()
                            ? item.nickname
                            : item.fullName}
                          {isMe ? " (ban)" : ""}
                        </Text>
                        {item.nickname && item.nickname.trim() ? (
                          <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
                            {item.fullName}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View className="flex-row items-center">
                      {item.role ? (
                        <Text className="text-xs text-muted-foreground mr-2">
                          {item.role === "leader"
                            ? "Truong nhom"
                            : item.role === "deputy"
                              ? "Pho nhom"
                              : item.role}
                        </Text>
                      ) : null}
                      {!isMe ? (
                        <Feather name="more-vertical" size={14} color="#9ca3af" />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View className="py-6 items-center">
                  <Text className="text-sm text-muted-foreground">
                    Không có thành viên để hiển thị
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(actionMenuMessage)}
        transparent
        animationType="slide"
        onRequestClose={() => setActionMenuMessage(null)}
      >
        <TouchableOpacity 
          className="flex-1 justify-end bg-black/40"
          activeOpacity={1}
          onPress={() => setActionMenuMessage(null)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            className="w-full bg-surface rounded-t-3xl pt-2 pb-8 px-4"
          >
            <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
            
            {actionMenuMessage && (() => {
              const hasText = String(actionMenuMessage.content || "").trim().length > 0;
              const isMe = actionMenuMessage.senderId === Number(user.id);
              
              return (
                <ScrollView bounces={false} showsVerticalScrollIndicator={false} className="max-h-[70vh]">
                  {hasText && (
                    <TouchableOpacity
                      className="h-14 flex-row items-center justify-between border-b border-border/50 px-2"
                      activeOpacity={0.7}
                      onPress={() => {
                        void Share.share({ message: String(actionMenuMessage.content || "") });
                        setActionMenuMessage(null);
                      }}
                    >
                      <Text className="text-[15px] text-foreground font-medium">Sao chep noi dung</Text>
                      <Feather name="copy" size={20} color="#4b5563" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    className="h-14 flex-row items-center justify-between border-b border-border/50 px-2"
                    activeOpacity={0.7}
                    onPress={() => {
                      setReplyToMessage(actionMenuMessage);
                      setActionMenuMessage(null);
                    }}
                  >
                    <Text className="text-[15px] text-foreground font-medium">Tra loi</Text>
                    <Feather name="corner-up-left" size={20} color="#4b5563" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    className="h-14 flex-row items-center justify-between border-b border-border/50 px-2"
                    activeOpacity={0.7}
                    onPress={() => {
                      setEmojiPickerMessage(actionMenuMessage);
                      setActionMenuMessage(null);
                    }}
                  >
                    <Text className="text-[15px] text-foreground font-medium">React cam xuc</Text>
                    <Feather name="smile" size={20} color="#4b5563" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    className="h-14 flex-row items-center justify-between border-b border-border/50 px-2"
                    activeOpacity={0.7}
                    onPress={() => {
                      setForwardTargetMessage(actionMenuMessage);
                      setActionMenuMessage(null);
                    }}
                  >
                    <Text className="text-[15px] text-foreground font-medium">Chuyen tiep</Text>
                    <Feather name="corner-up-right" size={20} color="#4b5563" />
                  </TouchableOpacity>

                  {hasText && (
                    <TouchableOpacity
                      className="h-14 flex-row items-center justify-between border-b border-border/50 px-2"
                      activeOpacity={0.7}
                      onPress={() => {
                        void handleTranslateMessage(actionMenuMessage);
                        setActionMenuMessage(null);
                      }}
                    >
                      <Text className="text-[15px] text-foreground font-medium">Dich tin nhan</Text>
                      <Feather name="globe" size={20} color="#4b5563" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    className="h-14 flex-row items-center justify-between border-b border-border/50 px-2"
                    activeOpacity={0.7}
                    onPress={async () => {
                      const isPinned = Boolean(actionMenuMessage.isPinned);
                      try {
                        if (isPinned) {
                          await api.unpinMessage(actionMenuMessage.id);
                          setMessages((prev) =>
                            prev.map((item) => (item.id === actionMenuMessage.id ? { ...item, isPinned: false } : item)),
                          );
                          Alert.alert("Thành công", "Đã bỏ ghim tin nhắn");
                        } else {
                          await api.pinMessage(actionMenuMessage.id);
                          setMessages((prev) =>
                            prev.map((item) => (item.id === actionMenuMessage.id ? { ...item, isPinned: true } : item)),
                          );
                          Alert.alert("Thành công", "Đã ghim tin nhắn");
                        }
                      } catch (err) {
                        Alert.alert("Lỗi", err instanceof Error ? err.message : "Thử lại sau");
                      }
                      setActionMenuMessage(null);
                    }}
                  >
                    <Text className="text-[15px] text-foreground font-medium">
                      {actionMenuMessage.isPinned ? "Bỏ ghim tin nhắn" : "Ghim tin nhắn"}
                    </Text>
                    <Feather name={actionMenuMessage.isPinned ? "slash" : "paperclip"} size={20} color="#4b5563" />
                  </TouchableOpacity>

                  {isMe && (
                    <TouchableOpacity
                      className="h-14 flex-row items-center justify-between border-b border-border/50 px-2"
                      activeOpacity={0.7}
                      onPress={async () => {
                        try {
                          const res = await api.recallMessage(actionMenuMessage.id);
                          if (res.message) {
                            setMessages((prev) =>
                              prev.map((item) => (item.id === actionMenuMessage.id ? res.message! : item)),
                            );
                          }
                        } catch (err) {
                          Alert.alert("Không thể thu hồi", err instanceof Error ? err.message : "Vui lòng thử lại");
                        }
                        setActionMenuMessage(null);
                      }}
                    >
                      <Text className="text-[15px] text-danger font-medium">Thu hồi tin nhắn</Text>
                      <Feather name="rotate-ccw" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    className="h-14 flex-row items-center justify-between px-2"
                    activeOpacity={0.7}
                    onPress={() => {
                      Alert.alert(
                        "Xóa tin nhắn?",
                        "Tin nhắn sẽ bị xóa khỏi danh sách của bạn.",
                        [
                          { text: "Hủy", style: "cancel" },
                          { 
                            text: "Xóa", 
                            style: "destructive", 
                            onPress: () => void handleDeleteMessage(actionMenuMessage) 
                          },
                        ],
                      );
                      setActionMenuMessage(null);
                    }}
                  >
                    <Text className="text-[15px] text-danger font-medium">Xóa tin nhắn</Text>
                    <Feather name="trash-2" size={20} color="#dc2626" />
                  </TouchableOpacity>
                </ScrollView>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
