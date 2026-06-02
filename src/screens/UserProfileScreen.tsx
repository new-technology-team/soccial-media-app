import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "../components/common/Avatar";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { TopBar } from "../components/common/TopBar";
import { api } from "../lib/api";
import type { AuthUser, FeedPost } from "../types";

type RelationshipStatus =
  | "self"
  | "none"
  | "pending_sent"
  | "pending_received"
  | "friends";

interface UserProfileScreenProps {
  currentUser: AuthUser;
  userId: number;
  onBack: () => void;
  onMessageUser?: (userId: number) => void;
  onOpenPost?: (postId: string, options?: { openComments?: boolean }) => void;
}

export function UserProfileScreen({
  currentUser,
  userId,
  onBack,
  onMessageUser,
  onOpenPost,
}: UserProfileScreenProps) {
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [relationship, setRelationship] = useState<RelationshipStatus>("none");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isReporting, setIsReporting] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setStatus("");
    try {
      const [profileRes, postsRes] = await Promise.all([
        api.getUserProfile(userId),
        api.listUserPosts(userId),
      ]);
      setProfile(profileRes.user);
      setRelationship(profileRes.relationship.status);
      setPosts(postsRes.posts || []);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không thể tải hồ sơ");
      setProfile(null);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSendRequest = async () => {
    if (!profile) return;
    setIsSubmitting(true);
    setStatus("");
    try {
      await api.sendFriendRequest(profile.id);
      setRelationship("pending_sent");
      setStatus("Đã gửi lời mời kết bạn");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không thể gửi lời mời");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrRemove = async () => {
    if (!profile) return;
    setIsSubmitting(true);
    setStatus("");
    try {
      await api.removeFriend(profile.id);
      setRelationship("none");
      setPosts([]);
      void loadData();
      setStatus("Đã hủy kết nối");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không thể thực hiện");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (!profile) return;
    setIsSubmitting(true);
    setStatus("");
    try {
      await api.acceptFriendRequest(profile.id);
      setRelationship("friends");
      void loadData();
      setStatus("Đã chấp nhận lời mời kết bạn");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không thể chấp nhận");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!profile) return;
    setIsSubmitting(true);
    setStatus("");
    try {
      await api.rejectFriendRequest(profile.id);
      setRelationship("none");
      setPosts([]);
      void loadData();
      setStatus("Đã từ chối lời mời");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không thể từ chối");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReport = async () => {
    if (!profile) return;
    const reason = reportReason.trim();
    if (!reason) {
      setStatus("Vui lòng nhập lý do báo cáo");
      return;
    }
    setIsReporting(true);
    setStatus("");
    try {
      await api.submitReport({
        targetType: "user",
        targetId: profile.id,
        reason,
        details: reason,
      });
      setShowReportModal(false);
      setReportReason("");
      setStatus("Đã gửi báo cáo tài khoản");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không thể gửi báo cáo");
    } finally {
      setIsReporting(false);
    }
  };

  const relationshipLabel = useMemo(() => {
    switch (relationship) {
      case "friends":
        return "Đã là bạn bè";
      case "pending_sent":
        return "Đã gửi lời mời";
      case "pending_received":
        return "Đang chờ xác nhận";
      case "self":
        return "Tài khoản của bạn";
      default:
        return "Chưa kết bạn";
    }
  }, [relationship]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <TopBar title="Hồ sơ người dùng" leftAction={{ label: "Quay lại", onPress: onBack }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0052ce" />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 bg-background">
        <TopBar title="Hồ sơ người dùng" leftAction={{ label: "Quay lại", onPress: onBack }} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-foreground text-base font-semibold">Không tải được hồ sơ</Text>
          {status ? (
            <Text className="text-muted-foreground text-sm text-center mt-2">{status}</Text>
          ) : null}
          <TouchableOpacity
            className="mt-4 px-4 py-2 rounded-xl bg-primary"
            onPress={() => void loadData()}
            activeOpacity={0.8}
          >
            <Text className="text-white font-semibold">Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const showReportButton = relationship !== "self";
  const canMessage = relationship === "friends";
  const isOnline = (() => {
    const raw = profile.lastActiveAt;
    if (!raw) return false;
    const ts = new Date(raw).getTime();
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < 5 * 60 * 1000;
  })();

  return (
    <View className="flex-1 bg-background">
      <TopBar title="Hồ sơ người dùng" leftAction={{ label: "Quay lại", onPress: onBack }} />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ padding: 16 }}>
            <Card>
              <View className="items-center">
                <View>
                  <Avatar name={profile.fullName} avatarUrl={profile.avatarUrl} size="lg" />
                  {isOnline ? (
                    <View
                      style={{
                        position: "absolute",
                        right: 2,
                        bottom: 2,
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: "#16a34a",
                        borderWidth: 2,
                        borderColor: "#ffffff",
                      }}
                    />
                  ) : null}
                </View>
                <Text className="mt-3 text-lg font-bold text-foreground">{profile.fullName}</Text>
                {isOnline ? (
                  <Text className="text-[11px] text-success font-semibold mt-0.5">
                    Đang hoạt động
                  </Text>
                ) : null}
                <Text className="text-xs text-muted-foreground mt-1">
                  {profile.email || profile.phone || "Người dùng"}
                </Text>
                <View className="mt-3 px-3 py-1 rounded-full bg-surface-secondary border border-border">
                  <Text className="text-xs font-semibold text-primary">{relationshipLabel}</Text>
                </View>
              </View>

              <View className="mt-4 gap-2">
                {relationship === "none" ? (
                  <Button
                    title="Kết bạn"
                    onPress={() => void handleSendRequest()}
                    loading={isSubmitting}
                  />
                ) : null}

                {relationship === "pending_sent" ? (
                  <Button
                    title="Hủy lời mời"
                    variant="secondary"
                    onPress={() => void handleCancelOrRemove()}
                    loading={isSubmitting}
                  />
                ) : null}

                {relationship === "pending_received" ? (
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Button
                        title="Chấp nhận"
                        onPress={() => void handleAccept()}
                        loading={isSubmitting}
                      />
                    </View>
                    <View className="flex-1">
                      <Button
                        title="Từ chối"
                        variant="secondary"
                        onPress={() => void handleReject()}
                        disabled={isSubmitting}
                      />
                    </View>
                  </View>
                ) : null}

                {relationship === "friends" ? (
                  <Button
                    title="Hủy kết bạn"
                    variant="secondary"
                    onPress={() => void handleCancelOrRemove()}
                    loading={isSubmitting}
                  />
                ) : null}

                {canMessage && onMessageUser ? (
                  <Button
                    title="Nhắn tin"
                    onPress={() => onMessageUser(profile.id)}
                    disabled={isSubmitting}
                  />
                ) : null}

                {showReportButton ? (
                  <Button
                    title="Báo cáo tài khoản"
                    variant="ghost"
                    onPress={() => setShowReportModal(true)}
                    disabled={isSubmitting}
                  />
                ) : null}
              </View>
            </Card>

            {status ? (
              <View className="mt-3 rounded-xl px-4 py-3 border border-border bg-surface-secondary">
                <Text className="text-sm text-foreground">{status}</Text>
              </View>
            ) : null}

            <Text className="text-base font-bold text-foreground mt-5 mb-2">Bài viết</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="mx-4 mb-3 rounded-2xl bg-surface border border-border px-4 py-3"
            onPress={() => onOpenPost?.(item.id, { openComments: true })}
            activeOpacity={0.8}
          >
            <Text className="text-xs text-primary font-semibold mb-1">
              {item.authorName} • {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            <Text className="text-sm text-foreground" numberOfLines={3}>
              {item.content || "Bài viết có media"}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="px-6 pb-10">
            <View className="rounded-2xl bg-surface-secondary border border-border px-4 py-6 items-center">
              <Text className="text-muted-foreground text-sm">Chưa có bài viết công khai</Text>
            </View>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View className="flex-1 bg-black/45 items-center justify-center px-6">
          <View className="w-full rounded-2xl bg-surface border border-border p-4">
            <Text className="text-base font-bold text-foreground">Báo cáo tài khoản</Text>
            <Text className="text-sm text-muted-foreground mt-1">
              Nhập lý do báo cáo để gửi cho quản trị viên.
            </Text>
            <TextInput
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Lý do báo cáo..."
              placeholderTextColor="#7e8592"
              multiline
              style={{
                minHeight: 90,
                marginTop: 12,
                borderWidth: 1,
                borderColor: "#d1d5db",
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: "#111827",
                textAlignVertical: "top",
              }}
            />
            <View className="flex-row gap-2 mt-3">
              <View className="flex-1">
                <Button
                  title="Đóng"
                  variant="secondary"
                  onPress={() => setShowReportModal(false)}
                  disabled={isReporting}
                />
              </View>
              <View className="flex-1">
                <Button
                  title={isReporting ? "Đang gửi..." : "Gửi báo cáo"}
                  onPress={() => void handleReport()}
                  loading={isReporting}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
