import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Tab {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}

const TABS: Tab[] = [
  { key: "feed",     label: "Bảng tin", icon: "activity" },
  { key: "search",   label: "Khám phá", icon: "compass" },
  { key: "messages", label: "Tin nhắn", icon: "message-circle" },
  { key: "friends",  label: "Bạn bè",   icon: "users" },
  { key: "profile",  label: "Hồ sơ",    icon: "user" },
];

interface AppNavigatorProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function AppNavigator({ activeTab, onTabChange }: AppNavigatorProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-surface border-t border-border flex-row items-center"
      style={{ paddingTop: 8, paddingBottom: Math.max(insets.bottom, 4) }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const color = isActive ? "#0052ce" : "#6b7280";
        return (
          <TouchableOpacity
            key={tab.key}
            className="flex-1 items-center justify-center"
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            <Feather name={tab.icon} size={22} color={color} />
            <View className="w-4 h-0.5 rounded-full mt-0.5" style={{ backgroundColor: isActive ? "#0052ce" : "transparent" }} />
            <Text
              className={`text-[10px] font-semibold mt-0.5 ${isActive ? "text-primary" : "text-muted-foreground"}`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
