import React from "react";
import { View } from "react-native";
import type { FriendTab } from "../types";
import { TabButton } from "./TabButton";

interface FriendsTabsProps {
  activeTab: FriendTab;
  friendCount: number;
  pendingCount: number;
  onChangeTab: (tab: FriendTab) => void;
}

export function FriendsTabs({
  activeTab,
  friendCount,
  pendingCount,
  onChangeTab,
}: FriendsTabsProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
      }}
    >
      <TabButton
        label="Ban be"
        count={friendCount}
        active={activeTab === "friends"}
        onPress={() => onChangeTab("friends")}
      />
      <TabButton
        label="Loi moi"
        count={pendingCount}
        active={activeTab === "pending"}
        onPress={() => onChangeTab("pending")}
      />
      <TabButton
        label="Tim ban"
        active={activeTab === "search"}
        onPress={() => onChangeTab("search")}
      />
    </View>
  );
}
