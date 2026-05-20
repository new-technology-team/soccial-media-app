import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import type { SearchUser } from "../types";
import { SmallAvatar } from "./SmallAvatar";

interface SearchUserRowProps {
  item: SearchUser;
  isFriend: boolean;
  isLoading?: boolean;
  onOpenUserProfile?: (userId: number) => void;
  onSendRequest: (targetId: number, name: string) => void;
}

export function SearchUserRow({
  item,
  isFriend,
  isLoading,
  onOpenUserProfile,
  onSendRequest,
}: SearchUserRowProps) {
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
        <SmallAvatar name={item.fullName} avatarUrl={item.avatarUrl} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827" }}>{item.fullName}</Text>
          {item.username ? (
            <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{item.username}</Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {isFriend ? (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: "#dcfce7",
          }}
        >
          <Text style={{ fontSize: 12, color: "#16a34a", fontWeight: "600" }}>Ban be</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => onSendRequest(item.id, item.fullName)}
          disabled={Boolean(isLoading)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: "#0052ce",
          }}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ fontSize: 12, color: "#fff", fontWeight: "700" }}>+ Ket ban</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}
