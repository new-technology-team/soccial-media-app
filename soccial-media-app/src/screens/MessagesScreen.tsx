import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { ConversationItem } from "../components/chat/ConversationItem";
import { MessageBubble } from "../components/chat/MessageBubble";
import { MessageInput } from "../components/chat/MessageInput";
import { EmptyState } from "../components/common/EmptyState";
import { TopBar } from "../components/common/TopBar";
import { SearchBar } from "../components/search/SearchBar";
import { api } from "../lib/api";
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
}: MessagesScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [conversationKeyword, setConversationKeyword] = useState("");

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
      setConversations(res.conversations || []);
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
      setSelectedConv(conversation);
      await loadMessages(conversation.id);
    },
    [loadMessages],
  );

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
            ? { label: "← Quay lai", onPress: () => setSelectedConv(null) }
            : undefined
        }
        rightAction={
          !selectedConv ? (
            <TouchableOpacity
              className="px-3 py-1.5 rounded-full bg-primary"
              onPress={() => openCompose(mode === "groups" ? "group" : "direct")}
            >
              <Text className="text-white text-xs font-semibold">
                {mode === "groups" ? "+ Nhom" : "+ Moi"}
              </Text>
            </TouchableOpacity>
          ) : undefined
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
              <MessageBubble message={item} currentUserId={user.id} />
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
    </View>
  );
}
