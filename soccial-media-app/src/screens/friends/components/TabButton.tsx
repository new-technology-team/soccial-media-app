import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TabButtonProps {
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}

export function TabButton({ label, active, count, onPress }: TabButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: 2,
        borderBottomColor: active ? "#0052ce" : "transparent",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: active ? "#0052ce" : "#6b7280",
          }}
        >
          {label}
        </Text>
        {count && count > 0 ? (
          <View
            style={{
              backgroundColor: "#ef4444",
              borderRadius: 10,
              minWidth: 18,
              height: 18,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{count}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
