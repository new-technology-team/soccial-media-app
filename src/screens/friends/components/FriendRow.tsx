import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import type { Friend } from "../types";
import { SmallAvatar } from "./SmallAvatar";

interface FriendRowProps {
  item: Friend;
  isLoading?: boolean;
  onOpenUserProfile?: (userId: number) => void;
  onMessageFriend?: (userId: number) => void;
  onRemoveFriend: (friendId: number, name: string) => void;
}

export function FriendRow({
  item,
  isLoading,
  onOpenUserProfile,
  onMessageFriend,
  onRemoveFriend,
}: FriendRowProps) {
  return (
    <View className="flex-row items-center px-4 py-3 bg-surface border-b border-border">
      <TouchableOpacity
        className="flex-1 flex-row items-center"
        activeOpacity={0.75}
        onPress={() => onOpenUserProfile?.(item.id)}
      >
        <SmallAvatar name={item.name} avatarUrl={item.avatarUrl} />
        <View className="flex-1 ml-3">
          <Text className="text-[15px] font-semibold text-foreground">{item.name}</Text>
          <Text className="text-xs text-muted-foreground mt-0.5">Bạn bè</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        className="bg-primary px-3 py-1.5 rounded-lg mr-2"
        onPress={() => onMessageFriend?.(item.id)}
        disabled={Boolean(isLoading) || !onMessageFriend}
        activeOpacity={0.8}
      >
        <Text className="text-xs text-white font-bold">Nhắn tin</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="px-3 py-1.5 rounded-lg border border-border bg-surface-secondary"
        onPress={() => onRemoveFriend(item.id, item.name)}
        disabled={Boolean(isLoading)}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#6b7280" />
        ) : (
          <Text className="text-xs text-foreground font-semibold">Hủy kết bạn</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
