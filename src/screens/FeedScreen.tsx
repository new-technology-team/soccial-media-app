import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "../components/common/TopBar";
import { Card } from "../components/common/Card";
import { EmptyState } from "../components/common/EmptyState";
import { Avatar } from "../components/common/Avatar";
import { PostCard } from "../components/feed/PostCard";
import { PostComposer } from "../components/feed/PostComposer";
import { PostCommentsScreen } from "../components/feed/PostCommentsScreen";
import { api, authStore, getSocket } from "../lib";
import type { AuthUser, FeedPost } from "../types";

interface FeedScreenProps {
  user: AuthUser;
  onLogout: () => void;
  onOpenAIChat?: () => void;
  focusPostId?: string | null;
  openCommentsPostId?: string | null;
  onRouteConsumed?: () => void;
}

type ShareFriend = {
  id: number;
  name: string;
};

export function FeedScreen({
  user,
  onLogout,
  onOpenAIChat,
  focusPostId,
  openCommentsPostId,
  onRouteConsumed,
}: FeedScreenProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<"create" | "edit">("create");
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const isLoadingMore = false;
  const [hiddenPostIds, setHiddenPostIds] = useState<Record<string, boolean>>(
    {},
  );
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const previousAvatarRef = useRef<string | null | undefined>(user.avatarUrl);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const [shareNote, setShareNote] = useState("");
  const [shareFriends, setShareFriends] = useState<ShareFriend[]>([]);
  const [isLoadingShareFriends, setIsLoadingShareFriends] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const commentsPost = commentsPostId
    ? posts.find((item) => item.id === commentsPostId) || null
    : null;

  const visiblePosts = posts.filter((item) => !hiddenPostIds[item.id]);

  const loadFeed = useCallback(async () => {
    try {
      setError("");
      const res = await api.listFeed();
      setPosts(res.posts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tai bang tin that bai");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (previousAvatarRef.current === user.avatarUrl) return;
    previousAvatarRef.current = user.avatarUrl;
    void loadFeed();
  }, [user.avatarUrl, loadFeed]);

  useEffect(() => {
    const token = authStore.getTokens()?.accessToken;
    if (!token) return;

    const socket = getSocket(token);
    socket.emit("join-feed");

    const refreshFromRealtime = () => {
      if (realtimeRefreshTimerRef.current) return;
      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        void loadFeed();
      }, 450);
    };

    socket.on("post:new", refreshFromRealtime);
    socket.on("comment:new", refreshFromRealtime);

    return () => {
      socket.off("post:new", refreshFromRealtime);
      socket.off("comment:new", refreshFromRealtime);
      socket.emit("leave-feed");
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
    };
  }, [loadFeed]);

  useEffect(() => {
    const targetPostId = openCommentsPostId || focusPostId;
    if (!targetPostId) return;

    let existed = false;
    setPosts((prev) => {
      const found = prev.find((item) => item.id === targetPostId);
      existed = Boolean(found);
      if (!found) return prev;
      return [found, ...prev.filter((item) => item.id !== targetPostId)];
    });

    if (!existed) {
      void api
        .getPost(targetPostId)
        .then((res) => {
          setPosts((prev) => [
            res.post,
            ...prev.filter((item) => item.id !== res.post.id),
          ]);
        })
        .catch(() => {
          /* silent */
        });
    }

    if (openCommentsPostId) {
      setCommentsPostId(openCommentsPostId);
    }

    onRouteConsumed?.();
  }, [focusPostId, openCommentsPostId, onRouteConsumed]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadFeed();
  };

  const handleLike = async (post: FeedPost) => {
    try {
      if (post.viewerReaction) {
        const res = await api.unreactPost(post.id);
        setPosts((prev) => prev.map((p) => (p.id === post.id ? res.post : p)));
      } else {
        const res = await api.reactPost(post.id, "like");
        setPosts((prev) => prev.map((p) => (p.id === post.id ? res.post : p)));
      }
    } catch {
      /* silent */
    }
  };

  const handleComment = (post: FeedPost) => {
    setCommentsPostId(post.id);
  };

  const openShareModal = async (post: FeedPost) => {
    setSharePost(post);
    setShareNote("");
    setIsLoadingShareFriends(true);
    try {
      const res = await api.listFriends();
      setShareFriends((res.friends || []).map((friend) => ({
        id: Number(friend.id),
        name: String(friend.name || "Ban be"),
      })));
    } catch {
      setShareFriends([]);
    } finally {
      setIsLoadingShareFriends(false);
    }
  };

  const closeShareModal = () => {
    setSharePost(null);
    setShareNote("");
    setShareFriends([]);
    setIsSharing(false);
  };

  const shareToProfile = async () => {
    if (!sharePost) return;
    setIsSharing(true);
    try {
      const note = shareNote.trim();
      const sourceContent = sharePost.content || "";
      const composed = `Chia se bai viet cua ${sharePost.authorName}\n${note ? `${note}\n` : ""}${sourceContent}`.trim();
      const res = await api.createPost({
        content: composed || undefined,
        mediaUrl: sharePost.mediaUrl || undefined,
        visibility: "public",
      });
      setPosts((prev) => [res.post, ...prev]);
      closeShareModal();
      void loadFeed();
    } catch (err) {
      Alert.alert(
        "Chia se that bai",
        err instanceof Error ? err.message : "Khong the chia se bai viet",
      );
      setIsSharing(false);
    }
  };

  const shareToFriend = async (friendId: number) => {
    if (!sharePost) return;
    setIsSharing(true);
    try {
      const direct = await api.createDirectConversation(friendId);
      await api.sendSharedPostMessage(direct.conversation.id, {
        text: shareNote.trim(),
        postId: sharePost.id,
        postAuthor: sharePost.authorName,
        postContent: sharePost.content,
        postMediaUrl: sharePost.mediaUrl || "",
      });
      closeShareModal();
      Alert.alert("Da chia se", "Da gui bai viet cho ban be.");
    } catch (err) {
      Alert.alert(
        "Chia se that bai",
        err instanceof Error ? err.message : "Khong the gui bai viet",
      );
      setIsSharing(false);
    }
  };

  const handleHidePost = (post: FeedPost) => {
    setHiddenPostIds((prev) => ({ ...prev, [post.id]: true }));
    Alert.alert("Da an", "Bai viet da duoc an khoi bang tin cua ban.");
  };

  const handleReportPost = async (post: FeedPost) => {
    try {
      await api.submitReport({
        targetType: "post",
        targetId: post.id,
        reason: "Noi dung khong phu hop tren bang tin",
        details: `Bai viet tu ${post.authorName}`,
      });
      Alert.alert("Da bao cao", "Cam on ban da gui phan hoi.");
    } catch (err) {
      Alert.alert(
        "Bao cao that bai",
        err instanceof Error ? err.message : "Khong the gui bao cao",
      );
    }
  };

  const handleDelete = async (post: FeedPost) => {
    Alert.alert("Xoa bai viet", "Ban co chac muon xoa?", [
      { text: "Huy", style: "cancel" },
      {
        text: "Xoa",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deletePost(post.id);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
          } catch (err) {
            Alert.alert(
              "Xoa that bai",
              err instanceof Error ? err.message : "Khong the xoa bai viet",
            );
          }
        },
      },
    ]);
  };

  const handleOpenPostMenu = (post: FeedPost) => {
    const isOwner = post.authorId === user.id;
    if (isOwner) {
      Alert.alert("Tuy chon bai viet", "Chon thao tac", [
        {
          text: "Chinh sua",
          onPress: () => {
            setEditingPost(post);
            setComposerMode("edit");
            setShowComposer(true);
          },
        },
        {
          text: "Xoa",
          style: "destructive",
          onPress: () => handleDelete(post),
        },
        { text: "Huy", style: "cancel" },
      ]);
      return;
    }

    Alert.alert("Tuy chon bai viet", "Chon thao tac", [
      { text: "An bai viet", onPress: () => handleHidePost(post) },
      {
        text: "Bao cao bai viet",
        style: "destructive",
        onPress: () => {
          void handleReportPost(post);
        },
      },
      { text: "Huy", style: "cancel" },
    ]);
  };

  const handlePost = async (payload: {
    content?: string;
    mediaUrl?: string;
    visibility: "public" | "private";
  }) => {
    try {
      if (composerMode === "edit" && editingPost) {
        const res = await api.updatePost(editingPost.id, payload);
        setPosts((prev) =>
          prev.map((item) => (item.id === editingPost.id ? res.post : item)),
        );
      } else {
        const res = await api.createPost(payload);
        setPosts((prev) => [res.post, ...prev]);
      }
      void loadFeed();
      setEditingPost(null);
      setComposerMode("create");
    } catch (err) {
      Alert.alert(
        composerMode === "edit" ? "Luu that bai" : "Dang that bai",
        err instanceof Error ? err.message : "Khong the luu bai viet",
      );
      throw err;
    }
  };

  if (commentsPostId) {
    return (
      <PostCommentsScreen
        postId={commentsPostId}
        post={commentsPost}
        currentUserId={user.id}
        onBack={() => setCommentsPostId(null)}
        onCommentAdded={loadFeed}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <TopBar
        title="ZChat"
        rightAction={
          <View className="flex-row items-center">
            <TouchableOpacity
              className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center mr-2"
              onPress={onOpenAIChat}
              activeOpacity={0.8}
            >
              <Feather name="cpu" size={14} color="#0052ce" />
            </TouchableOpacity>
            <TouchableOpacity
              className="px-3 py-1.5 rounded-full bg-red-50"
              onPress={onLogout}
            >
              <Text className="text-danger font-semibold text-xs">Thoat</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <FlatList
        data={visiblePosts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            currentUserId={user.id}
            onLike={() => handleLike(item)}
            onComment={() => handleComment(item)}
            onShare={() => {
              void openShareModal(item);
            }}
            onMenu={() => handleOpenPostMenu(item)}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#0052ce"
          />
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View className="items-center py-4">
              <Text className="text-xs text-muted-foreground">
                Dang tai lai bang tin...
              </Text>
            </View>
          ) : (
            <View className="items-center py-3">
              <Text className="text-[11px] text-muted-foreground">
                Cuon xuong cuoi de tai lai bai viet moi
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
          <>
            <TouchableOpacity
              className="mb-3"
              onPress={() => {
                setComposerMode("create");
                setEditingPost(null);
                setShowComposer(true);
              }}
            >
              <Card>
                <View className="flex-row items-center">
                  <Avatar
                    name={user.fullName}
                    avatarUrl={user.avatarUrl}
                    size="md"
                  />
                  <View className="flex-1 ml-4">
                    <Text className="text-muted-foreground text-sm bg-surface-secondary rounded-full px-4 py-2.5">
                      Ban dang nghi gi?
                    </Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>

            {error ? (
              <View className="bg-red-50 border border-[#fecaca] rounded-xl px-4 py-3 mb-3">
                <Text className="text-danger text-sm font-medium">{error}</Text>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="📝"
              title="Chua co bai viet nao"
              subtitle="Hay la nguoi dau tien dang bai!"
            />
          ) : null
        }
      />

      <PostComposer
        visible={showComposer}
        userName={user.fullName}
        mode={composerMode}
        initialValue={
          editingPost
            ? {
                content: editingPost.content,
                mediaUrl: editingPost.mediaUrl,
                visibility: editingPost.visibility,
              }
            : undefined
        }
        onClose={() => {
          setShowComposer(false);
          setEditingPost(null);
          setComposerMode("create");
        }}
        onPost={handlePost}
      />

      <Modal
        visible={Boolean(sharePost)}
        transparent
        animationType="slide"
        onRequestClose={closeShareModal}
      >
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-surface rounded-t-3xl p-4 pb-6 max-h-[85%]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-foreground">Chia se bai viet</Text>
              <TouchableOpacity onPress={closeShareModal}>
                <Feather name="x" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <TextInput
              className="h-11 rounded-xl border border-border bg-surface-secondary px-4 text-sm text-foreground"
              value={shareNote}
              onChangeText={setShareNote}
              placeholder="Them loi nhan (tuy chon)"
              placeholderTextColor="#7e8592"
            />

            <TouchableOpacity
              className={`mt-3 rounded-xl py-3 items-center ${isSharing ? "bg-primary/60" : "bg-primary"}`}
              disabled={isSharing}
              onPress={() => {
                void shareToProfile();
              }}
            >
              <Text className="text-white font-semibold text-sm">
                Chia se len trang ca nhan
              </Text>
            </TouchableOpacity>

            <Text className="text-sm text-foreground font-semibold mt-4 mb-2">
              Chia se cho ban be
            </Text>

            {isLoadingShareFriends ? (
              <View className="py-5 items-center">
                <ActivityIndicator color="#0052ce" />
              </View>
            ) : (
              <FlatList
                data={shareFriends}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    className="px-3 py-3 rounded-xl border border-border bg-surface-secondary mb-2 flex-row items-center justify-between"
                    disabled={isSharing}
                    onPress={() => {
                      void shareToFriend(item.id);
                    }}
                  >
                    <Text className="text-sm text-foreground font-medium">
                      {item.name}
                    </Text>
                    <Feather name="send" size={14} color="#0052ce" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <EmptyState
                    icon="👥"
                    title="Chua co ban be de chia se"
                    subtitle="Ket ban truoc khi gui bai viet qua tin nhan."
                  />
                }
                style={{ maxHeight: 220 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
