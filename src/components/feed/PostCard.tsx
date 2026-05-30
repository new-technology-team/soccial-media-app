import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Avatar } from "../common/Avatar";
import type { FeedPost } from "../../types";
import { formatTime } from "../../utils";

const REACTIONS = [
  { type: "like",  emoji: "👍" },
  { type: "love",  emoji: "❤️" },
  { type: "haha",  emoji: "😆" },
  { type: "wow",   emoji: "😮" },
  { type: "sad",   emoji: "😢" },
  { type: "angry", emoji: "😡" },
];

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
        <Image
          source={{ uri: post.mediaUrl }}
          className="w-full rounded-xl mb-4"
          style={{ height: 200 }}
          resizeMode="cover"
        />
      ) : null}

      {/* Stats */}
      <View className="flex-row items-center border-b border-border pb-3 mb-3">
        <Feather name="heart" size={14} color="#6b7280" />
        <Text className="text-muted-foreground text-xs ml-1 mr-3">{post.reactionCount}</Text>
        <Feather name="message-circle" size={14} color="#6b7280" />
        <Text className="text-muted-foreground text-xs ml-1">{post.commentCount} bình luận</Text>
      </View>

      {/* Emoji Picker (inline, shows on long press) */}
      {showEmojiPicker && (
        <View className="flex-row justify-around bg-surface-secondary rounded-2xl border border-border px-2 py-2 mb-3">
          {REACTIONS.map(({ type, emoji }) => (
            <TouchableOpacity
              key={type}
              className="w-10 h-10 items-center justify-center rounded-full"
              onPress={() => handlePickEmoji(type)}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Action Buttons */}
      <View className="flex-row">
        <TouchableOpacity
          className="flex-1 items-center py-2"
          onPress={handleHeartTap}
          onLongPress={handleHeartLongPress}
          delayLongPress={350}
          activeOpacity={0.75}
        >
          <Feather
            name="heart"
            size={18}
            color={post.viewerReaction ? "#0052ce" : "#6b7280"}
          />
          <Text
            className={`text-xs font-semibold mt-1 ${post.viewerReaction ? "text-primary" : "text-muted-foreground"}`}
          >
            {post.viewerReaction ? "Đã thích" : "Thích"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-1 items-center py-2" onPress={onComment} activeOpacity={0.75}>
          <Feather name="message-circle" size={18} color="#6b7280" />
          <Text className="text-xs text-muted-foreground font-semibold mt-1">Bình luận</Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-1 items-center py-2" onPress={onShare} activeOpacity={0.75}>
          <Feather name="share-2" size={18} color="#6b7280" />
          <Text className="text-xs text-muted-foreground font-semibold mt-1">Chia sẻ</Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-1 items-center py-2" onPress={onSave} activeOpacity={0.75}>
          <Feather name="bookmark" size={18} color={isSaved ? "#0052ce" : "#6b7280"} />
          <Text className={`text-xs font-semibold mt-1 ${isSaved ? "text-primary" : "text-muted-foreground"}`}>
            {isSaved ? "Đã lưu" : "Lưu"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
