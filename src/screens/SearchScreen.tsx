import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { TopBar } from "../components/common/TopBar";
import { EmptyState } from "../components/common/EmptyState";
import { SearchBar } from "../components/search/SearchBar";
import { UserResultItem } from "../components/search/UserResultItem";
import { PostCard } from "../components/feed/PostCard";
import { api } from "../lib/api";
import type { AuthUser, FeedPost } from "../types";

interface SearchScreenProps {
  onOpenPost?: (postId: string) => void;
  onOpenUserProfile?: (userId: number) => void;
  onOpenAIChat?: () => void;
  initialQuery?: string;
  onQueryConsumed?: () => void;
}

export function SearchScreen({
  onOpenPost,
  onOpenUserProfile,
  onOpenAIChat,
  initialQuery,
  onQueryConsumed,
}: SearchScreenProps) {
  const [keyword, setKeyword] = useState("");
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [trendingPosts, setTrendingPosts] = useState<FeedPost[]>([]);
  const [isTrendingLoading, setIsTrendingLoading] = useState(true);

  // Load trending on mount
  useEffect(() => {
    api
      .listFeed()
      .then((res) => {
        const sorted = [...(res.posts || [])].sort(
          (a, b) => (b.reactionCount ?? 0) - (a.reactionCount ?? 0),
        );
        setTrendingPosts(sorted.slice(0, 15));
      })
      .catch(() => {})
      .finally(() => setIsTrendingLoading(false));
  }, []);

  // Sync initialQuery into keyword
  useEffect(() => {
    if (initialQuery) {
      setKeyword(initialQuery);
      onQueryConsumed?.();
    }
  }, [initialQuery, onQueryConsumed]);

  const combinedResults = [
    ...users.map((user) => ({
      id: `user-${user.id}`,
      kind: "user" as const,
      user,
    })),
    ...posts.map((post) => ({
      id: `post-${post.id}`,
      kind: "post" as const,
      post,
    })),
  ];

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setUsers([]);
      setPosts([]);
      return;
    }

    setIsLoading(true);
    try {
      const query = q.trim().toLowerCase();
      const [userRes, feedRes] = await Promise.all([
        api.searchUsers(q.trim()),
        api.listFeed(),
      ]);
      setUsers((userRes.users || []).slice(0, 8));
      setPosts(
        (feedRes.posts || [])
          .filter(
            (item) =>
              String(item.authorName || "")
                .toLowerCase()
                .includes(query) ||
              String(item.content || "")
                .toLowerCase()
                .includes(query),
          )
          .slice(0, 8),
      );
    } catch {
      setUsers([]);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void handleSearch(keyword);
    }, 280);
    return () => clearTimeout(timer);
  }, [keyword, handleSearch]);

  const showTrending = keyword.length < 2;

  return (
    <View className="flex-1 bg-background">
      <TopBar
        title="Khám phá"
        rightAction={
          onOpenAIChat ? (
            <TouchableOpacity
              className="px-3 py-1.5 rounded-full bg-primary"
              activeOpacity={0.8}
              onPress={onOpenAIChat}
            >
              <Text className="text-white text-xs font-semibold">AI</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <SearchBar
        value={keyword}
        onChangeText={setKeyword}
        placeholder="Tìm người dùng, bài viết, #hashtag..."
      />

      {showTrending ? (
        isTrendingLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#0052ce" />
          </View>
        ) : trendingPosts.length === 0 ? (
          <EmptyState icon="🧭" title="Chưa có bài viết nào" subtitle="Hãy quay lại sau" />
        ) : (
          <FlatList
            data={trendingPosts}
            keyExtractor={(item) => String(item.id)}
            ListHeaderComponent={
              <View className="px-4 pt-3 pb-1">
                <Text className="text-foreground font-bold text-sm">🔥 Thịnh hành</Text>
              </View>
            }
            renderItem={({ item }) => (
              <PostCard
                post={item}
                currentUserId={0}
                onLike={() => {}}
                onComment={() => onOpenPost?.(item.id)}
                onShare={() => {}}
                onMenu={() => {}}
                onHashtagPress={(tag) => setKeyword(tag)}
              />
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        <FlatList
          data={combinedResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            item.kind === "user" ? (
              <UserResultItem
                user={item.user}
                onPress={() => onOpenUserProfile?.(item.user.id)}
              />
            ) : (
              <TouchableOpacity
                className="px-4 py-4 bg-surface border-b border-border"
                activeOpacity={0.75}
                onPress={() => onOpenPost?.(item.post.id)}
              >
                <Text className="text-primary text-xs font-semibold mb-1">
                  Bài viết • {item.post.authorName}
                </Text>
                <Text className="text-foreground text-sm" numberOfLines={2}>
                  {item.post.content || "Bài viết có media"}
                </Text>
              </TouchableOpacity>
            )
          }
          ListHeaderComponent={
            keyword.length >= 2 && combinedResults.length > 0 ? (
              <View className="px-4 pb-2 pt-1">
                <Text className="text-muted-foreground text-xs">
                  {users.length} người dùng • {posts.length} bài viết
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            keyword.length >= 2 && !isLoading ? (
              <EmptyState icon="🔍" title="Không tìm thấy kết quả" />
            ) : null
          }
        />
      )}
    </View>
  );
}
