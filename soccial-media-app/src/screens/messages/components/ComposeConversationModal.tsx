import React from "react";
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { EmptyState } from "../../../components/common/EmptyState";
import { SearchBar } from "../../../components/search/SearchBar";
import type { AuthUser } from "../../../types";
import type { FriendCandidate } from "../types";

interface ComposeConversationModalProps {
  visible: boolean;
  composeMode: "direct" | "group";
  composeKeyword: string;
  searchUsers: AuthUser[];
  filteredFriends: FriendCandidate[];
  groupName: string;
  groupMemberIds: number[];
  isSearchingUsers: boolean;
  isSubmittingCompose: boolean;
  onClose: () => void;
  onChangeComposeMode: (mode: "direct" | "group") => void;
  onChangeComposeKeyword: (value: string) => void;
  onChangeGroupName: (value: string) => void;
  onToggleGroupMember: (userId: number) => void;
  onCreateDirect: (targetUserId: number) => void;
  onCreateGroup: () => void;
}

export function ComposeConversationModal({
  visible,
  composeMode,
  composeKeyword,
  searchUsers,
  filteredFriends,
  groupName,
  groupMemberIds,
  isSearchingUsers,
  isSubmittingCompose,
  onClose,
  onChangeComposeMode,
  onChangeComposeKeyword,
  onChangeGroupName,
  onToggleGroupMember,
  onCreateDirect,
  onCreateGroup,
}: ComposeConversationModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/45 justify-end">
        <View className="bg-surface rounded-t-3xl max-h-[85%] pb-5">
          <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
            <Text className="text-foreground text-base font-bold">
              {composeMode === "direct" ? "Tao hoi thoai moi" : "Tao nhom tro chuyen"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text className="text-muted-foreground text-2xl font-light">×</Text>
            </TouchableOpacity>
          </View>

          <View className="px-4 py-3 flex-row">
            <TouchableOpacity
              className={`flex-1 rounded-xl py-2.5 items-center mr-2 ${composeMode === "direct" ? "bg-primary" : "bg-surface-secondary border border-border"}`}
              onPress={() => {
                onChangeComposeMode("direct");
                onChangeComposeKeyword("");
              }}
            >
              <Text
                className={`text-xs font-semibold ${composeMode === "direct" ? "text-white" : "text-foreground"}`}
              >
                Nhan rieng
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-xl py-2.5 items-center ml-2 ${composeMode === "group" ? "bg-primary" : "bg-surface-secondary border border-border"}`}
              onPress={() => {
                onChangeComposeMode("group");
                onChangeComposeKeyword("");
              }}
            >
              <Text
                className={`text-xs font-semibold ${composeMode === "group" ? "text-white" : "text-foreground"}`}
              >
                Tao nhom
              </Text>
            </TouchableOpacity>
          </View>

          {composeMode === "direct" ? (
            <>
              <SearchBar
                value={composeKeyword}
                onChangeText={onChangeComposeKeyword}
                placeholder="Tim nguoi dung de nhan tin..."
              />
              <FlatList
                data={searchUsers}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    className="px-4 py-3 border-b border-border"
                    disabled={isSubmittingCompose}
                    onPress={() => onCreateDirect(item.id)}
                  >
                    <Text className="text-foreground font-semibold text-sm">{item.fullName}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {item.email || item.phone || "Nguoi dung"}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  composeKeyword.trim().length < 2 ? (
                    <View className="py-8">
                      <EmptyState
                        icon="👥"
                        title="Tim nguoi de bat dau chat"
                        subtitle="Nhap it nhat 2 ky tu"
                      />
                    </View>
                  ) : isSearchingUsers ? (
                    <View className="py-8">
                      <EmptyState icon="⏳" title="Dang tim kiem..." />
                    </View>
                  ) : (
                    <View className="py-8">
                      <EmptyState icon="🔍" title="Khong tim thay nguoi dung" />
                    </View>
                  )
                }
              />
            </>
          ) : (
            <>
              <View className="px-4">
                <TextInput
                  className="h-11 rounded-xl border border-border bg-surface-secondary px-4 text-sm text-foreground"
                  placeholder="Ten nhom"
                  placeholderTextColor="#7e8592"
                  value={groupName}
                  onChangeText={onChangeGroupName}
                />
              </View>

              <SearchBar
                value={composeKeyword}
                onChangeText={onChangeComposeKeyword}
                placeholder="Tim ban be de them vao nhom..."
              />

              <FlatList
                data={filteredFriends}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const checked = groupMemberIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      className="px-4 py-3 border-b border-border flex-row items-center justify-between"
                      onPress={() => onToggleGroupMember(item.id)}
                    >
                      <View>
                        <Text className="text-foreground font-semibold text-sm">{item.name}</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">Ban be</Text>
                      </View>
                      <Text
                        className={`text-xs font-semibold ${checked ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {checked ? "Da chon" : "Chon"}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View className="py-8">
                    <EmptyState
                      icon="👥"
                      title="Khong co ban be phu hop"
                      subtitle="Chi ban be da chap nhan moi them duoc vao nhom"
                    />
                  </View>
                }
              />

              <View className="px-4 pt-3">
                <TouchableOpacity
                  className={`rounded-xl py-3 items-center ${isSubmittingCompose ? "bg-primary/60" : "bg-primary"}`}
                  disabled={isSubmittingCompose}
                  onPress={onCreateGroup}
                >
                  <Text className="text-white font-semibold text-sm">
                    {isSubmittingCompose ? "Dang tao nhom..." : "Tao nhom"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
