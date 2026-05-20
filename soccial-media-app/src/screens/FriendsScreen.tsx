import React from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { TopBar } from "../components/common/TopBar";
import {
  FriendRow,
  FriendsListPlaceholder,
  FriendsSearchInput,
  FriendsTabs,
  PendingRequestRow,
  SearchUserRow,
} from "./friends/components";
import { useFriendsData } from "./friends/hooks/useFriendsData";
import type { Friend, FriendsScreenProps, PendingRequest, SearchUser } from "./friends/types";

export function FriendsScreen({
  user,
  onMessageFriend,
  onOpenUserProfile,
}: FriendsScreenProps) {
  const {
    activeTab,
    setActiveTab,
    friends,
    pendingRequests,
    searchKeyword,
    setSearchKeyword,
    searchResults,
    isLoadingFriends,
    isLoadingPending,
    isSearching,
    refreshing,
    actionLoading,
    acceptedFriendIds,
    handleRefresh,
    handleSendRequest,
    handleAccept,
    handleReject,
    handleRemoveFriend,
  } = useFriendsData({ currentUserId: user.id });

  const renderFriend = ({ item }: { item: Friend }) => (
    <FriendRow
      item={item}
      isLoading={actionLoading[item.id]}
      onOpenUserProfile={onOpenUserProfile}
      onMessageFriend={onMessageFriend}
      onRemoveFriend={handleRemoveFriend}
    />
  );

  const renderPending = ({ item }: { item: PendingRequest }) => (
    <PendingRequestRow
      item={item}
      isLoading={actionLoading[item.id]}
      onOpenUserProfile={onOpenUserProfile}
      onAccept={handleAccept}
      onReject={handleReject}
    />
  );

  const renderSearchUser = ({ item }: { item: SearchUser }) => (
    <SearchUserRow
      item={item}
      isFriend={acceptedFriendIds.has(item.id)}
      isLoading={actionLoading[item.id]}
      onOpenUserProfile={onOpenUserProfile}
      onSendRequest={handleSendRequest}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      <TopBar title="Ban be" />

      <FriendsTabs
        activeTab={activeTab}
        friendCount={friends.length}
        pendingCount={pendingRequests.length}
        onChangeTab={setActiveTab}
      />

      {activeTab === "search" ? (
        <FriendsSearchInput
          value={searchKeyword}
          onChangeText={setSearchKeyword}
          onClear={() => setSearchKeyword("")}
        />
      ) : null}

      {activeTab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderFriend}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0052ce" />
          }
          ListEmptyComponent={
            <FriendsListPlaceholder
              loading={isLoadingFriends}
              icon="👥"
              title="Chua co ban be nao"
              subtitle="Chuyen sang tab Tim ban de ket noi them ban moi."
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      ) : null}

      {activeTab === "pending" ? (
        <FlatList
          data={pendingRequests}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPending}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0052ce" />
          }
          ListEmptyComponent={
            <FriendsListPlaceholder
              loading={isLoadingPending}
              icon="📬"
              title="Khong co loi moi nao"
              subtitle="Khi co nguoi gui loi moi ket ban, chung se hien thi o day."
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      ) : null}

      {activeTab === "search" ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSearchUser}
          ListHeaderComponent={
            isSearching ? (
              <View style={{ alignItems: "center", paddingTop: 20 }}>
                <ActivityIndicator size="small" color="#0052ce" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !isSearching ? (
              <FriendsListPlaceholder
                loading={false}
                icon="🔍"
                title={searchKeyword.length >= 2 ? "Khong tim thay nguoi dung" : "Tim kiem ban be"}
                subtitle={
                  searchKeyword.length >= 2
                    ? "Thu lai voi tu khoa khac"
                    : "Nhap it nhat 2 ky tu de tim ban"
                }
              />
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      ) : null}
    </View>
  );
}
