import React from "react";
import { Image, Text, View } from "react-native";
import { getInitials } from "../helpers";

interface SmallAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}

export function SmallAvatar({ name, avatarUrl, size = 48 }: SmallAvatarProps) {
  const hasAvatar = Boolean(String(avatarUrl || "").trim());

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#0052ce",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {hasAvatar ? (
        <Image
          source={{ uri: String(avatarUrl) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.34 }}>
          {getInitials(name) || "U"}
        </Text>
      )}
    </View>
  );
}
