import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

export function MessagesScreen({
  user,
  mode = "all",
  initialDirectUserId,
  initialDirectRouteKey,
  onInitialDirectHandled,
  onOpenUserProfile,
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
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const createdConversationIdsRef = useRef<Set<string>>(new Set());

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
    } catch {
      /* silent */
    }
  }, []);

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
    },
    [loadMessages],
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

  useEffect(() => {
    const token = authStore.getTokens()?.accessToken;
    if (!token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    const onMessageNew = (payload: any) => {
      const normalized: Message = {
        id: String(payload?.id || ""),
        conversationId: String(payload?.conversationId || ""),
        senderId: Number(payload?.senderId || 0),
        senderName: String(payload?.senderName || "Nguoi dung"),
        content: String(payload?.content ?? payload?.text ?? ""),
        createdAt: String(payload?.createdAt || new Date().toISOString()),
        isRecalled: Boolean(payload?.isRecalled),
      };

      if (!normalized.id || !normalized.conversationId) return;

      if (activeConversationIdRef.current === normalized.conversationId) {
        setMessages((prev) => {
          if (prev.some((item) => item.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      }

      setConversations((prev) => {
        const target = prev.find((item) => item.id === normalized.conversationId);
        if (!target) {
          void loadConversations();
          return prev;
        }

        const nextUnread =
          activeConversationIdRef.current === normalized.conversationId
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
                isRecalled: Boolean(payload?.isRecalled ?? true),
              }
            : item,
        ),
      );
    };

    socket.on("message:new", onMessageNew);
    socket.on("message:updated", onMessageUpdated);
    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("message:updated", onMessageUpdated);
    };
  }, [loadConversations, user.id]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const previousId = activeConversationIdRef.current;
    const nextId = selectedConv?.id || null;

    if (previousId && previousId !== nextId) {
      socket.emit("leave-conversation", previousId);
    }
    if (nextId && previousId !== nextId) {
      socket.emit("join-conversation", nextId);
    }

    activeConversationIdRef.current = nextId;
  }, [selectedConv?.id]);

  useEffect(() => {
    if (!selectedConv?.id) {
      setConversationDetail(null);
      setShowConversationMenu(false);
      setShowMembersModal(false);
      return;
    }
    void loadConversationDetail(selectedConv.id);
  }, [loadConversationDetail, selectedConv?.id]);

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
    if (!messageText.trim() || !selectedConv) return;
    try {
      const res = await api.sendMessage(selectedConv.id, messageText.trim());
      setMessages((prev) => [...prev, res.message]);
      setMessageText("");
    } catch (err) {
      Alert.alert(
        "Khong the gui tin nhan",
        err instanceof Error ? err.message : "Vui long thu lai",
      );
    }
  }, [messageText, selectedConv]);

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
    if (!activeConversation || activeConversation.isGroup) return null;
    if (typeof activeConversation.directPeerId === "number") {
      return activeConversation.directPeerId;
    }
    const directPeer = (activeConversation.participants || []).find(
      (item) => Number(item.userId) !== Number(user.id),
    );
    return directPeer ? Number(directPeer.userId) : null;
  }, [activeConversation, user.id]);

  const conversationNotificationsEnabled = Boolean(
    activeConversation?.viewerSettings?.notificationsEnabled ?? true,
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
            <TouchableOpacity
              className="w-9 h-9 rounded-full bg-surface-secondary border border-border items-center justify-center"
              onPress={() => setShowConversationMenu(true)}
              activeOpacity={0.8}
            >
              <Feather name="alert-circle" size={16} color="#374151" />
            </TouchableOpacity>
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
        <View className="flex-1">
          <FlatList
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                currentUserId={user.id}
                onLongPress={handleLongPressMessage}
              />
            )}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "flex-end",
              paddingVertical: 12,
            }}
          />
          <View style={{ marginBottom: 70 }}>
            <MessageInput
              value={messageText}
              onChangeText={setMessageText}
              onSend={handleSend}
              disabled={Boolean(
                !activeConversation?.isGroup &&
                  (activeConversation?.isBlockedByMe ||
                    activeConversation?.isBlockedMe),
              )}
              placeholder={
                !activeConversation?.isGroup &&
                activeConversation?.isBlockedByMe
                  ? "Ban dang chan nguoi nay"
                  : !activeConversation?.isGroup &&
                      activeConversation?.isBlockedMe
                    ? "Ban da bi chan tin nhan"
                    : "Nhan tin..."
              }
            />
          </View>
        </View>
      )}

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
