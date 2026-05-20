import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

interface FriendsListPlaceholderProps {
  loading: boolean;
  icon: string;
  title: string;
  subtitle: string;
}

export function FriendsListPlaceholder({
  loading,
  icon,
  title,
  subtitle,
}: FriendsListPlaceholderProps) {
  if (loading) {
    return (
      <View style={{ alignItems: "center", paddingTop: 60 }}>
        <ActivityIndicator size="large" color="#0052ce" />
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32 }}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>{icon}</Text>
      <Text style={{ fontSize: 16, fontWeight: "700", color: "#374151", marginBottom: 6 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 13, color: "#6b7280", textAlign: "center" }}>{subtitle}</Text>
    </View>
  );
}
