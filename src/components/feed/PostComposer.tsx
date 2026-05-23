import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Avatar } from "../common/Avatar";
import { api } from "../../lib/api";

interface PostComposerProps {
  visible: boolean;
  userName: string;
  onClose: () => void;
  onPost: (payload: {
    content?: string;
    mediaUrl?: string;
    visibility: "public" | "private";
  }) => Promise<void>;
  mode?: "create" | "edit";
  initialValue?: {
    content?: string;
    mediaUrl?: string;
    visibility?: "public" | "private";
  };
}

export function PostComposer({
  visible,
  userName,
  onClose,
  onPost,
  mode = "create",
  initialValue,
}: PostComposerProps) {
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [isPosting, setIsPosting] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setContent(initialValue?.content || "");
    setMediaUrl(initialValue?.mediaUrl || "");
    setVisibility(initialValue?.visibility || "public");
  }, [visible, initialValue]);

  const handleSubmit = async () => {
    const nextContent = content.trim();
    const nextMedia = mediaUrl.trim();
    if (!nextContent && !nextMedia) return;

    setIsPosting(true);
    try {
      await onPost({
        content: nextContent || undefined,
        mediaUrl: nextMedia || undefined,
        visibility,
      });
      setContent("");
      setMediaUrl("");
      setVisibility("public");
      onClose();
    } finally {
      setIsPosting(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Thiếu quyền truy cập",
          "Vui lòng cho phép ứng dụng truy cập thư viện ảnh.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert("Upload thất bại", "Không đọc được dữ liệu ảnh.");
        return;
      }

      const approxBytes = Math.floor((asset.base64.length * 3) / 4);
      if (approxBytes > 10 * 1024 * 1024) {
        Alert.alert(
          "Upload that bai",
          "Anh qua lon. Vui long chon anh nho hon 10MB.",
        );
        return;
      }

      setIsUploadingMedia(true);
      const uploaded = await api.uploadPostMediaBase64({
        fileName: asset.fileName || `post-${Date.now()}.jpg`,
        contentType: asset.mimeType || "image/jpeg",
        base64Data: asset.base64,
      });

      if (!uploaded.fileUrl) {
        throw new Error("Không nhận được URL ảnh từ server.");
      }

      setMediaUrl(uploaded.fileUrl);
    } catch (err) {
      Alert.alert(
        "Upload thất bại",
        err instanceof Error ? err.message : "Không thể upload ảnh",
      );
    } finally {
      setIsUploadingMedia(false);
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={Keyboard.dismiss}
        >
          <TouchableWithoutFeedback
            onPress={Keyboard.dismiss}
            accessible={false}
          >
            <View className="bg-surface rounded-t-3xl p-6 pb-8">
              <View className="flex-row justify-between items-center mb-4">
                <TouchableOpacity onPress={onClose}>
                  <Text className="text-muted-foreground text-sm">Hủy</Text>
                </TouchableOpacity>
                <Text className="text-base font-bold text-foreground">
                  {mode === "edit" ? "Chỉnh sửa bài viết" : "Tạo bài viết"}
                </Text>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={isPosting || (!content.trim() && !mediaUrl.trim())}
                >
                  <Text
                    className={`font-bold text-sm ${content.trim() || mediaUrl.trim() ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {isPosting
                      ? "Đang lưu..."
                      : mode === "edit"
                        ? "Lưu"
                        : "Đăng"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center mb-4">
                <Avatar name={userName} size="md" />
                <View className="ml-3">
                  <Text className="text-foreground font-semibold text-sm">
                    {userName}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {visibility === "public" ? "🌐 Công khai" : "🔒 Riêng tư"}
                  </Text>
                </View>
              </View>

              <View className="flex-row mb-3">
                <TouchableOpacity
                  className={`flex-1 rounded-xl py-2.5 items-center mr-2 ${visibility === "public" ? "bg-primary" : "bg-surface-secondary border border-border"}`}
                  onPress={() => setVisibility("public")}
                >
                  <Text
                    className={`text-xs font-semibold ${visibility === "public" ? "text-white" : "text-foreground"}`}
                  >
                    🌐 Công khai
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 rounded-xl py-2.5 items-center ml-2 ${visibility === "private" ? "bg-primary" : "bg-surface-secondary border border-border"}`}
                  onPress={() => setVisibility("private")}
                >
                  <Text
                    className={`text-xs font-semibold ${visibility === "private" ? "text-white" : "text-foreground"}`}
                  >
                    🔒 Riêng tư
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="rounded-xl border border-border bg-surface-secondary px-4 py-3">
                <TextInput
                  className="min-h-30 max-h-55 text-sm text-foreground text-start"
                  placeholder="Bạn đang nghĩ gì?"
                  placeholderTextColor="#7e8592"
                  multiline
                  value={content}
                  onChangeText={setContent}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                className="self-start mt-2"
                onPress={Keyboard.dismiss}
                activeOpacity={0.7}
              >
                <Text className="text-xs text-primary font-semibold">
                  Ẩn bàn phím
                </Text>
              </TouchableOpacity>

              <View className="rounded-xl border border-border bg-surface-secondary px-4 mt-3">
                <TextInput
                  className="h-11 text-sm text-foreground"
                  placeholder="Dán link ảnh/video (tùy chọn)"
                  placeholderTextColor="#7e8592"
                  value={mediaUrl}
                  onChangeText={setMediaUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View className="mt-3 flex-row items-center">
                <TouchableOpacity
                  className="rounded-xl border border-border bg-surface-secondary px-4 py-2.5"
                  onPress={() => {
                    void handlePickImage();
                  }}
                  disabled={isUploadingMedia}
                >
                  <Text className="text-foreground text-xs font-semibold">
                    {isUploadingMedia
                      ? "Đang upload ảnh..."
                      : "Chọn ảnh từ máy"}
                  </Text>
                </TouchableOpacity>
                {isUploadingMedia ? (
                  <ActivityIndicator className="ml-3" color="#0052ce" />
                ) : null}
              </View>

              {mediaUrl ? (
                <View className="mt-3 rounded-xl overflow-hidden border border-border">
                  <Image
                    source={{ uri: mediaUrl }}
                    style={{ width: "100%", height: 180 }}
                    resizeMode="cover"
                  />
                </View>
              ) : null}
            </View>
          </TouchableWithoutFeedback>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
