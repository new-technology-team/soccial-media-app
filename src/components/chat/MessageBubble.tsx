import React, { useMemo } from "react";
import { Alert, Image, Linking, Text, TouchableOpacity, View } from "react-native";
import type { Message } from "../../types";
import { formatTime } from "../../utils";

interface MessageBubbleProps {
  message: Message;
  currentUserId: number;
  onLongPress?: (message: Message) => void;
  onOpenPost?: (postId: string) => void;
}

export function MessageBubble({
  message,
  currentUserId,
  onLongPress,
  onOpenPost,
}: MessageBubbleProps) {
  const isSystem = message.type === "system" || Number(message.senderId) === 0;
  const isMe = message.senderId === currentUserId;

  const sharedPostMeta = useMemo(() => {
    if (message.type !== "share_post") return null;
    const meta = message.meta || {};
    const postId = String(meta.postId || "").trim();
    if (!postId) return null;
    return {
      postId,
      postAuthor: String(meta.postAuthor || "").trim(),
      postContent: String(meta.postContent || "").trim(),
      postMediaUrl: String(meta.postMediaUrl || "").trim(),
    };
  }, [message.meta, message.type]);

  if (isSystem) {
    return (
      <View className="px-4 py-2 items-center">
        <Text className="text-[11px] text-muted-foreground text-center">
          {message.content}
        </Text>
      </View>
    );
  }

  const textValue = message.isRecalled
    ? "Tin nhan da duoc thu hoi"
    : message.content;

  const handleOpenFile = async () => {
    const fileUrl = String(message.mediaUrl || "").trim();
    if (!fileUrl) return;
    const canOpen = await Linking.canOpenURL(fileUrl);
    if (!canOpen) {
      Alert.alert("Khong mo duoc tep", "Duong dan tep khong hop le.");
      return;
    }
    await Linking.openURL(fileUrl);
  };

  return (
    <View
      className="flex-row px-4 py-1"
      style={{ justifyContent: isMe ? "flex-end" : "flex-start" }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={280}
        style={{ maxWidth: "76%", minWidth: 72 }}
      >
        <View
          className={`rounded-2xl px-4 py-3 ${
            isMe
              ? "bg-primary rounded-br-sm"
              : "bg-surface border border-border rounded-bl-sm"
          }`}
        >
          {!isMe && (
            <Text className="text-primary text-xs font-semibold mb-0.5">
              {message.senderName}
            </Text>
          )}

          {message.type === "image" && message.mediaUrl ? (
            <Image
              source={{ uri: message.mediaUrl }}
              className="w-full rounded-xl mb-2"
              style={{ height: 170 }}
              resizeMode="cover"
            />
          ) : null}

          {message.type === "file" && message.mediaUrl ? (
            <TouchableOpacity
              className={`rounded-xl border px-3 py-2 mb-2 ${
                isMe ? "border-white/30 bg-white/10" : "border-border bg-surface-secondary"
              }`}
              onPress={() => {
                void handleOpenFile();
              }}
              activeOpacity={0.8}
            >
              <Text
                className={`text-xs font-semibold ${
                  isMe ? "text-white" : "text-foreground"
                }`}
                numberOfLines={1}
              >
                {message.fileName || "Tep dinh kem"}
              </Text>
              <Text className={`text-[10px] mt-1 ${isMe ? "text-white/75" : "text-muted-foreground"}`}>
                Cham de mo tep
              </Text>
            </TouchableOpacity>
          ) : null}

          {sharedPostMeta ? (
            <TouchableOpacity
              className={`rounded-xl border px-3 py-2 mb-2 ${
                isMe ? "border-white/30 bg-white/10" : "border-border bg-surface-secondary"
              }`}
              onPress={() => onOpenPost?.(sharedPostMeta.postId)}
              activeOpacity={0.8}
            >
              <Text
                className={`text-xs font-semibold mb-1 ${
                  isMe ? "text-white" : "text-foreground"
                }`}
              >
                Bai viet da chia se
              </Text>
              {sharedPostMeta.postAuthor ? (
                <Text
                  className={`text-[11px] mb-1 ${isMe ? "text-white/90" : "text-muted-foreground"}`}
                >
                  Tac gia: {sharedPostMeta.postAuthor}
                </Text>
              ) : null}
              {sharedPostMeta.postContent ? (
                <Text
                  className={`text-xs ${isMe ? "text-white/90" : "text-foreground"}`}
                  numberOfLines={3}
                >
                  {sharedPostMeta.postContent}
                </Text>
              ) : null}
              <Text className={`text-[10px] mt-1 ${isMe ? "text-white/75" : "text-primary"}`}>
                Nhan de mo bai viet
              </Text>
            </TouchableOpacity>
          ) : null}

          {!!textValue ? (
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
              style={{ flexShrink: 1, lineHeight: 20 }}
            >
              {textValue}
            </Text>
          ) : null}

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
