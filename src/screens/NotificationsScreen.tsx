import React, { useCallback, useEffect, useState } from "react";
import { Alert, TouchableOpacity, View, FlatList, RefreshControl, Text } from "react-native";
import { TopBar } from "../components/common/TopBar";
import { EmptyState } from "../components/common/EmptyState";
import { NotificationItem } from "../components/notifications/NotificationItem";
import { api, authStore, getSocket } from "../lib";
import type { Notification } from "../types";

interface NotificationsScreenProps {
  onOpenPost?: (postId: string, options?: { openComments?: boolean }) => void;
}

export function NotificationsScreen({ onOpenPost }: NotificationsScreenProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.notifications();
      setNotifications(res.notifications || []);
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      load();
    }, 15000);

    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const token = authStore.getTokens()?.accessToken;
    if (!token) return;

    const socket = getSocket(token);
    const onRealtimeNotification = (payload: any) => {
      const next: Notification = {
        id: String(payload?.id || Date.now()),
        type: payload?.type ? String(payload.type) : "general",
        title: String(payload?.title || "Thong bao"),
        body: payload?.body ? String(payload.body) : undefined,
        isRead: Boolean(payload?.isRead ?? payload?.is_read ?? false),
        is_read: Boolean(payload?.isRead ?? payload?.is_read ?? false),
        meta: payload?.meta || null,
        createdAt: String(payload?.createdAt || new Date().toISOString()),
      };

      setNotifications((prev) => {
        const deduped = prev.filter((item) => item.id !== next.id);
        return [next, ...deduped];
      });
    };

    socket.on("notification:new", onRealtimeNotification);
    return () => {
      socket.off("notification:new", onRealtimeNotification);
    };
  }, []);

  const handleDeleteNotification = useCallback((item: Notification) => {
    Alert.alert("Xoa thong bao", "Ban muon xoa thong bao nay?", [
      { text: "Huy", style: "cancel" },
      {
        text: "Xoa",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteNotification(item.id);
            setNotifications((prev) => prev.filter((n) => n.id !== item.id));
          } catch {
            /* silent */
          }
        },
      },
    ]);
  }, []);

  const handlePressNotification = async (item: Notification) => {
    const isRead = Boolean(item.isRead ?? item.is_read);
    if (!isRead) {
      try {
        await api.readNotification(item.id);
        setNotifications((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, isRead: true, is_read: true }
              : entry,
          ),
        );
      } catch {
        /* silent */
      }
    }

    const postId =
      item.meta?.postId ||
      (typeof item.meta?.targetId === "string"
        ? item.meta.targetId
        : undefined);

    if (!postId || !onOpenPost) return;
    const openComments = String(item.type || "").includes("comment");
    onOpenPost(String(postId), { openComments });
  };

  return (
    <View className="flex-1 bg-background">
      <TopBar title="Thông báo" />
      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => { void handlePressNotification(item); }}
            onLongPress={() => handleDeleteNotification(item)}
            activeOpacity={0.85}
          >
            <View className="flex-row items-center pr-2">
              <View className="flex-1">
                <NotificationItem
                  notification={item}
                  onPress={() => { void handlePressNotification(item); }}
                />
              </View>
              <TouchableOpacity
                className="w-8 h-8 items-center justify-center ml-1"
                onPress={() => handleDeleteNotification(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text className="text-muted-foreground text-base">✕</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#0052ce"
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="🔔"
              title="Không có thông báo nào"
              subtitle="Bạn sẽ nhận thông báo khi có hoạt động mới"
            />
          ) : null
        }
      />
    </View>
  );
}
