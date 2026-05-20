import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { api } from "../../../lib/api";
import type { Friend, FriendTab, PendingRequest, SearchUser } from "../types";

interface UseFriendsDataArgs {
  currentUserId: number;
}

export function useFriendsData({ currentUserId }: UseFriendsDataArgs) {
  const [activeTab, setActiveTab] = useState<FriendTab>("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>(
    {},
  );

  const setLoading = useCallback((id: number, value: boolean) => {
    setActionLoading((prev) => ({ ...prev, [id]: value }));
  }, []);

  const loadFriends = useCallback(async () => {
    setIsLoadingFriends(true);
    try {
      const res = await api.listFriends();
      setFriends(
        (res.friends || []).map((item) => ({
          id: item.id,
          name: item.name,
          avatarUrl: item.avatarUrl,
        })),
      );
    } catch {
      setFriends([]);
    } finally {
      setIsLoadingFriends(false);
      setRefreshing(false);
    }
  }, []);

  const loadPending = useCallback(async () => {
    setIsLoadingPending(true);
    try {
      const res = await api.listPendingFriendRequests();
      setPendingRequests(Array.isArray(res) ? res : []);
    } catch {
      setPendingRequests([]);
    } finally {
      setIsLoadingPending(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadFriends();
    void loadPending();
  }, [loadFriends, loadPending]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (activeTab === "friends") {
      void loadFriends();
      return;
    }
    if (activeTab === "pending") {
      void loadPending();
      return;
    }
    setRefreshing(false);
  }, [activeTab, loadFriends, loadPending]);

  useEffect(() => {
    if (activeTab !== "search") return;

    const query = searchKeyword.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    let canceled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchUsers(query);
        const mapped = (res.users || [])
          .filter((item) => item.id !== currentUserId)
          .slice(0, 20)
          .map((item) => ({
            id: item.id,
            fullName: item.fullName || "Nguoi dung",
            username: item.email || item.phone || undefined,
            avatarUrl: item.avatarUrl || undefined,
          }));

        if (!canceled) {
          setSearchResults(mapped);
        }
      } catch {
        if (!canceled) {
          setSearchResults([]);
        }
      } finally {
        if (!canceled) {
          setIsSearching(false);
        }
      }
    }, 320);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [activeTab, searchKeyword, currentUserId]);

  const acceptedFriendIds = useMemo(
    () => new Set(friends.map((item) => item.id)),
    [friends],
  );

  const handleSendRequest = useCallback(
    async (targetId: number, name: string) => {
      setLoading(targetId, true);
      try {
        await api.sendFriendRequest(targetId);
        Alert.alert("Da gui", `Da gui loi moi ket ban den ${name}`);
      } catch (err) {
        Alert.alert(
          "Loi",
          err instanceof Error ? err.message : "Khong the gui loi moi",
        );
      } finally {
        setLoading(targetId, false);
      }
    },
    [setLoading],
  );

  const handleAccept = useCallback(
    async (requesterUserId: number) => {
      setLoading(requesterUserId, true);
      try {
        await api.acceptFriendRequest(requesterUserId);
        setPendingRequests((prev) =>
          prev.filter((item) => item.id !== requesterUserId),
        );
        await loadFriends();
        Alert.alert("Thanh cong", "Da chap nhan loi moi ket ban");
      } catch (err) {
        Alert.alert(
          "Loi",
          err instanceof Error ? err.message : "Khong the chap nhan",
        );
      } finally {
        setLoading(requesterUserId, false);
      }
    },
    [loadFriends, setLoading],
  );

  const handleReject = useCallback(
    async (requesterUserId: number) => {
      setLoading(requesterUserId, true);
      try {
        await api.rejectFriendRequest(requesterUserId);
        setPendingRequests((prev) =>
          prev.filter((item) => item.id !== requesterUserId),
        );
      } catch (err) {
        Alert.alert(
          "Loi",
          err instanceof Error ? err.message : "Khong the tu choi",
        );
      } finally {
        setLoading(requesterUserId, false);
      }
    },
    [setLoading],
  );

  const handleRemoveFriend = useCallback(
    (friendId: number, name: string) => {
      Alert.alert("Xoa ban be", `Ban co muon huy ket ban voi ${name}?`, [
        { text: "Huy", style: "cancel" },
        {
          text: "Xoa",
          style: "destructive",
          onPress: async () => {
            setLoading(friendId, true);
            try {
              await api.removeFriend(friendId);
              setFriends((prev) => prev.filter((item) => item.id !== friendId));
            } catch (err) {
              Alert.alert(
                "Loi",
                err instanceof Error ? err.message : "Khong the xoa",
              );
            } finally {
              setLoading(friendId, false);
            }
          },
        },
      ]);
    },
    [setLoading],
  );

  return {
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
  };
}
