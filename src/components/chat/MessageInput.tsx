import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MessageInput({
  value,
  onChangeText,
  onSend,
  placeholder = "Nhan tin...",
  disabled = false,
}: MessageInputProps) {
  return (
    <View className="flex-row items-center px-4 py-3 bg-surface border-t border-border">
      <TextInput
        className="flex-1 h-11 rounded-xl border border-border bg-surface-secondary px-4 text-sm text-foreground"
        placeholder={placeholder}
        placeholderTextColor="#7e8592"
        value={value}
        onChangeText={onChangeText}
        multiline
        editable={!disabled}
      />
      <TouchableOpacity
        className={`ml-3 rounded-xl px-5 py-2.5 items-center justify-center ${disabled ? "bg-primary/40" : "bg-primary"}`}
        onPress={onSend}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text className="text-white font-bold text-sm">Gui</Text>
      </TouchableOpacity>
    </View>
  );
}
