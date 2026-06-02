import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopBar } from "../common/TopBar";
import { EmptyState } from "../common/EmptyState";
import { Avatar } from "../common/Avatar";
import { api } from "../../lib/api";
import type { FeedComment, FeedPost } from "../../types";
import { formatTime } from "../../utils";

interface PostCommentsScreenProps {
  postId: string;
  post?: FeedPost | null;
  currentUserId?: number;
  onBack: () => void;
  onCommentAdded?: () => void;
}

const COMMENT_REACTIONS = [
  { type: "like", emoji: "👍" },
  { type: "love", emoji: "❤️" },
  { type: "haha", emoji: "😆" },
  { type: "wow", emoji: "😮" },
  { type: "sad", emoji: "😢" },
];

const reactionToEmoji: Record<string, string> = {
  like: "👍",
  love: "❤️",
  haha: "😆",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

const VIDEO_FILE_REGEX = /\.(mp4|mov|m4v|webm|mkv|3gp|m3u8)(\?.*)?$/i;

export function PostCommentsScreen({
  postId,
  post,
  currentUserId,
  onBack,
  onCommentAdded,
}: PostCommentsScreenProps) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 76 + Math.max(insets.bottom, 4);
  const inputBottomOffset = Math.max(insets.bottom, 4);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [postPreview, setPostPreview] = useState<FeedPost | null>(post || null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [reactingCommentId, setReactingCommentId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setPostPreview(post || null);
  }, [post]);

  const loadComments = useCallback(async () => {
    try {
      const res = await api.listComments(postId);
      setComments(res.comments || []);
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [postId]);

  useEffect(() => {
    setComments([]);
    setIsLoading(true);
    setText("");
    setReplyTo(null);
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    if (post) return;

    let canceled = false;
    void api
      .getPost(postId)
      .then((res) => {
        if (!canceled) setPostPreview(res.post);
      })
      .catch(() => {
        /* silent */
      });

    return () => {
      canceled = true;
    };
  }, [postId, post]);

  const handleSend = async () => {
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      await api.addComment(postId, text.trim(), replyTo?.id || null);
      setText("");
      setReplyTo(null);
      await loadComments();
      onCommentAdded?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (comment: FeedComment) => {
    Alert.alert("Xóa bình luận", "Bạn chắc chắn muốn xóa bình luận này?", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteComment(comment.id);
            setComments((prev) => prev.filter((c) => c.id !== comment.id && c.parentId !== comment.id));
          } catch {
            /* silent */
          }
        },
      },
    ]);
  };

  const handleReactComment = async (comment: FeedComment, type: string) => {
    if (!comment?.id) return;
    setReactingCommentId(comment.id);
    try {
      const response =
        comment.viewerReaction === type
          ? await api.unreactComment(comment.id)
          : await api.reactComment(comment.id, type);

      setComments((prev) =>
        prev.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                ...response.comment,
              }
            : item,
        ),
      );
    } finally {
      setReactingCommentId(null);
    }
  };

  const rootComments = useMemo(
    () => comments.filter((item) => !item.parentId),
    [comments],
  );

  const repliesByParent = useMemo(() => {
    const grouped = new Map<string, FeedComment[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      const parentId = String(comment.parentId);
      const current = grouped.get(parentId) || [];
      current.push(comment);
      grouped.set(parentId, current);
    }
    return grouped;
  }, [comments]);

  const renderCommentItem = (item: FeedComment, isReply = false) => {
    const myComment = Number(item.userId) === Number(currentUserId || 0);
    const activeReactionEmoji =
      reactionToEmoji[String(item.viewerReaction || "")] || null;

    return (
      <View
        key={`${isReply ? "reply" : "root"}-${item.id}`}
        className={`bg-surface border border-border rounded-2xl px-4 py-3 ${isReply ? "mt-2 ml-10" : "mb-3"}`}
      >
        <View className="flex-row items-start">
          <Avatar
            name={item.authorName}
            avatarUrl={item.authorAvatar}
            size="sm"
          />
          <View className="flex-1 ml-2.5">
            <View className="flex-row items-center mb-1">
              <Text className="text-primary text-xs font-semibold mr-2">
                {myComment ? "Bạn" : item.authorName}
              </Text>
              <Text className="text-muted-foreground text-[10px] flex-1">
                {formatTime(item.createdAt)}
              </Text>
              {myComment ? (
                <TouchableOpacity
                  onPress={() => { void handleDeleteComment(item); }}
                  className="w-7 h-7 items-center justify-center rounded-full"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={14} color="#6b7280" />
                </TouchableOpacity>
              ) : null}
            </View>

            <Text className="text-foreground text-sm leading-5">
              {item.content}
            </Text>

            <View className="flex-row items-center mt-2">
              <TouchableOpacity
                className="rounded-full border border-border bg-surface-secondary px-2.5 py-1 mr-2"
                onPress={() => setReplyTo(item)}
                activeOpacity={0.75}
              >
                <Text className="text-[10px] font-semibold text-muted-foreground">
                  Trả lời
                </Text>
              </TouchableOpacity>

              {activeReactionEmoji ? (
                <Text className="text-[10px] text-muted-foreground mr-2">
                  Bạn đã thả {activeReactionEmoji}
                </Text>
              ) : null}

              <Text className="text-[10px] text-muted-foreground">
                {Number(item.reactionCount || 0)} cảm xúc
              </Text>

              {reactingCommentId === item.id ? (
                <ActivityIndicator
                  className="ml-2"
                  size="small"
                  color="#0052ce"
                />
              ) : null}
            </View>

            <View className="flex-row flex-wrap mt-2">
              {COMMENT_REACTIONS.map((reaction) => {
                const isActive = item.viewerReaction === reaction.type;
                return (
                  <TouchableOpacity
                    key={`${item.id}-${reaction.type}`}
                    className={`mr-2 mb-1 rounded-full border px-2 py-1 ${isActive ? "border-primary bg-blue-50" : "border-border bg-surface-secondary"}`}
                    onPress={() => {
                      void handleReactComment(item, reaction.type);
                    }}
                    disabled={reactingCommentId === item.id}
                    activeOpacity={0.75}
                  >
                    <Text className="text-xs">{reaction.emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const previewMediaUrl = String(postPreview?.mediaUrl || "").trim();
  const previewIsVideo =
    String(postPreview?.mediaType || "").toLowerCase() === "video" ||
    VIDEO_FILE_REGEX.test(previewMediaUrl);

  return (
    <View className="flex-1 bg-background">
      <TopBar
        title="Bình luận"
        leftAction={{ label: "← Quay lại", onPress: onBack }}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
        style={{ marginBottom: tabBarHeight }}
      >
        <FlatList
          data={rootComments}
          keyExtractor={(item) => String(item.id)}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadComments();
              }}
              tintColor="#0052ce"
            />
          }
          renderItem={({ item }) => {
            const replies = repliesByParent.get(String(item.id)) || [];
            return (
              <View>
                {renderCommentItem(item)}
                {replies.map((reply) => renderCommentItem(reply, true))}
              </View>
            );
          }}
          ListHeaderComponent={
            <>
              {postPreview ? (
                <View className="bg-surface rounded-2xl border border-border px-4 py-3 mb-4">
                  <Text className="text-primary text-xs font-semibold">
                    Bài viết của {postPreview.authorName}
                  </Text>
                  <Text className="text-muted-foreground text-[10px] mt-0.5">
                    {formatTime(postPreview.createdAt)}
                  </Text>
                  <Text className="text-foreground text-sm mt-2 leading-5">
                    {postPreview.content || "Bài viết có ảnh/video"}
                  </Text>
                  {previewMediaUrl ? (
                    <View className="rounded-xl overflow-hidden mt-3 border border-border">
                      {previewIsVideo ? (
                        <TouchableOpacity
                          className="h-40 items-center justify-center bg-surface-secondary"
                          activeOpacity={0.8}
                          onPress={() => {
                            void Linking.openURL(previewMediaUrl).catch(() => undefined);
                          }}
                        >
                          <View className="w-11 h-11 rounded-full bg-primary/10 items-center justify-center mb-2">
                            <Feather name="play" size={18} color="#0052ce" />
                          </View>
                          <Text className="text-xs font-semibold text-foreground">
                            Video
                          </Text>
                          <Text className="text-[11px] text-muted-foreground mt-1">
                            Nhan de mo video
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Image
                          source={{ uri: previewMediaUrl }}
                          style={{ width: "100%", height: 160 }}
                          resizeMode="cover"
                        />
                      )}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View className="bg-surface-secondary rounded-2xl border border-border px-4 py-3 mb-4">
                <Text className="text-muted-foreground text-xs">
                  {comments.length} bình luận
                </Text>
                <Text className="text-foreground text-sm mt-1">
                  Bạn có thể trả lời bình luận và thả cảm xúc ngay dưới từng
                  bình luận.
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            !isLoading ? (
              <EmptyState
                icon="💬"
                title="Chưa có bình luận nào"
                subtitle="Hãy là người đầu tiên để lại bình luận"
              />
            ) : null
          }
        />

        <View
          className="px-4 py-3 border-t border-border bg-surface"
          style={{ paddingBottom: inputBottomOffset + 12 }}
        >
          {replyTo ? (
            <View className="mb-2 flex-row items-center justify-between rounded-xl border border-border bg-surface-secondary px-3 py-2">
              <Text
                className="text-xs text-foreground flex-1"
                numberOfLines={1}
              >
                Đang trả lời: {replyTo.authorName}
              </Text>
              <TouchableOpacity onPress={() => setReplyTo(null)}>
                <Text className="text-xs text-primary font-semibold">Hủy</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View className="flex-row items-end">
            <TextInput
              className="flex-1 min-h-11 max-h-30 rounded-2xl border border-border bg-surface-secondary px-4 py-2.5 text-sm text-foreground"
              placeholder={
                replyTo
                  ? `Trả lời ${replyTo.authorName}...`
                  : "Viết bình luận của bạn..."
              }
              placeholderTextColor="#7e8592"
              multiline
              textAlignVertical="top"
              value={text}
              onChangeText={setText}
            />
            <TouchableOpacity
              className="ml-3 bg-primary rounded-xl px-4 py-2.5"
              disabled={isSubmitting || !text.trim()}
              onPress={handleSend}
            >
              <Text className="text-white text-sm font-semibold">
                {isSubmitting ? "..." : "Gửi"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
