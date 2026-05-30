import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Tab {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}

const BASE_TABS: Tab[] = [
  { key: "feed",     label: "Bảng tin", icon: "activity" },
  { key: "search",   label: "Khám phá", icon: "compass" },
  { key: "messages", label: "Tin nhắn", icon: "message-circle" },
  { key: "friends",  label: "Bạn bè",   icon: "users" },
  { key: "profile",  label: "Hồ sơ",    icon: "user" },
];

interface AppNavigatorProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  userRole?: string;
}

export function AppNavigator({ activeTab, onTabChange, userRole }: AppNavigatorProps) {
  const insets = useSafeAreaInsets();

  const tabs: Tab[] = [...BASE_TABS];
  if (userRole === "admin") {
    tabs.push({ key: "admin", label: "Quản trị", icon: "shield" });
  } else if (userRole === "moderator") {
    tabs.push({ key: "mod", label: "Kiểm duyệt", icon: "shield" });
  }

  const hasExtra = tabs.length > 5;
  const iconSize = hasExtra ? 20 : 22;
  const labelSize = hasExtra ? "text-[9px]" : "text-[10px]";

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-surface border-t border-border flex-row items-center"
      style={{ paddingTop: 8, paddingBottom: Math.max(insets.bottom, 4) }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const isSpecial = tab.key === "admin" || tab.key === "mod";
        const activeColor = isSpecial
          ? (tab.key === "admin" ? "#0052ce" : "#16a34a")
          : "#0052ce";
        const color = isActive ? activeColor : "#6b7280";
        return (
          <TouchableOpacity
            key={tab.key}
            className="flex-1 items-center justify-center"
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            <Feather name={tab.icon} size={iconSize} color={color} />
            <View
              className="w-4 h-0.5 rounded-full mt-0.5"
              style={{ backgroundColor: isActive ? activeColor : "transparent" }}
            />
            <Text
              className={`${labelSize} font-semibold mt-0.5`}
              style={{ color: isActive ? activeColor : "#6b7280" }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
