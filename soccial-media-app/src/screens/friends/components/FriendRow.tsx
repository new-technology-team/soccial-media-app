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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
      }}
    >
      <TouchableOpacity
        style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
        activeOpacity={0.75}
        onPress={() => onOpenUserProfile?.(item.id)}
      >
        <SmallAvatar name={item.name} avatarUrl={item.avatarUrl} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827" }}>{item.name}</Text>
          <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Ban be</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onMessageFriend?.(item.id)}
        disabled={Boolean(isLoading) || !onMessageFriend}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 8,
          backgroundColor: "#0052ce",
          marginRight: 8,
        }}
      >
        <Text style={{ fontSize: 12, color: "#fff", fontWeight: "700" }}>Nhan tin</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onRemoveFriend(item.id, item.name)}
        disabled={Boolean(isLoading)}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#d1d5db",
          backgroundColor: "#f9fafb",
        }}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#6b7280" />
        ) : (
          <Text style={{ fontSize: 12, color: "#374151", fontWeight: "600" }}>Huy ket ban</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
