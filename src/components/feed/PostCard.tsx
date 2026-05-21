import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Avatar } from "../common/Avatar";
import type { FeedPost } from "../../types";
import { formatTime } from "../../utils";

interface PostCardProps {
  post: FeedPost;
  currentUserId: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onMenu: () => void;
}

export function PostCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onMenu,
}: PostCardProps) {
  void currentUserId;

  return (
    <View className="bg-surface rounded-2xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-center mb-4">
        <Avatar name={post.authorName} avatarUrl={post.authorAvatar} size="md" />
        <View className="flex-1 ml-3">
          <Text className="text-foreground font-semibold text-sm">{post.authorName}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5">
            {formatTime(post.createdAt)} · {post.visibility === "public" ? "Cong khai" : "Rieng tu"}
          </Text>
        </View>
        <TouchableOpacity onPress={onMenu} className="p-2" activeOpacity={0.7}>
          <Feather name="more-horizontal" size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <Text className="text-foreground text-sm leading-6 mb-4">{post.content}</Text>

      {post.mediaUrl ? (
        <Image
          source={{ uri: post.mediaUrl }}
          className="w-full rounded-xl mb-4"
          style={{ height: 200 }}
          resizeMode="cover"
        />
      ) : null}

      <View className="flex-row items-center border-b border-border pb-3 mb-3">
        <Feather name="heart" size={14} color="#6b7280" />
        <Text className="text-muted-foreground text-xs ml-1 mr-3">{post.reactionCount}</Text>
        <Feather name="message-circle" size={14} color="#6b7280" />
        <Text className="text-muted-foreground text-xs ml-1">{post.commentCount} binh luan</Text>
      </View>

      <View className="flex-row">
        <TouchableOpacity className="flex-1 items-center py-2" onPress={onLike} activeOpacity={0.75}>
          <Feather
            name="heart"
            size={18}
            color={post.viewerReaction ? "#0052ce" : "#6b7280"}
          />
          <Text
            className={`text-xs font-semibold mt-1 ${post.viewerReaction ? "text-primary" : "text-muted-foreground"}`}
          >
            {post.viewerReaction ? "Da thich" : "Thich"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 items-center py-2" onPress={onComment} activeOpacity={0.75}>
          <Feather name="message-circle" size={18} color="#6b7280" />
          <Text className="text-xs text-muted-foreground font-semibold mt-1">Binh luan</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 items-center py-2" onPress={onShare} activeOpacity={0.75}>
          <Feather name="share-2" size={18} color="#6b7280" />
          <Text className="text-xs text-muted-foreground font-semibold mt-1">Chia se</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
