import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Avatar } from "../components/common/Avatar";
import { Card } from "../components/common/Card";
import { EmptyState } from "../components/common/EmptyState";
import { TopBar } from "../components/common/TopBar";
import { api } from "../lib/api";
import type { AuthUser, FeedPost } from "../types";

interface MyProfileScreenProps {
  user: AuthUser;
  onOpenSettings: () => void;
  onOpenPost?: (postId: string, options?: { openComments?: boolean }) => void;
}

type ProfileTab = "posts" | "shares" | "saved";

const SHARE_PREFIX = "Chia se bai viet cua ";

function isSharedPost(post: FeedPost) {
  return String(post.content || "").startsWith(SHARE_PREFIX);
}

function normalizeSharedContent(post: FeedPost) {
  const raw = String(post.content || "");
  if (!raw.startsWith(SHARE_PREFIX)) return raw;
  const parts = raw.split("\n");
  return parts.slice(1).join("\n").trim() || raw;
}

export function MyProfileScreen({
  user,
  onOpenSettings,
  onOpenPost,
}: MyProfileScreenProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [isLoading, setIsLoading] = useState(true);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [savedPosts, setSavedPosts] = useState<FeedPost[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [status, setStatus] = useState("");

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setStatus("");
    try {
      const res = await api.listUserPosts(user.id);
      setPosts(res.posts || []);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không thể tải hồ sơ");
    } finally {
      setIsLoading(false);
    }
  }, [user.id]);

  const loadSavedPosts = useCallback(async () => {
    setIsLoadingSaved(true);
    try {
      const res = await api.listSavedPosts();
      setSavedPosts(res.posts || []);
    } catch {
      /* silent */
    } finally {
      setIsLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    if (activeTab === "saved") {
      void loadSavedPosts();
    }
  }, [activeTab, loadSavedPosts]);

  const ownPosts = useMemo(
    () => posts.filter((post) => !isSharedPost(post)),
    [posts],
  );
  const sharedPosts = useMemo(
    () => posts.filter((post) => isSharedPost(post)),
    [posts],
  );

  const data = activeTab === "posts" ? ownPosts : activeTab === "shares" ? sharedPosts : savedPosts;
  const loading = activeTab === "saved" ? isLoadingSaved : isLoading;

  const TABS: { key: ProfileTab; label: string; icon: string }[] = [
    { key: "posts",  label: "Bài viết",  icon: "file-text" },
    { key: "shares", label: "Chia sẻ",   icon: "share-2" },
    { key: "saved",  label: "Đã lưu",    icon: "bookmark" },
  ];

  return (
    <View className="flex-1 bg-background">
      <TopBar
        title="Hồ sơ"
        rightAction={
          <TouchableOpacity
            className="w-10 h-10 items-center justify-center"
            activeOpacity={0.75}
            onPress={onOpenSettings}
          >
            <Feather name="settings" size={18} color="#4b5563" />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            <Card style={{ marginBottom: 12 }}>
              <View className="items-center">
                <Avatar
                  name={user.fullName}
                  avatarUrl={user.avatarUrl}
                  size="lg"
                />
                <Text className="mt-3 text-lg font-bold text-foreground">
                  {user.fullName}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {user.email || user.phone || "Tài khoản ZChat"}
                </Text>
                <View className="flex-row items-center mt-3 gap-4">
                  <Text className="text-xs text-muted-foreground">
                    Bài viết: {ownPosts.length}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Chia sẻ: {sharedPosts.length}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Đã lưu: {savedPosts.length}
                  </Text>
                </View>
              </View>
            </Card>

            <View className="rounded-2xl bg-surface border border-border p-1 flex-row mb-3">
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  className={`flex-1 h-10 rounded-xl items-center justify-center flex-row gap-1 ${activeTab === tab.key ? "bg-primary" : "bg-transparent"}`}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Feather
                    name={tab.icon as any}
                    size={12}
                    color={activeTab === tab.key ? "#ffffff" : "#6b7280"}
                  />
                  <Text
                    className={`text-xs font-semibold ${activeTab === tab.key ? "text-white" : "text-muted-foreground"}`}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {status ? (
              <View className="bg-red-50 border border-[#fecaca] rounded-xl px-4 py-3 mb-3">
                <Text className="text-danger text-sm">{status}</Text>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="mb-3 rounded-2xl bg-surface border border-border px-4 py-3"
            activeOpacity={0.8}
            onPress={() => onOpenPost?.(item.id)}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-xs text-primary font-semibold">
                {new Date(item.createdAt).toLocaleDateString("vi-VN")} ·{" "}
                {item.visibility === "private" ? "Riêng tư" : "Công khai"}
              </Text>
              <Feather name="chevron-right" size={14} color="#6b7280" />
            </View>
            <Text className="text-sm text-foreground" numberOfLines={4}>
              {activeTab === "shares"
                ? normalizeSharedContent(item) || "Bài viết chia sẻ"
                : item.content || "Bài viết có media"}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={activeTab === "shares" ? "🔁" : activeTab === "saved" ? "🔖" : "📝"}
              title={
                activeTab === "shares"
                  ? "Chưa có bài viết chia sẻ"
                  : activeTab === "saved"
                    ? "Chưa có bài viết đã lưu"
                    : "Chưa có bài viết nào"
              }
              subtitle={
                activeTab === "shares"
                  ? "Hãy chia sẻ bài viết để hiển thị ở đây."
                  : activeTab === "saved"
                    ? "Lưu bài viết từ bảng tin để xem lại sau."
                    : "Hãy đăng bài để bắt đầu hồ sơ cá nhân."
              }
            />
          ) : (
            <View className="py-8 items-center">
              <ActivityIndicator color="#0052ce" />
            </View>
          )
        }
      />
    </View>
  );
}
