import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import type { PendingRequest } from "../types";
import { SmallAvatar } from "./SmallAvatar";

interface PendingRequestRowProps {
  item: PendingRequest;
  isLoading?: boolean;
  onOpenUserProfile?: (userId: number) => void;
  onAccept: (requesterUserId: number) => void;
  onReject: (requesterUserId: number) => void;
}

export function PendingRequestRow({
  item,
  isLoading,
  onOpenUserProfile,
  onAccept,
  onReject,
}: PendingRequestRowProps) {
  return (
    <View className="flex-row items-center px-4 py-3 bg-surface border-b border-border">
      <TouchableOpacity
        className="flex-1 flex-row items-center"
        activeOpacity={0.75}
        onPress={() => onOpenUserProfile?.(item.id)}
      >
        <SmallAvatar name={item.fullName} avatarUrl={item.avatarUrl} />
        <View className="flex-1 ml-3">
          <Text className="text-[15px] font-semibold text-foreground">{item.fullName}</Text>
          <Text className="text-xs text-muted-foreground mt-0.5">Muốn kết bạn với bạn</Text>
        </View>
      </TouchableOpacity>

      <View className="flex-row gap-2">
        <TouchableOpacity
          className="bg-primary px-3 py-2 rounded-lg"
          onPress={() => onAccept(item.id)}
          disabled={Boolean(isLoading)}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-xs text-white font-bold">Chấp nhận</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="px-3 py-2 rounded-lg border border-border bg-surface-secondary"
          onPress={() => onReject(item.id)}
          disabled={Boolean(isLoading)}
          activeOpacity={0.8}
        >
          <Text className="text-xs text-foreground font-semibold">Từ chối</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
