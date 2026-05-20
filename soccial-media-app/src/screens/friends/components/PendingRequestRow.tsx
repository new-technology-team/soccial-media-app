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
          <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Dang cho ban xac nhan</Text>
        </View>
      </TouchableOpacity>

      <View style={{ flexDirection: "row", gap: 6 }}>
        <TouchableOpacity
          onPress={() => onAccept(item.id)}
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
            <Text style={{ fontSize: 12, color: "#fff", fontWeight: "700" }}>Chap nhan</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onReject(item.id)}
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
          <Text style={{ fontSize: 12, color: "#374151", fontWeight: "600" }}>Tu choi</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
