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
  composeKeyword,
  filteredFriends,
  groupName,
  groupMemberIds,
  isSubmittingCompose,
  onClose,
  onChangeComposeKeyword,
  onChangeGroupName,
  onToggleGroupMember,
  onCreateGroup,
}: ComposeConversationModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/45 justify-end">
        <View className="bg-surface rounded-t-3xl max-h-[85%] pb-5">
          <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
            <Text className="text-foreground text-base font-bold">
              Tạo nhóm trò chuyện
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text className="text-muted-foreground text-2xl font-light">×</Text>
            </TouchableOpacity>
          </View>

          <View className="px-4 pt-3">
            <TextInput
              className="h-11 rounded-xl border border-border bg-surface-secondary px-4 text-sm text-foreground"
              placeholder="Tên nhóm"
              placeholderTextColor="#7e8592"
              value={groupName}
              onChangeText={onChangeGroupName}
            />
          </View>

          <SearchBar
            value={composeKeyword}
            onChangeText={onChangeComposeKeyword}
            placeholder="Tìm bạn bè để thêm vào nhóm..."
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
                    <Text className="text-muted-foreground text-xs mt-0.5">Bạn bè</Text>
                  </View>
                  <Text
                    className={`text-xs font-semibold ${checked ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {checked ? "Đã chọn" : "Chọn"}
                  </Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View className="py-8">
                <EmptyState
                  icon="👥"
                  title="Không có bạn bè phù hợp"
                  subtitle="Cần ít nhất 2 bạn bè để tạo nhóm 3 người"
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
                {isSubmittingCompose ? "Đang tạo nhóm..." : "Tạo nhóm"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
