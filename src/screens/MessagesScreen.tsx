import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
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
import { CallScreen } from "../components/call/CallScreen";
import { useWebRTCCall } from "../hooks/useWebRTCCall";
import { ComposeConversationModal } from "./messages/components";
import { useConversationCompose } from "./messages/hooks";
import type { MessagesScreenProps } from "./messages/types";

const DEFAULT_API_URL = "http://10.0.2.2:5000";

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
        senderName: String(payload?.senderName || "Người dùng"),
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
              content: String(payload?.content ?? "Tin nhắn đã được thu hồi"),
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
    markMessageEventHandled,
    openConversation,
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
      senderName: user.fullName || "Người dùng",
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
        "Không thể gửi tin nhắn",
        err instanceof Error ? err.message : "Vui lòng thử lại",
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
      const res = await api.suggestReplies(last10, user.fullName || "Bạn");
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
        Alert.alert("Thiếu quyền", "Vui lòng cấp quyền thư viện ảnh.");
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
        Alert.alert(isVideo ? "Không thể gửi video" : "Không thể gửi ảnh", "Không đọc được dữ liệu.");
        return;
      }

      const sizeLimit = isVideo ? 50 * 1024 * 1024 : 12 * 1024 * 1024;
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > sizeLimit) {
        Alert.alert(isVideo ? "Video quá lớn" : "Ảnh quá lớn", `Vui lòng chọn ${isVideo ? "video nhỏ hơn 50MB" : "ảnh nhỏ hơn 12MB"}.`);
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
        throw new Error(`Tải ${isVideo ? "video" : "ảnh"} lên thất bại`);
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
        "Không thể gửi",
        err instanceof Error ? err.message : "Vui lòng thử lại",
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
        Alert.alert("Không thể gửi tệp", "Không đọc được dữ liệu tệp.");
        return;
      }

      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > 15 * 1024 * 1024) {
        Alert.alert("Tệp quá lớn", "Vui lòng chọn tệp nhỏ hơn 15MB.");
        return;
      }

      setIsUploadingAttachment(true);
      const uploaded = await api.uploadChatFileBase64(selectedConv.id, {
        fileName: asset.name || `chat-file-${Date.now()}`,
        contentType: asset.mimeType || "application/octet-stream",
        base64Data: base64,
      });

      if (!uploaded.fileUrl) {
        throw new Error("Tải tệp lên thất bại");
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
        "Không thể gửi tệp",
        err instanceof Error ? err.message : "Vui lòng thử lại",
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
        Alert.alert("Đã chuyển tiếp", "Tin nhắn đã được chuyển tiếp thành công.");
      } catch (err) {
        Alert.alert(
          "Không thể chuyển tiếp",
          err instanceof Error ? err.message : "Vui lòng thử lại",
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
      Alert.alert("Không thể dịch", "Vui lòng thử lại sau.");
    }
  }, []);

  const handleDeleteMessage = useCallback(async (message: Message) => {
    try {
      await api.deleteMessage(message.id);
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
    } catch (err) {
      Alert.alert("Không thể xóa", err instanceof Error ? err.message : "Vui lòng thử lại.");
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

  const openConversationById = useCallback(
    (conversationId: string) => {
      const conv = conversationsRef.current.find(
        (item) => String(item.id) === conversationId,
      );
      if (conv) void openConversation(conv);
    },
    [openConversation],
  );

  const call = useWebRTCCall({
    user,
    conversationsRef,
    activeConversationIdRef,
    incomingCallBootstrap,
    onIncomingCallBootstrapHandled,
    onRequestOpenConversation: openConversationById,
  });

  const groupCallTargetIds = useMemo(
    () =>
      (activeConversation?.members || [])
        .map((m: any) => Number(m.userId))
        .filter((id: number) => id > 0 && id !== Number(user.id)),
    [activeConversation?.members, user.id],
  );

  const canStartCall = Boolean(
    selectedConv &&
    !directConversationBlocked &&
    !call.activeCall &&
    !call.outgoingCall &&
    !call.incomingCall,
  );

  const handleStartCall = useCallback(
    (callType: "voice" | "video") => {
      if (!selectedConv || !canStartCall) return;
      void call.startCall({
        conversationId: String(selectedConv.id),
        title: conversationTitle,
        callType,
        mode: isGroupCallConversation ? "group" : "private",
        targetUserIds: isGroupCallConversation
          ? groupCallTargetIds
          : callTargetUserId
            ? [callTargetUserId]
            : [],
      });
    },
    [
      call,
      callTargetUserId,
      canStartCall,
      conversationTitle,
      groupCallTargetIds,
      isGroupCallConversation,
      selectedConv,
    ],
  );

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
        "Không cập nhật được",
        err instanceof Error ? err.message : "Vui lòng thử lại",
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
        "Không thể cập nhật chặn tin nhắn",
        err instanceof Error ? err.message : "Vui lòng thử lại",
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
        Alert.alert("Thiếu quyền", "Vui lòng cấp quyền thư viện ảnh.");
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
        Alert.alert("Không thể đổi avatar", "Không đọc được dữ liệu ảnh.");
        return;
      }

      const approxBytes = Math.floor((asset.base64.length * 3) / 4);
      if (approxBytes > 8 * 1024 * 1024) {
        Alert.alert("Ảnh quá lớn", "Vui lòng chọn ảnh nhỏ hơn 8MB.");
        return;
      }

      setIsMutatingConversation(true);
      const uploaded = await api.uploadChatFileBase64(selectedConv.id, {
        fileName: asset.fileName || `group-avatar-${Date.now()}.jpg`,
        contentType: asset.mimeType || "image/jpeg",
        base64Data: asset.base64,
      });
      if (!uploaded.fileUrl) {
        throw new Error("Tải avatar lên thất bại");
      }

      await api.updateGroupConversationAvatar(selectedConv.id, uploaded.fileUrl);
      await loadConversationDetail(selectedConv.id);
      await loadConversations();
      setShowConversationMenu(false);
    } catch (err) {
      Alert.alert(
        "Không thể đổi avatar nhóm",
        err instanceof Error ? err.message : "Vui lòng thử lại",
      );
    } finally {
      setIsMutatingConversation(false);
    }
  }, [activeConversation?.isGroup, loadConversationDetail, loadConversations, selectedConv]);

  const handleLeaveGroup = useCallback(() => {
    if (!selectedConv) return;
    Alert.alert("Rời nhóm", "Bạn chắc chắn muốn rời nhóm?", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Rời nhóm",
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
              "Không thể rời nhóm",
              err instanceof Error ? err.message : "Vui lòng thử lại",
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
      "Giải tán nhóm",
      "Giải tán nhóm sẽ xóa cuộc trò chuyện này cho tất cả thành viên.",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Giải tán",
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
                "Không thể giải tán nhóm",
                err instanceof Error ? err.message : "Vui lòng thử lại",
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
        "Không thể đổi tên nhóm",
        err instanceof Error ? err.message : "Vui lòng thử lại",
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
          "Không thể thêm thành viên",
          err instanceof Error ? err.message : "Vui lòng thử lại",
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
      }> = [{ text: "Hủy", style: "cancel" }];

      options.push({
        text: "Đặt biệt danh",
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
            text: "Phân quyền Phó nhóm",
            onPress: async () => {
              try {
                await api.setGroupDeputy(selectedConv.id, member.userId);
                await loadConversationDetail(selectedConv.id);
              } catch (err) {
                Alert.alert("Lỗi", err instanceof Error ? err.message : "Thử lại sau");
              }
            },
          });
        } else {
          options.push({
            text: "Bỏ quyền Phó nhóm",
            onPress: async () => {
              try {
                await api.setGroupDeputy(selectedConv.id, null);
                await loadConversationDetail(selectedConv.id);
              } catch (err) {
                Alert.alert("Lỗi", err instanceof Error ? err.message : "Thử lại sau");
              }
            },
          });
        }

        options.push({
          text: "Chuyển quyền trưởng nhóm",
          onPress: () => {
            Alert.alert(
              "Chuyển quyền trưởng nhóm",
              `Chuyển quyền trưởng nhóm cho ${member.fullName}? Bạn sẽ trở thành thành viên thường.`,
              [
                { text: "Hủy", style: "cancel" },
                {
                  text: "Chuyển quyền",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await api.transferGroupLeader(selectedConv.id, member.userId);
                      await loadConversationDetail(selectedConv.id);
                    } catch (err) {
                      Alert.alert("Lỗi", err instanceof Error ? err.message : "Thử lại sau");
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
          text: "Xóa khỏi nhóm",
          style: "destructive",
          onPress: async () => {
            try {
              await api.removeGroupMember(selectedConv.id, member.userId);
              await loadConversationDetail(selectedConv.id);
            } catch (err) {
              Alert.alert("Lỗi", err instanceof Error ? err.message : "Thử lại sau");
            }
          },
        });
      }

      Alert.alert(member.fullName, "Chọn hành động", options);
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
        "Không thể đặt biệt danh",
        err instanceof Error ? err.message : "Vui lòng thử lại",
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
        senderName: user.fullName || "Người dùng",
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
          "Không thể gửi sticker",
          err instanceof Error ? err.message : "Vui lòng thử lại",
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
        "Không thể cập nhật ghim",
        err instanceof Error ? err.message : "Vui lòng thử lại",
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
          "Không thể cập nhật tắt tiếng",
          err instanceof Error ? err.message : "Vui lòng thử lại",
        );
      } finally {
        setIsMutatingConversation(false);
      }
    };

    if (activeConversation?.isMuted) {
      void applyMute(false, null);
      return;
    }
    Alert.alert("Tắt tiếng hội thoại", "Chọn thời gian tắt tiếng", [
      { text: "1 giờ", onPress: () => void applyMute(true, 1) },
      { text: "8 giờ", onPress: () => void applyMute(true, 8) },
      { text: "Vô thời hạn", onPress: () => void applyMute(true, null) },
      { text: "Hủy", style: "cancel" },
    ]);
  }, [activeConversation?.isMuted, loadConversationDetail, loadConversations, selectedConv]);

  const handleClearHistory = useCallback(() => {
    if (!selectedConv) return;
    const convId = selectedConv.id;
    Alert.alert(
      "Xóa lịch sử trò chuyện",
      "Toàn bộ tin nhắn sẽ bị xóa khỏi phía bạn (người khác vẫn thấy).",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa",
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
                "Không thể xóa lịch sử",
                err instanceof Error ? err.message : "Vui lòng thử lại",
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
            ? { label: "Quay lại", onPress: () => setSelectedConv(null) }
            : undefined
        }
        rightAction={
          !selectedConv ? (
            <TouchableOpacity
              className="px-3 py-1.5 rounded-full bg-primary"
              onPress={() => openCompose("group")}
            >
              <Text className="text-white text-xs font-semibold">+ Nhóm</Text>
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
                className={`w-9 h-9 rounded-full border items-center justify-center mr-2 ${canStartCall
                  ? "bg-primary border-primary"
                  : "bg-surface-secondary border-border"
                  }`}
                onPress={() => handleStartCall("voice")}
                disabled={!canStartCall}
                activeOpacity={0.8}
              >
                <Feather
                  name="phone"
                  size={16}
                  color={canStartCall ? "#ffffff" : "#6b7280"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                className={`w-9 h-9 rounded-full border items-center justify-center mr-2 ${canStartCall
                  ? "bg-primary border-primary"
                  : "bg-surface-secondary border-border"
                  }`}
                onPress={() => handleStartCall("video")}
                disabled={!canStartCall}
                activeOpacity={0.8}
              >
                <Feather
                  name="video"
                  size={16}
                  color={canStartCall ? "#ffffff" : "#6b7280"}
                />
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
            placeholder="Tìm tin nhắn trong hội thoại..."
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
              <Text className="text-xs font-semibold text-indigo-600 mb-0.5">Tin nhắn đã ghim</Text>
              <Text className="text-[13px] text-foreground" numberOfLines={1}>
                {pinnedMessage.type === "image" ? "🖼 Ảnh" : pinnedMessage.type === "video" ? "📹 Video" : pinnedMessage.type === "file" ? "📎 Tệp đính kèm" : String(pinnedMessage.content || "")}
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
                ? "Tìm nhóm trò chuyện..."
                : "Tìm cuộc trò chuyện hoặc nhóm..."
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
                      ? "Không tìm thấy cuộc trò chuyện phù hợp"
                      : mode === "groups"
                        ? "Chưa có nhóm nào"
                        : "Chưa có cuộc trò chuyện nào"
                  }
                  subtitle={
                    conversationKeyword.trim().length
                      ? "Thử từ khóa khác để tìm nhóm hoặc bạn bè"
                      : mode === "groups"
                        ? "Tạo nhóm để bắt đầu chat theo nhóm"
                        : "Bắt đầu trò chuyện với bạn bè!"
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
                      ? "Đang tìm..."
                      : "Không tìm thấy tin nhắn phù hợp"}
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
                    {replyToMessage.senderName || "Tin nhắn"}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#6b7280" }} numberOfLines={1}>
                    {replyToMessage.type === "image" ? "🖼 Ảnh"
                      : replyToMessage.type === "video" ? "📹 Video"
                      : replyToMessage.type === "file" ? "📎 Tệp đính kèm"
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
                      ? "Bạn đang chặn người này"
                      : !activeConversation?.isGroup &&
                        activeConversation?.isBlockedMe
                        ? "Bạn đã bị chặn tin nhắn"
                        : isUploadingAttachment
                          ? "Đang tải tệp..."
                          : "Nhắn tin..."
                  }
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <Modal
        visible={Boolean(call.outgoingCall)}
        transparent
        animationType="fade"
        onRequestClose={call.cancelOutgoing}
      >
        <View className="flex-1 bg-black/45 items-center justify-center px-6">
          <View className="w-full rounded-2xl bg-surface border border-border p-5">
            <View className="w-12 h-12 rounded-full bg-primary/15 items-center justify-center self-center mb-3">
              <Feather
                name={call.outgoingCall?.callType === "voice" ? "phone" : "video"}
                size={22}
                color="#0052ce"
              />
            </View>
            <Text className="text-base font-bold text-foreground text-center mb-1">
              {call.outgoingCall?.callType === "voice"
                ? "Đang gọi thoại..."
                : "Đang gọi video..."}
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-4">
              {call.outgoingCall?.title || "Cuộc trò chuyện"}
            </Text>

            <View className="items-center mb-4">
              <ActivityIndicator color="#0052ce" />
            </View>

            <TouchableOpacity
              className="h-11 rounded-xl border border-red-200 bg-red-50 items-center justify-center"
              onPress={call.cancelOutgoing}
              activeOpacity={0.85}
            >
              <Text className="text-danger font-semibold">Hủy cuộc gọi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(call.incomingCall)}
        transparent
        animationType="fade"
        onRequestClose={call.declineIncoming}
      >
        <View className="flex-1 bg-black/45 items-center justify-center px-6">
          <View className="w-full rounded-2xl bg-surface border border-border p-5">
            <View className="w-12 h-12 rounded-full bg-primary/15 items-center justify-center self-center mb-3">
              <Feather
                name={call.incomingCall?.callType === "voice" ? "phone" : "video"}
                size={22}
                color="#0052ce"
              />
            </View>
            <Text className="text-base font-bold text-foreground text-center mb-1">
              {call.incomingCall?.callType === "voice"
                ? "Cuộc gọi thoại đến"
                : "Cuộc gọi video đến"}
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-5">
              {call.incomingCall?.fromUserName || "Người dùng"} đang gọi cho bạn
            </Text>

            <View className="flex-row items-center">
              <TouchableOpacity
                className="flex-1 h-11 rounded-xl border border-red-200 bg-red-50 items-center justify-center mr-2"
                onPress={call.declineIncoming}
                activeOpacity={0.85}
              >
                <Text className="text-danger font-semibold">Từ chối</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 h-11 rounded-xl bg-primary items-center justify-center ml-2"
                onPress={() => {
                  void call.acceptIncoming();
                }}
                activeOpacity={0.85}
              >
                <Text className="text-white font-semibold">Nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CallScreen
        visible={call.isInCall}
        callType={call.activeCall?.callType || "video"}
        mode={call.activeCall?.mode || "private"}
        title={call.activeCall?.title || "Cuộc gọi"}
        statusText={call.statusText}
        localStream={call.localStream}
        remoteStreams={call.remoteStreams}
        remoteMedia={call.remoteMedia}
        participantNames={call.participantNames}
        micMuted={call.micMuted}
        cameraOff={call.cameraOff}
        speakerOn={call.speakerOn}
        onToggleMic={call.toggleMic}
        onToggleCamera={() => {
          void call.toggleCamera();
        }}
        onSwitchCamera={call.switchCamera}
        onToggleSpeaker={call.toggleSpeaker}
        onEnd={call.hangup}
      />

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
              Đổi tên nhóm
            </Text>
            <TextInput
              className="h-11 border border-border rounded-xl px-3 text-sm text-foreground bg-surface-secondary mb-4"
              value={renameGroupInput}
              onChangeText={setRenameGroupInput}
              placeholder="Nhập tên nhóm mới..."
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
                <Text className="text-sm font-semibold text-muted-foreground">Hủy</Text>
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
                  <Text className="text-white font-semibold text-sm">Lưu</Text>
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
              Đặt biệt danh
            </Text>
            <Text className="text-xs text-muted-foreground mb-3">
              {nicknameDialog?.fullName}
            </Text>
            <TextInput
              className="h-11 border border-border rounded-xl px-3 text-sm text-foreground bg-surface-secondary mb-4"
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Nhập biệt danh (để trống để xóa)..."
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
                <Text className="text-sm font-semibold text-muted-foreground">Hủy</Text>
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
              <Text className="text-base font-bold text-foreground">Chuyển tiếp đến</Text>
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
                  <Text className="text-sm text-muted-foreground">Chưa có cuộc trò chuyện nào</Text>
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
                Thêm thành viên
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
              placeholder="Tìm người dùng để thêm..."
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
                      <Text className="text-white text-xs font-semibold">Thêm</Text>
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={
                  <View className="py-6 items-center">
                    <Text className="text-sm text-muted-foreground">
                      {addMemberKeyword.trim()
                        ? "Không tìm thấy người dùng"
                        : "Nhập tên hoặc email để tìm..."}
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
              Tùy chọn cuộc trò chuyện
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
                  Xem trang cá nhân
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
                  Xem thành viên
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
                  Đổi tên nhóm
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
                  Thêm thành viên
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
                  Đổi avatar nhóm
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
                Ảnh, video và tệp đã chia sẻ
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
                  ? "Bỏ ghim hội thoại"
                  : "Ghim hội thoại"}
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
                {activeConversation?.isMuted ? "Bỏ tắt tiếng" : "Tắt tiếng hội thoại"}
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
                  ? "Tắt thông báo cuộc trò chuyện"
                  : "Bật thông báo cuộc trò chuyện"}
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
                Xóa lịch sử trò chuyện
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
                  {activeConversation?.isBlockedByMe ? "Bỏ chặn tin nhắn" : "Chặn tin nhắn"}
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
                  Rời khỏi nhóm
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
                  Giải tán nhóm
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              className="h-11 rounded-xl items-center justify-center mt-2"
              onPress={() => setShowConversationMenu(false)}
              activeOpacity={0.8}
            >
              <Text className="text-sm font-semibold text-muted-foreground">Đóng</Text>
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
                Thành viên nhóm
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
                          {isMe ? " (bạn)" : ""}
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
                            ? "Trưởng nhóm"
                            : item.role === "deputy"
                              ? "Phó nhóm"
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
                      <Text className="text-[15px] text-foreground font-medium">Sao chép nội dung</Text>
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
                    <Text className="text-[15px] text-foreground font-medium">Trả lời</Text>
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
                    <Text className="text-[15px] text-foreground font-medium">React cảm xúc</Text>
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
                    <Text className="text-[15px] text-foreground font-medium">Chuyển tiếp</Text>
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
                      <Text className="text-[15px] text-foreground font-medium">Dịch tin nhắn</Text>
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
