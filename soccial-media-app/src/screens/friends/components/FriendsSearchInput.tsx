import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface FriendsSearchInputProps {
  value: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
}

export function FriendsSearchInput({
  value,
  onChangeText,
  onClear,
}: FriendsSearchInputProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
      <TextInput
        style={{
          flex: 1,
          height: 40,
          backgroundColor: "#f3f4f6",
          borderRadius: 20,
          paddingHorizontal: 14,
          fontSize: 14,
          color: "#111827",
        }}
        placeholder="Tim theo ten hoac email..."
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        autoFocus
      />
      {value.length > 0 ? (
        <TouchableOpacity onPress={onClear} style={{ marginLeft: 8 }}>
          <Text style={{ fontSize: 16, color: "#9ca3af" }}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
