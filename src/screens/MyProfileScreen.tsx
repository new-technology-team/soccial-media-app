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

type ProfileTab = "posts" | "shares";

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
  const [status, setStatus] = useState("");

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setStatus("");
    try {
      const res = await api.listUserPosts(user.id);
      setPosts(res.posts || []);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Khong the tai ho so");
    } finally {
      setIsLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const ownPosts = useMemo(
    () => posts.filter((post) => !isSharedPost(post)),
    [posts],
  );
  const sharedPosts = useMemo(
    () => posts.filter((post) => isSharedPost(post)),
    [posts],
  );

  const data = activeTab === "posts" ? ownPosts : sharedPosts;

  return (
    <View className="flex-1 bg-background">
      <TopBar
        title="Ho so"
        rightAction={
          <TouchableOpacity
            className="w-10 h-10 items-end justify-center"
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
                  {user.email || user.phone || "Tai khoan ZChat"}
                </Text>
                <View className="flex-row items-center mt-3">
                  <Text className="text-xs text-muted-foreground mr-4">
                    Bai viet: {ownPosts.length}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Da chia se: {sharedPosts.length}
                  </Text>
                </View>
              </View>
            </Card>

            <View className="rounded-2xl bg-surface border border-border p-1 flex-row mb-3">
              <TouchableOpacity
                className={`flex-1 h-10 rounded-xl items-center justify-center ${activeTab === "posts" ? "bg-primary" : "bg-transparent"}`}
                onPress={() => setActiveTab("posts")}
              >
                <Text
                  className={`text-sm font-semibold ${activeTab === "posts" ? "text-white" : "text-muted-foreground"}`}
                >
                  Bai viet
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 h-10 rounded-xl items-center justify-center ${activeTab === "shares" ? "bg-primary" : "bg-transparent"}`}
                onPress={() => setActiveTab("shares")}
              >
                <Text
                  className={`text-sm font-semibold ${activeTab === "shares" ? "text-white" : "text-muted-foreground"}`}
                >
                  Da chia se
                </Text>
              </TouchableOpacity>
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
            onPress={() => onOpenPost?.(item.id, { openComments: true })}
          >
            <Text className="text-xs text-primary font-semibold mb-1">
              {new Date(item.createdAt).toLocaleDateString()} •{" "}
              {item.visibility === "private" ? "Rieng tu" : "Cong khai"}
            </Text>
            <Text className="text-sm text-foreground" numberOfLines={4}>
              {activeTab === "shares"
                ? normalizeSharedContent(item) || "Bai viet chia se"
                : item.content || "Bai viet co media"}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon={activeTab === "shares" ? "🔁" : "📝"}
              title={
                activeTab === "shares"
                  ? "Chua co bai viet chia se"
                  : "Chua co bai viet nao"
              }
              subtitle={
                activeTab === "shares"
                  ? "Hay chia se bai viet de hien thi o day."
                  : "Hay dang bai de bat dau ho so ca nhan."
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
