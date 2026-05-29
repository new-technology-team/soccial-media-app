import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "../components/common/TopBar";
import { api } from "../lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  createdAt: string;
}

interface AIChatScreenProps {
  onExit?: () => void;
}

const WELCOME_MSG: ChatMessage = {
  id: "welcome",
  role: "ai",
  text: "Xin chào! Tôi là ZChat AI — trợ lý thông minh của bạn. Hỏi tôi bất cứ điều gì nhé! 🤖",
  createdAt: new Date().toISOString(),
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ]),
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 200);
    const a3 = anim(dot3, 400);
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#6b7280",
            opacity: dot,
          }}
        />
      ))}
    </View>
  );
}

export function AIChatScreen({ onExit }: AIChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const handleSummarize = useCallback(async () => {
    const chatMessages = messages
      .filter((m) => m.id !== "welcome" && m.text !== "__typing__")
      .map((m) => ({ role: (m.role === "user" ? "user" : "model") as "user" | "model", text: m.text }));
    if (chatMessages.length === 0) return;
    setIsSending(true);
    try {
      const res = await api.summarizeChat(chatMessages);
      setMessages((prev) => [
        ...prev,
        {
          id: `summary-${Date.now()}`,
          role: "ai",
          text: `📋 Tóm tắt cuộc trò chuyện:\n\n${res.summary}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
      // ignore
    } finally {
      setIsSending(false);
    }
  }, [messages]);

  const handleLongPressAI = useCallback((msg: ChatMessage) => {
    Alert.alert("Dịch tin nhắn", "Dịch sang tiếng Việt?", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Dịch",
        onPress: async () => {
          try {
            const res = await api.translateMessage(msg.text, "vi");
            setMessages((prev) => [
              ...prev,
              {
                id: `trans-${Date.now()}`,
                role: "ai",
                text: `🌐 Bản dịch:\n${res.translatedText}`,
                createdAt: new Date().toISOString(),
              },
            ]);
          } catch {
            // ignore
          }
        },
      },
    ]);
  }, []);

  // Lấy lịch sử chat từ backend
  useEffect(() => {
    api
      .aiHistory()
      .then((res) => {
        // Backend trả về array trực tiếp
        const rawHistory: any[] = Array.isArray(res)
          ? res
          : (res as any)?.messages || (res as any)?.history || [];
        if (rawHistory.length > 0) {
          const mapped: ChatMessage[] = rawHistory.map((item: any, idx: number) => ({
            id: `hist-${idx}`,
            role: (item.role === "user" ? "user" : "ai") as "user" | "ai",
            text: String(item.text || item.content || ""),
            createdAt: item.createdAt || new Date().toISOString(),
          }));
          setMessages([WELCOME_MSG, ...mapped]);
        }
      })
      .catch(() => {
        // lịch sử không tải được — bỏ qua
      })
      .finally(() => setIsLoadingHistory(false));
  }, []);

  // Cuộn xuống cuối khi có tin mới
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    // Tạo context history để gửi lên AI (bỏ welcome message)
    const historyForAI = messages
      .filter((m) => m.id !== "welcome")
      .slice(-10) // giữ 10 tin gần nhất
      .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("model" as const), text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    // Thêm placeholder "đang gõ"
    const typingId = `typing-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: typingId, role: "ai", text: "__typing__", createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await api.aiChat(text, historyForAI);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "ai",
        text: res.reply || "Xin lỗi, tôi không hiểu câu hỏi này.",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => prev.filter((m) => m.id !== typingId).concat(aiMsg));
    } catch (err) {
      setMessages((prev) =>
        prev.filter((m) => m.id !== typingId).concat({
          id: `err-${Date.now()}`,
          role: "ai",
          text: "⚠️ Không thể kết nối AI lúc này. Vui lòng thử lại sau.",
          createdAt: new Date().toISOString(),
        }),
      );
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, messages]);

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    const isTyping = item.text === "__typing__";

    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: isUser ? "flex-end" : "flex-start",
          marginBottom: 10,
          paddingHorizontal: 12,
        }}
      >
        {!isUser && (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#0052ce",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 8,
              alignSelf: "flex-end",
            }}
          >
            <Text style={{ fontSize: 16 }}>🤖</Text>
          </View>
        )}

        <View style={{ maxWidth: "75%" }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={!isUser && !isTyping ? () => handleLongPressAI(item) : undefined}
            delayLongPress={500}
            style={{
              backgroundColor: isUser ? "#0052ce" : "#f3f4f6",
              borderRadius: 18,
              borderBottomRightRadius: isUser ? 4 : 18,
              borderBottomLeftRadius: isUser ? 18 : 4,
              paddingHorizontal: 14,
              paddingVertical: 10,
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 3,
              elevation: 1,
            }}
          >
            {isTyping ? (
              <TypingDots />
            ) : (
              <Text
                style={{
                  color: isUser ? "#ffffff" : "#111827",
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {item.text}
              </Text>
            )}
          </TouchableOpacity>
          {!isTyping && (
            <Text
              style={{
                fontSize: 10,
                color: "#9ca3af",
                marginTop: 3,
                textAlign: isUser ? "right" : "left",
              }}
            >
              {formatTime(item.createdAt)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <TopBar
        title="ZChat AI"
        leftAction={
          onExit
            ? {
                label: "Quay lai",
                onPress: onExit,
              }
            : undefined
        }
        rightAction={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={() => { void handleSummarize(); }}
              disabled={isSending || messages.length <= 1}
              style={{ padding: 4 }}
              activeOpacity={0.7}
            >
              <Feather
                name="file-text"
                size={20}
                color={isSending || messages.length <= 1 ? "#d1d5db" : "#0052ce"}
              />
            </TouchableOpacity>
            <View
              style={{
                backgroundColor: "#dcfce7",
                borderRadius: 99,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 11, color: "#16a34a", fontWeight: "600" }}>● Online</Text>
            </View>
          </View>
        }
      />

      {/* Gợi ý ban đầu */}
      {messages.length === 1 && !isLoadingHistory && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: "600" }}>
            Gợi ý câu hỏi:
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              "Hướng dẫn đăng bài viết",
              "Cách kết bạn?",
              "Tính năng nhắn tin nhóm",
              "Cách thay đổi mật khẩu?",
            ].map((q) => (
              <TouchableOpacity
                key={q}
                onPress={() => setInput(q)}
                style={{
                  backgroundColor: "#e0e7ff",
                  borderRadius: 99,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ fontSize: 12, color: "#4f46e5" }}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Danh sách tin nhắn */}
      {isLoadingHistory ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#0052ce" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input box */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: 12,
          paddingVertical: 10,
          paddingBottom: Platform.OS === "android" ? 80 : 90,
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb",
          gap: 8,
        }}
      >
        <TextInput
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            backgroundColor: "#f3f4f6",
            borderRadius: 22,
            paddingHorizontal: 16,
            paddingVertical: 10,
            fontSize: 14,
            color: "#111827",
          }}
          placeholder="Nhắn tin với AI..."
          placeholderTextColor="#9ca3af"
          value={input}
          onChangeText={setInput}
          multiline
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!isSending}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!input.trim() || isSending}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: !input.trim() || isSending ? "#d1d5db" : "#0052ce",
            alignItems: "center",
            justifyContent: "center",
          }}
          activeOpacity={0.8}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ fontSize: 18 }}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
