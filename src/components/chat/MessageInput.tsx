import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";

interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPickImage?: () => void;
  onPickFile?: () => void;
  placeholder?: string;
  disabled?: boolean;
  disableAttachments?: boolean;
}

export function MessageInput({
  value,
  onChangeText,
  onSend,
  onPickImage,
  onPickFile,
  placeholder = "Nhan tin...",
  disabled = false,
  disableAttachments = false,
}: MessageInputProps) {
  return (
    <View className="flex-row items-center px-4 py-3 bg-surface border-t border-border">
      <TouchableOpacity
        className="w-10 h-10 rounded-xl border border-border bg-surface-secondary items-center justify-center mr-2"
        onPress={onPickImage}
        disabled={disabled || disableAttachments || !onPickImage}
        activeOpacity={0.8}
      >
        <Feather name="image" size={16} color="#4b5563" />
      </TouchableOpacity>
      <TouchableOpacity
        className="w-10 h-10 rounded-xl border border-border bg-surface-secondary items-center justify-center mr-2"
        onPress={onPickFile}
        disabled={disabled || disableAttachments || !onPickFile}
        activeOpacity={0.8}
      >
        <Feather name="paperclip" size={16} color="#4b5563" />
      </TouchableOpacity>
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
