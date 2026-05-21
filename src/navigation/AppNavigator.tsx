import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";

interface Tab {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}

const TABS: Tab[] = [
  { key: "feed", label: "Bang tin", icon: "home" },
  { key: "search", label: "Tim kiem", icon: "search" },
  { key: "messages", label: "Tin nhan", icon: "message-circle" },
  { key: "friends", label: "Ban be", icon: "users" },
  { key: "notifications", label: "Thong bao", icon: "bell" },
  { key: "profile", label: "Ho so", icon: "user" },
];

interface AppNavigatorProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function AppNavigator({ activeTab, onTabChange }: AppNavigatorProps) {
  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-surface border-t border-border flex-row items-center pb-2.5"
      style={{ height: 70 }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const color = isActive ? "#0052ce" : "#6b7280";
        return (
          <TouchableOpacity
            key={tab.key}
            className="flex-1 items-center justify-center py-1.5"
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            {isActive ? (
              <View className="absolute top-1 w-1 h-1 rounded-full bg-primary" />
            ) : null}
            <Feather name={tab.icon} size={20} color={color} />
            <Text
              className={`text-[10px] font-semibold mt-1 ${isActive ? "text-primary" : "text-muted-foreground"}`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
