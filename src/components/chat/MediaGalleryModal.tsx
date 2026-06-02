import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { api } from "../../lib/api";
import type { Message } from "../../types";
import { formatTime } from "../../utils";

interface MediaGalleryModalProps {
  visible: boolean;
  conversationId: string | null;
  conversationName?: string;
  onClose: () => void;
}

type Tab = "photos" | "files" | "links";

export function MediaGalleryModal({
  visible,
  conversationId,
  conversationName,
  onClose,
}: MediaGalleryModalProps) {
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>("photos");
  const [photosVideos, setPhotosVideos] = useState<Message[]>([]);
  const [files, setFiles] = useState<Message[]>([]);
  const [links, setLinks] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cellSize = Math.floor((width - 4) / 3);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const res = await api.getSharedContent(conversationId);
      setPhotosVideos(res.photosVideos || []);
      setFiles(res.files || []);
      setLinks(res.links || []);
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (visible && conversationId) {
      setPhotosVideos([]);
      setFiles([]);
      setLinks([]);
      void load();
    }
  }, [visible, conversationId, load]);

  const openUrl = async (url: string) => {
    if (!url) return;
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert("Không mở được", "Đường dẫn không hợp lệ.");
      return;
    }
    await Linking.openURL(url);
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "photos", label: "Ảnh/Video", count: photosVideos.length },
    { key: "files", label: "Tệp", count: files.length },
    { key: "links", label: "Liên kết", count: links.length },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center px-4 pt-12 pb-3 border-b border-border bg-surface">
          <TouchableOpacity onPress={onClose} className="mr-3" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color="#111827" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>
              Nội dung đã chia sẻ
            </Text>
            {conversationName ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {conversationName}
              </Text>
            ) : null}
          </View>
          {isLoading ? <ActivityIndicator size="small" color="#0052ce" /> : null}
        </View>

        {/* Tab bar */}
        <View className="flex-row border-b border-border bg-surface">
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              className={`flex-1 py-3 items-center border-b-2 ${activeTab === tab.key ? "border-primary" : "border-transparent"}`}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Text
                className={`text-xs font-semibold ${activeTab === tab.key ? "text-primary" : "text-muted-foreground"}`}
              >
                {tab.label}
              </Text>
              {tab.count > 0 ? (
                <Text className={`text-[10px] mt-0.5 ${activeTab === tab.key ? "text-primary" : "text-muted-foreground"}`}>
                  {tab.count}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {activeTab === "photos" ? (
          <FlatList
            data={photosVideos}
            keyExtractor={(item) => String(item.id)}
            numColumns={3}
            columnWrapperStyle={{ gap: 2 }}
            contentContainerStyle={{ gap: 2 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ width: cellSize, height: cellSize }}
                onPress={() => { void openUrl(String(item.mediaUrl || "")); }}
                activeOpacity={0.85}
              >
                {item.type === "video" ? (
                  <View
                    className="bg-surface-secondary items-center justify-center"
                    style={{ width: cellSize, height: cellSize }}
                  >
                    <Feather name="video" size={28} color="#6b7280" />
                    <Text className="text-[10px] text-muted-foreground mt-1">Video</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: String(item.mediaUrl || "") }}
                    style={{ width: cellSize, height: cellSize }}
                    resizeMode="cover"
                  />
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !isLoading ? (
                <View className="flex-1 py-20 items-center">
                  <Text className="text-4xl mb-3">🖼️</Text>
                  <Text className="text-sm text-muted-foreground">Chưa có ảnh hoặc video nào</Text>
                </View>
              ) : null
            }
          />
        ) : activeTab === "files" ? (
          <FlatList
            data={files}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="flex-row items-center bg-surface border border-border rounded-xl px-4 py-3 mb-2"
                onPress={() => { void openUrl(String(item.mediaUrl || "")); }}
                activeOpacity={0.8}
              >
                <View className="w-10 h-10 rounded-lg bg-surface-secondary items-center justify-center mr-3">
                  <Feather name="file" size={20} color="#6b7280" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                    {item.fileName || "Tệp đính kèm"}
                  </Text>
                  <Text className="text-xs text-muted-foreground mt-0.5">
                    {formatTime(item.createdAt)}
                    {item.fileSize ? ` · ${Math.round(item.fileSize / 1024)} KB` : ""}
                  </Text>
                </View>
                <Feather name="download" size={16} color="#0052ce" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !isLoading ? (
                <View className="py-20 items-center">
                  <Text className="text-4xl mb-3">📎</Text>
                  <Text className="text-sm text-muted-foreground">Chưa có tệp nào được chia sẻ</Text>
                </View>
              ) : null
            }
          />
        ) : (
          <FlatList
            data={links}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => {
              const urlsInContent = String(item.content || "").match(/https?:\/\/[^\s]+/g) || [];
              const url = urlsInContent[0] || String(item.mediaUrl || "");
              return (
                <TouchableOpacity
                  className="bg-surface border border-border rounded-xl px-4 py-3 mb-2"
                  onPress={() => { void openUrl(url); }}
                  activeOpacity={0.8}
                >
                  <Text className="text-primary text-xs font-semibold mb-1" numberOfLines={1}>
                    {url || "Liên kết"}
                  </Text>
                  {item.content && item.content !== url ? (
                    <Text className="text-sm text-foreground" numberOfLines={2}>
                      {item.content}
                    </Text>
                  ) : null}
                  <Text className="text-[10px] text-muted-foreground mt-1">
                    {formatTime(item.createdAt)} · {item.senderName}
                  </Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              !isLoading ? (
                <View className="py-20 items-center">
                  <Text className="text-4xl mb-3">🔗</Text>
                  <Text className="text-sm text-muted-foreground">Chưa có liên kết nào được chia sẻ</Text>
                </View>
              ) : null
            }
          />
        )}

        {isLoading && photosVideos.length === 0 ? (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator size="large" color="#0052ce" />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
