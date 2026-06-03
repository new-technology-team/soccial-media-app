import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { Avatar } from "../common/Avatar";
import type { FeedPost } from "../../types";
import { formatTime } from "../../utils";

const isVideoUrl = (url: string | null | undefined) => {
  if (!url) return false;
  return /\.(mp4|mkv|webm|avi|mov|3gp|m4v)(\?.*)?$/i.test(url);
};

const REACTIONS = [
  { type: "like",  emoji: "👍", label: "Thích" },
  { type: "love",  emoji: "❤️", label: "Yêu thích" },
  { type: "haha",  emoji: "😆", label: "Haha" },
  { type: "wow",   emoji: "😮", label: "Wow" },
  { type: "sad",   emoji: "😢", label: "Buồn" },
  { type: "angry", emoji: "😡", label: "Phẫn nộ" },
];

const REACTION_COLORS: Record<string, string> = {
  like: "#0052ce",
  love: "#e0245e",
  haha: "#f59e0b",
  wow: "#f59e0b",
  sad: "#f59e0b",
  angry: "#f4540c",
};

interface PostCardProps {
  post: FeedPost;
  currentUserId: number;
  isSaved?: boolean;
  onLike: () => void;
  onReact?: (type: string) => void;
  onComment: () => void;
  onShare: () => void;
  onSave?: () => void;
  onMenu: () => void;
  onHashtagPress?: (tag: string) => void;
}

function renderContent(content: string, onHashtagPress?: (tag: string) => void) {
  const parts = content.split(/(#\w+)/g);
  return (
    <Text className="text-foreground text-sm leading-6 mb-4">
      {parts.map((part, i) =>
        /^#\w+$/.test(part) ? (
          <Text
            key={i}
            style={{ color: "#0052ce", fontWeight: "600" }}
            onPress={() => onHashtagPress?.(part.slice(1))}
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export function PostCard({
  post,
  currentUserId,
  isSaved = false,
  onLike,
  onReact,
  onComment,
  onShare,
  onSave,
  onMenu,
  onHashtagPress,
}: PostCardProps) {
  void currentUserId;
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isVideo = isVideoUrl(post.mediaUrl);
  const player = useVideoPlayer((isVideo && post.mediaUrl) ? post.mediaUrl : (null as any), (playerInstance) => {
    playerInstance.loop = false;
  });

  const handleHeartTap = () => {
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      return;
    }
    onLike();
  };

  const handleHeartLongPress = () => {
    setShowEmojiPicker((v) => !v);
  };

  const handlePickEmoji = (type: string) => {
    setShowEmojiPicker(false);
    onReact?.(type);
  };

  const activeReaction = post.viewerReaction
    ? REACTIONS.find((r) => r.type === post.viewerReaction)
    : null;
  const activeColor = activeReaction
    ? REACTION_COLORS[activeReaction.type] || "#0052ce"
    : "#6b7280";


  return (
    <View className="bg-surface rounded-2xl p-4 mb-3 shadow-sm">
      {/* Header */}
      <View className="flex-row items-center mb-4">
        <Avatar name={post.authorName} avatarUrl={post.authorAvatar} size="md" />
        <View className="flex-1 ml-3">
          <Text className="text-foreground font-semibold text-sm">{post.authorName}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5">
            {formatTime(post.createdAt)} · {post.visibility === "public" ? "Công khai" : "Riêng tư"}
          </Text>
        </View>
        <TouchableOpacity onPress={onMenu} className="p-2" activeOpacity={0.7}>
          <Feather name="more-horizontal" size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {renderContent(post.content, onHashtagPress)}

      {/* Media */}
      {post.mediaUrl ? (
        isVideoUrl(post.mediaUrl) ? (
          <VideoView
            style={{ width: "100%", height: 240, borderRadius: 12, marginBottom: 16 }}
            player={player}
            allowsFullscreen
            allowsPictureInPicture
          />
        ) : (
          <Image
            source={{ uri: post.mediaUrl }}
            className="w-full rounded-xl mb-4"
            style={{ height: 200 }}
            resizeMode="cover"
          />
        )
      ) : null}

      {/* Stats */}
      <View className="flex-row items-center border-b border-border pb-3 mb-3">
        <Feather name="heart" size={14} color="#6b7280" />
        <Text className="text-muted-foreground text-xs ml-1 mr-3">{post.reactionCount}</Text>
        <Feather name="message-circle" size={14} color="#6b7280" />
        <Text className="text-muted-foreground text-xs ml-1">{post.commentCount} bình luận</Text>
      </View>

      {/* Emoji Picker (popover nổi, mở khi nhấn giữ nút Thích) */}
      {showEmojiPicker && (
        <>
          <Pressable
            onPress={() => setShowEmojiPicker(false)}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
          />
          <View
            className="absolute left-4 right-4 flex-row justify-around bg-surface rounded-2xl border border-border px-2 py-2"
            style={{
              bottom: 52,
              zIndex: 20,
              elevation: 6,
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            {REACTIONS.map(({ type, emoji }) => {
              const isActive = post.viewerReaction === type;
              return (
                <TouchableOpacity
                  key={type}
                  className={`w-10 h-10 items-center justify-center rounded-full ${isActive ? "bg-blue-50 border border-primary" : ""}`}
                  onPress={() => handlePickEmoji(type)}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Action Buttons */}
      <View className="flex-row">
        <TouchableOpacity
          className="flex-1 flex-row items-center justify-center py-2"
          onPress={handleHeartTap}
          onLongPress={handleHeartLongPress}
          delayLongPress={300}
          activeOpacity={0.75}
        >
          {activeReaction ? (
            <Text style={{ fontSize: 16 }}>{activeReaction.emoji}</Text>
          ) : (
            <Feather name="heart" size={18} color="#6b7280" />
          )}
          <Text
            className="text-xs font-semibold ml-1.5"
            style={{ color: activeColor }}
          >
            {activeReaction ? activeReaction.label : "Thích"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-1 flex-row items-center justify-center py-2" onPress={onComment} activeOpacity={0.75}>
          <Feather name="message-circle" size={18} color="#6b7280" />
          <Text className="text-xs text-muted-foreground font-semibold ml-1.5">Bình luận</Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-1 flex-row items-center justify-center py-2" onPress={onShare} activeOpacity={0.75}>
          <Feather name="share-2" size={18} color="#6b7280" />
          <Text className="text-xs text-muted-foreground font-semibold ml-1.5">Chia sẻ</Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-1 flex-row items-center justify-center py-2" onPress={onSave} activeOpacity={0.75}>
          <Feather name="bookmark" size={18} color={isSaved ? "#0052ce" : "#6b7280"} />
          <Text className={`text-xs font-semibold ml-1.5 ${isSaved ? "text-primary" : "text-muted-foreground"}`}>
            {isSaved ? "Đã lưu" : "Lưu"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
