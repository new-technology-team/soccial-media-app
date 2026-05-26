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
import { api, authStore, getSocket } from "../lib";
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
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleShare = (post: FeedPost) => {
    Alert.alert("Chia se", `Chia se bai viet cua ${post.authorName}?`);
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
          <TouchableOpacity
            className="px-3 py-1.5 rounded-full bg-red-50"
            onPress={onLogout}
          >
            <Text className="text-danger font-semibold text-xs">Thoat</Text>
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
              icon="Post"
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
    </View>
  );
}
