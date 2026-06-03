import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
} from "react-native";
import { api } from "../../lib/api";
import type { FeedComment } from "../../types";
import { formatTime } from "../../utils";

interface CommentModalProps {
  visible: boolean;
  postId: string;
  onClose: () => void;
  onSubmit: (comment: string) => Promise<void>;
}

export function CommentModal({
  visible,
  postId,
  onClose,
  onSubmit,
}: CommentModalProps) {
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadComments = async () => {
    setIsLoading(true);
    try {
      const res = await api.listComments(postId);
      setComments(res.comments || []);
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible) loadComments();
  }, [visible, postId]);

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(comment.trim());
      setComment("");
      loadComments();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={Keyboard.dismiss}
        >
          <Pressable
            className="bg-surface rounded-t-3xl max-h-[80%]"
            onPress={() => {}}
          >
            <View className="flex-row justify-between items-center px-4 py-4 border-b border-border">
              <Text className="text-base font-bold text-foreground">
                Bình luận
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Text className="text-muted-foreground text-2xl font-light">
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={comments}
              keyExtractor={(item) => String(item.id)}
              className="max-h-100"
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View className="px-4 py-3 border-b border-surface-secondary">
                  <View className="flex-row items-center">
                    <Text className="text-primary text-xs font-semibold mr-2">
                      {item.authorName}
                    </Text>
                    <Text className="text-muted-foreground text-[10px]">
                      {formatTime(item.createdAt)}
                    </Text>
                  </View>
                  <Text className="text-foreground text-sm mt-1">
                    {item.content}
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                !isLoading ? (
                  <View className="py-8 items-center">
                    <Text className="text-muted-foreground text-sm">
                      Chưa có bình luận nào
                    </Text>
                  </View>
                ) : null
              }
            />

            <View className="flex-row items-center px-4 py-3 border-t border-border">
              <TextInput
                className="flex-1 h-11 rounded-xl border border-border bg-surface-secondary px-4 text-sm text-foreground"
                placeholder="Viết bình luận..."
                placeholderTextColor="#7e8592"
                value={comment}
                onChangeText={setComment}
              />
              <TouchableOpacity
                className="ml-3"
                onPress={handleSubmit}
                disabled={isSubmitting || !comment.trim()}
              >
                <Text
                  className={`font-bold text-sm ${comment.trim() ? "text-primary" : "text-muted-foreground"}`}
                >
                  {isSubmitting ? "..." : "Gửi"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
