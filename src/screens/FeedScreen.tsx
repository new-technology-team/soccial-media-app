import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  FlatList,
  RefreshControl,
  Alert,
  Text,
  TouchableOpacity,
} from "react-native";
import { TopBar } from "../components/common/TopBar";
import { Card } from "../components/common/Card";
import { EmptyState } from "../components/common/EmptyState";
import { Avatar } from "../components/common/Avatar";
import { PostCard } from "../components/feed/PostCard";
import { PostComposer } from "../components/feed/PostComposer";
import { PostCommentsScreen } from "../components/feed/PostCommentsScreen";
import { api } from "../lib/api";
import type { AuthUser, FeedPost } from "../types";

interface FeedScreenProps {
  user: AuthUser;
  onLogout: () => void;
  focusPostId?: string | null;
  openCommentsPostId?: string | null;
  onRouteConsumed?: () => void;
}

export function FeedScreen({
  user,
  onLogout,
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

  const commentsPost = commentsPostId
    ? posts.find((item) => item.id === commentsPostId) || null
    : null;

  const visiblePosts = posts.filter((item) => !hiddenPostIds[item.id]);

  const loadFeed = useCallback(async () => {
    try {
      const res = await api.listFeed();
      setPosts(res.posts || []);
    } catch (err) {
      console.error("Failed to load feed", err);
      setError(err instanceof Error ? err.message : "Tải bảng tin thất bại");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (previousAvatarRef.current === user.avatarUrl) return;
    previousAvatarRef.current = user.avatarUrl;
    void loadFeed();
  }, [user.avatarUrl, loadFeed]);

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

  const handleShare = (post: FeedPost) => {
    Alert.alert("Chia sẻ", `Chia sẻ bài viết của ${post.authorName}?`);
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
      // Keep UI responsive (optimistic update) and refresh in background for sync.
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
          <TouchableOpacity
            className="px-3 py-1.5 rounded-full bg-red-50"
            onPress={onLogout}
          >
            <Text className="text-danger font-semibold text-xs">Thoát</Text>
          </TouchableOpacity>
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
            onShare={() => handleShare(item)}
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
                Đang tải lại bảng tin...
              </Text>
            </View>
          ) : (
            <View className="items-center py-3">
              <Text className="text-[11px] text-muted-foreground">
                Cuộn xuống cuối để tải lại bài viết mới
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
          <>
            {/* Composer */}
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

            {/* Error */}
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
    </View>
  );
}
