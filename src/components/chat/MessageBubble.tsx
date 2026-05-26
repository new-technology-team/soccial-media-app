import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { Message } from "../../types";
import { formatTime } from "../../utils";

interface MessageBubbleProps {
  message: Message;
  currentUserId: number;
  onLongPress?: (message: Message) => void;
}

export function MessageBubble({
  message,
  currentUserId,
  onLongPress,
}: MessageBubbleProps) {
  const isMe = message.senderId === currentUserId;
  const textValue = message.isRecalled
    ? "Tin nhan da duoc thu hoi"
    : message.content;

  return (
    <View className={`flex-row justify-${isMe ? "end" : "start"} px-4 py-1`}>
      <TouchableOpacity
        activeOpacity={0.8}
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={280}
      >
        <View
          className={`max-w-[75%] rounded-2xl px-4 py-3 ${
            isMe ? "bg-primary rounded-br-sm" : "bg-surface border border-border rounded-bl-sm"
          }`}
        >
          {!isMe && (
            <Text className="text-primary text-xs font-semibold mb-0.5">
              {message.senderName}
            </Text>
          )}
          <Text
            className={`text-sm ${
              message.isRecalled
                ? isMe
                  ? "text-white/80 italic"
                  : "text-muted-foreground italic"
                : isMe
                  ? "text-white"
                  : "text-foreground"
            }`}
          >
            {textValue}
          </Text>
          <Text
            className={`text-[10px] mt-1 ${isMe ? "text-white/70" : "text-muted-foreground"} self-end`}
          >
            {formatTime(message.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
