import React, { useMemo } from "react";
import {
  Alert,
  Image,
  Linking,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { Message } from "../../types";
import { formatTime } from "../../utils";

interface MessageBubbleProps {
  message: Message;
  currentUserId: number;
  onLongPress?: (message: Message) => void;
  onOpenPost?: (postId: string) => void;
  translatedText?: string;
}

export function MessageBubble({
  message,
  currentUserId,
  onLongPress,
  onOpenPost,
  translatedText,
}: MessageBubbleProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isSystem = message.type === "system" || Number(message.senderId) === 0;
  const isMe = message.senderId === currentUserId;
  const imageWidth = Math.min(250, Math.max(180, screenWidth * 0.62));

  const isVideo = message.type === "video" && Boolean(message.mediaUrl);
  const player = useVideoPlayer((isVideo && message.mediaUrl) ? message.mediaUrl : (null as any), (playerInstance) => {
    playerInstance.loop = false;
  });

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
  const imageRatio = useMemo(() => {
    if (message.type !== "image") return 1;
    const width = Number((message.meta as any)?.width || 0);
    const height = Number((message.meta as any)?.height || 0);
    if (width > 0 && height > 0) {
      return Math.min(1.6, Math.max(0.75, width / height));
    }
    return 1;
  }, [message.meta, message.type]);
  const hidePlaceholderText =
    !message.isRecalled &&
    ((message.type === "image" &&
      Boolean(String(message.mediaUrl || "").trim()) &&
      textValue.trim() === "[Anh]") ||
      (message.type === "file" &&
        Boolean(String(message.mediaUrl || "").trim()) &&
        textValue.trim().startsWith("[Tep]")));

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
          {message.replyTo && (
            <View
              style={{
                borderLeftWidth: 2,
                borderLeftColor: isMe ? "rgba(255,255,255,0.5)" : "#4f46e5",
                paddingLeft: 6,
                marginBottom: 6,
                opacity: 0.85,
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: "600", color: isMe ? "rgba(255,255,255,0.9)" : "#4f46e5" }}
                numberOfLines={1}
              >
                {message.replyTo.senderName}
              </Text>
              <Text
                style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.75)" : "#6b7280" }}
                numberOfLines={1}
              >
                {message.replyTo.type === "image" ? "🖼 Anh"
                  : message.replyTo.type === "video" ? "📹 Video"
                  : message.replyTo.type === "file" ? "📎 Tep"
                  : String(message.replyTo.content || "")}
              </Text>
            </View>
          )}

          {!isMe && (
            <Text className="text-primary text-xs font-semibold mb-0.5">
              {message.senderName}
            </Text>
          )}

          {message.type === "image" && message.mediaUrl ? (
            <Image
              source={{ uri: message.mediaUrl }}
              className="rounded-xl mb-2"
              style={{
                width: imageWidth,
                aspectRatio: imageRatio,
                maxHeight: 300,
                minHeight: 120,
              }}
              resizeMode="contain"
            />
          ) : null}

          {message.type === "video" && message.mediaUrl ? (
            <VideoView
              player={player}
              allowsFullscreen
              allowsPictureInPicture
              style={{
                width: imageWidth,
                height: 180,
                borderRadius: 12,
                marginBottom: 8,
              }}
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

          {!!textValue && !hidePlaceholderText ? (
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

          {translatedText ? (
            <View style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: isMe ? "rgba(255,255,255,0.2)" : "#e5e7eb", paddingTop: 4 }}>
              <Text style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.8)" : "#6b7280", fontStyle: "italic" }}>
                🌐 {translatedText}
              </Text>
            </View>
          ) : null}

          <Text
            className={`text-[10px] mt-1 ${isMe ? "text-white/70" : "text-muted-foreground"} self-end`}
          >
            {message.isPinned ? "📌 Đã ghim • " : ""}
            {formatTime(message.createdAt)}
          </Text>
        </View>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <View className={`flex-row absolute -bottom-3 ${isMe ? "right-2" : "left-2"}`}>
            {message.reactions.map((reaction, index) => {
              let emoji = "👍";
              if (reaction.type === "love") emoji = "❤️";
              else if (reaction.type === "smile") emoji = "😆";
              else if (reaction.type === "wow") emoji = "😮";
              else if (reaction.type === "sad") emoji = "😢";
              else if (reaction.type === "angry") emoji = "😡";

              return (
                <View 
                  key={`${reaction.type}-${index}`}
                  className="bg-surface border border-border rounded-full px-1.5 py-0.5 flex-row items-center ml-1"
                >
                  <Text style={{ fontSize: 10 }}>{emoji}</Text>
                  {reaction.count > 1 && (
                    <Text className="text-[10px] text-muted-foreground font-semibold ml-1">
                      {reaction.count}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
