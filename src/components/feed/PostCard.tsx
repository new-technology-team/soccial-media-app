import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Image, Linking, ActivityIndicator, Alert } from "react-native";
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

const VIDEO_FILE_REGEX = /\.(mp4|mov|m4v|webm|mkv|3gp|m3u8)(\?.*)?$/i;

function resolvePostMediaType(post: FeedPost): "image" | "video" | null {
  const rawType = String(post.mediaType || "").toLowerCase();
  if (rawType === "video") return "video";
  if (rawType === "image") return "image";

  const mediaUrl = String(post.mediaUrl || "").trim();
  if (!mediaUrl) return null;
  return VIDEO_FILE_REGEX.test(mediaUrl) ? "video" : "image";
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

function PostCardComponent({
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
  const [isOpeningVideo, setIsOpeningVideo] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const mediaType = useMemo(
    () => resolvePostMediaType(post),
    [post.mediaType, post.mediaUrl],
  );

  useEffect(() => {
    setImageLoadFailed(false);
  }, [post.mediaUrl, post.id]);

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

  const handleOpenVideo = async () => {
    const mediaUrl = String(post.mediaUrl || "").trim();
    if (!mediaUrl || isOpeningVideo) return;

    try {
      setIsOpeningVideo(true);
      const supported = await Linking.canOpenURL(mediaUrl);
      if (!supported) {
        Alert.alert("Khong mo duoc video", "Lien ket video khong hop le.");
        return;
      }
      await Linking.openURL(mediaUrl);
    } catch {
      Alert.alert("Khong mo duoc video", "Vui long thu lai sau.");
    } finally {
      setIsOpeningVideo(false);
    }
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
      {post.mediaUrl && mediaType === "image" && !imageLoadFailed ? (
        <Image
          source={{ uri: post.mediaUrl }}
          className="w-full rounded-xl mb-4"
          style={{ height: 220 }}
          resizeMode="cover"
          onError={() => setImageLoadFailed(true)}
        />
      ) : null}

      {post.mediaUrl && mediaType === "video" ? (
        <TouchableOpacity
          className="w-full rounded-xl mb-4 border border-border bg-surface-secondary p-4"
          style={{ minHeight: 176 }}
          activeOpacity={0.8}
          onPress={() => {
            void handleOpenVideo();
          }}
        >
          <View className="flex-1 items-center justify-center">
            <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center mb-2">
              {isOpeningVideo ? (
                <ActivityIndicator size="small" color="#0052ce" />
              ) : (
                <Feather name="play" size={20} color="#0052ce" />
              )}
            </View>
            <Text className="text-sm font-semibold text-foreground">Video</Text>
            <Text className="text-xs text-muted-foreground mt-1">
              Nhan de xem video
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {post.mediaUrl && mediaType === "image" && imageLoadFailed ? (
        <TouchableOpacity
          className="w-full rounded-xl mb-4 border border-border bg-surface-secondary p-4"
          style={{ minHeight: 120 }}
          activeOpacity={0.8}
          onPress={() => {
            const mediaUrl = String(post.mediaUrl || "").trim();
            if (!mediaUrl) return;
            void Linking.openURL(mediaUrl).catch(() => undefined);
          }}
        >
          <View className="flex-1 items-center justify-center">
            <Feather name="image" size={20} color="#6b7280" />
            <Text className="text-xs text-muted-foreground mt-2">
              Khong tai duoc anh, nhan de mo lien ket
            </Text>
          </View>
        </TouchableOpacity>
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

function arePostCardPropsEqual(prev: PostCardProps, next: PostCardProps) {
  return (
    prev.isSaved === next.isSaved &&
    prev.currentUserId === next.currentUserId &&
    prev.post.id === next.post.id &&
    prev.post.content === next.post.content &&
    prev.post.mediaUrl === next.post.mediaUrl &&
    prev.post.mediaType === next.post.mediaType &&
    prev.post.visibility === next.post.visibility &&
    prev.post.authorId === next.post.authorId &&
    prev.post.authorName === next.post.authorName &&
    prev.post.authorAvatar === next.post.authorAvatar &&
    prev.post.createdAt === next.post.createdAt &&
    prev.post.reactionCount === next.post.reactionCount &&
    prev.post.commentCount === next.post.commentCount &&
    prev.post.viewerReaction === next.post.viewerReaction
  );
}

export const PostCard = React.memo(PostCardComponent, arePostCardPropsEqual);
