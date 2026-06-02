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
  onOpenNotifications?: () => void;
  focusPostId?: string | null;
  openCommentsPostId?: string | null;
  onRouteConsumed?: () => void;
  onHashtagPress?: (tag: string) => void;
}

type ShareFriend = {
  id: number;
  name: string;
};

export function FeedScreen({
  user,
  onLogout,
  onOpenAIChat,
  onOpenNotifications,
  focusPostId,
  openCommentsPostId,
  onRouteConsumed,
  onHashtagPress,
}: FeedScreenProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<"create" | "edit">("create");
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [hiddenPostIds, setHiddenPostIds] = useState<Record<string, boolean>>(
    {},
  );
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const previousAvatarRef = useRef<string | null | undefined>(user.avatarUrl);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
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
      setError(err instanceof Error ? err.message : "Tải bảng tin thất bại");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    api.listSavedPosts()
      .then((res) => setSavedPostIds(new Set((res.posts || []).map((p) => String(p.id)))))
      .catch(() => undefined);
  }, []);

  const handleSave = async (post: FeedPost) => {
    const isSaved = savedPostIds.has(String(post.id));
    try {
      if (isSaved) {
        await api.unsavePost(post.id);
        setSavedPostIds((prev) => { const next = new Set(prev); next.delete(String(post.id)); return next; });
      } else {
        await api.savePost(post.id);
        setSavedPostIds((prev) => new Set([...prev, String(post.id)]));
      }
    } catch {
      /* silent */
    }
  };

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

    // Backend phát các sự kiện này (emitSocialEvent broadcast toàn cục).
    socket.on("post:created", refreshFromRealtime);
    socket.on("post:updated", refreshFromRealtime);
    socket.on("post:deleted", refreshFromRealtime);
    socket.on("comment:created", refreshFromRealtime);

    return () => {
      socket.off("post:created", refreshFromRealtime);
      socket.off("post:updated", refreshFromRealtime);
      socket.off("post:deleted", refreshFromRealtime);
      socket.off("comment:created", refreshFromRealtime);
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

  const handleReact = async (post: FeedPost, type: string) => {
    try {
      const res = post.viewerReaction === type
        ? await api.unreactPost(post.id)
        : await api.reactPost(post.id, type);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? res.post : p)));
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
        name: String(friend.name || "Bạn bè"),
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
      const composed = `Chia sẻ bài viết của ${sharePost.authorName}\n${note ? `${note}\n` : ""}${sourceContent}`.trim();
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
        "Chia sẻ thất bại",
        err instanceof Error ? err.message : "Không thể chia sẻ bài viết",
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
      Alert.alert("Đã chia sẻ", "Đã gửi bài viết cho bạn bè.");
    } catch (err) {
      Alert.alert(
        "Chia sẻ thất bại",
        err instanceof Error ? err.message : "Không thể gửi bài viết",
      );
      setIsSharing(false);
    }
  };

  const handleHidePost = (post: FeedPost) => {
    setHiddenPostIds((prev) => ({ ...prev, [post.id]: true }));
    Alert.alert("Đã ẩn", "Bài viết đã được ẩn khỏi bảng tin của bạn.");
  };

  const handleReportPost = async (post: FeedPost) => {
    try {
      await api.submitReport({
        targetType: "post",
        targetId: post.id,
        reason: "Nội dung không phù hợp trên bảng tin",
        details: `Bài viết từ ${post.authorName}`,
      });
      Alert.alert("Đã báo cáo", "Cảm ơn bạn đã gửi phản hồi.");
    } catch (err) {
      Alert.alert(
        "Báo cáo thất bại",
        err instanceof Error ? err.message : "Không thể gửi báo cáo",
      );
    }
  };

  const handleDelete = async (post: FeedPost) => {
    Alert.alert("Xóa bài viết", "Bạn có chắc muốn xóa?", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deletePost(post.id);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
          } catch (err) {
            Alert.alert(
              "Xóa thất bại",
              err instanceof Error ? err.message : "Không thể xóa bài viết",
            );
          }
        },
      },
    ]);
  };

  const handleOpenPostMenu = (post: FeedPost) => {
    const isOwner = post.authorId === user.id;
    if (isOwner) {
      Alert.alert("Tùy chọn bài viết", "Chọn thao tác", [
        {
          text: "Chỉnh sửa",
          onPress: () => {
            setEditingPost(post);
            setComposerMode("edit");
            setShowComposer(true);
          },
        },
        {
          text: "Xóa",
          style: "destructive",
          onPress: () => handleDelete(post),
        },
        { text: "Hủy", style: "cancel" },
      ]);
      return;
    }

    Alert.alert("Tùy chọn bài viết", "Chọn thao tác", [
      { text: "Ẩn bài viết", onPress: () => handleHidePost(post) },
      {
        text: "Báo cáo bài viết",
        style: "destructive",
        onPress: () => {
          void handleReportPost(post);
        },
      },
      { text: "Hủy", style: "cancel" },
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
        composerMode === "edit" ? "Lưu thất bại" : "Đăng thất bại",
        err instanceof Error ? err.message : "Không thể lưu bài viết",
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
          <View className="flex-row items-center gap-2">
            {onOpenNotifications && (
              <TouchableOpacity
                className="w-10 h-10 rounded-full bg-surface-secondary border border-border items-center justify-center"
                onPress={onOpenNotifications}
                activeOpacity={0.8}
              >
                <Feather name="bell" size={16} color="#0052ce" />
              </TouchableOpacity>
            )}
            {onOpenAIChat && (
              <TouchableOpacity
                className="w-10 h-10 rounded-full bg-surface-secondary border border-border items-center justify-center"
                onPress={onOpenAIChat}
                activeOpacity={0.8}
              >
                <Feather name="cpu" size={16} color="#0052ce" />
              </TouchableOpacity>
            )}
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
            isSaved={savedPostIds.has(String(item.id))}
            onLike={() => { void handleLike(item); }}
            onReact={(type) => { void handleReact(item, type); }}
            onComment={() => handleComment(item)}
            onShare={() => { void openShareModal(item); }}
            onSave={() => { void handleSave(item); }}
            onMenu={() => handleOpenPostMenu(item)}
            onHashtagPress={onHashtagPress}
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
          visiblePosts.length > 0 ? (
            <View className="items-center py-3">
              <Text className="text-[11px] text-muted-foreground">
                Kéo xuống để làm mới bảng tin
              </Text>
            </View>
          ) : null
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
                      Bạn đang nghĩ gì?
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
              title="Chưa có bài viết nào"
              subtitle="Hãy là người đầu tiên đăng bài!"
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
              <Text className="text-base font-bold text-foreground">Chia sẻ bài viết</Text>
              <TouchableOpacity onPress={closeShareModal}>
                <Feather name="x" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <TextInput
              className="h-11 rounded-xl border border-border bg-surface-secondary px-4 text-sm text-foreground"
              value={shareNote}
              onChangeText={setShareNote}
              placeholder="Thêm lời nhắn (tùy chọn)"
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
                Chia sẻ lên trang cá nhân
              </Text>
            </TouchableOpacity>

            <Text className="text-sm text-foreground font-semibold mt-4 mb-2">
              Chia sẻ cho bạn bè
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
                    title="Chưa có bạn bè để chia sẻ"
                    subtitle="Kết bạn trước khi gửi bài viết qua tin nhắn."
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
