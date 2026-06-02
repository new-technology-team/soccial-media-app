import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { api } from "../../../lib/api";
import type { AuthUser, Conversation } from "../../../types";
import type { FriendCandidate } from "../types";

interface UseConversationComposeArgs {
  upsertConversation: (conversation: Conversation) => void;
  openConversation: (conversation: Conversation) => Promise<void>;
  initialDirectUserId?: number;
  initialDirectRouteKey?: number;
  onInitialDirectHandled?: () => void;
}

export function useConversationCompose({
  upsertConversation,
  openConversation,
  initialDirectUserId,
  initialDirectRouteKey,
  onInitialDirectHandled,
}: UseConversationComposeArgs) {
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeMode, setComposeMode] = useState<"direct" | "group">("direct");
  const [composeKeyword, setComposeKeyword] = useState("");
  const [searchUsers, setSearchUsers] = useState<AuthUser[]>([]);
  const [friends, setFriends] = useState<FriendCandidate[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<number[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isSubmittingCompose, setIsSubmittingCompose] = useState(false);
  const handledInitialDirectKey = useRef<number | undefined>(undefined);

  const acceptedFriends = useMemo(
    () =>
      friends.filter(
        (item) => String(item.status || "").toLowerCase() === "accepted",
      ),
    [friends],
  );

  const filteredFriends = useMemo(() => {
    const q = composeKeyword.trim().toLowerCase();
    if (!q) return acceptedFriends;
    return acceptedFriends.filter((item) =>
      String(item.name || "")
        .toLowerCase()
        .includes(q),
    );
  }, [acceptedFriends, composeKeyword]);

  const resetCompose = useCallback(() => {
    setComposeKeyword("");
    setSearchUsers([]);
    setGroupName("");
    setGroupMemberIds([]);
    setComposeMode("direct");
  }, []);

  const closeCompose = useCallback(() => {
    setShowComposeModal(false);
    resetCompose();
  }, [resetCompose]);

  const openCompose = useCallback(
    (nextMode: "direct" | "group") => {
      setShowComposeModal(true);
      setComposeMode(nextMode);
      setComposeKeyword("");
      setSearchUsers([]);
      setGroupName("");
      setGroupMemberIds([]);
    },
    [],
  );

  const loadFriends = useCallback(async () => {
    try {
      const res = await api.listFriends();
      setFriends((res.friends || []) as FriendCandidate[]);
    } catch {
      setFriends([]);
    }
  }, []);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    if (!showComposeModal || composeMode !== "direct") {
      setSearchUsers([]);
      return;
    }

    const q = composeKeyword.trim();
    if (q.length < 2) {
      setSearchUsers([]);
      return;
    }

    let canceled = false;
    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const res = await api.searchUsers(q);
        if (!canceled) {
          setSearchUsers(res.users || []);
        }
      } catch {
        if (!canceled) {
          setSearchUsers([]);
        }
      } finally {
        if (!canceled) {
          setIsSearchingUsers(false);
        }
      }
    }, 280);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [showComposeModal, composeMode, composeKeyword]);

  const handleCreateDirect = useCallback(
    async (targetUserId: number, options?: { closeCompose?: boolean }) => {
      setIsSubmittingCompose(true);
      try {
        const res = await api.createDirectConversation(targetUserId);
        upsertConversation(res.conversation);
        await openConversation(res.conversation);
        if (options?.closeCompose !== false) {
          closeCompose();
        }
      } catch (err) {
        Alert.alert(
          "Không thể tạo hội thoại",
          err instanceof Error ? err.message : "Vui lòng thử lại",
        );
      } finally {
        setIsSubmittingCompose(false);
      }
    },
    [closeCompose, openConversation, upsertConversation],
  );

  useEffect(() => {
    if (!initialDirectUserId || !initialDirectRouteKey) return;
    if (handledInitialDirectKey.current === initialDirectRouteKey) return;

    handledInitialDirectKey.current = initialDirectRouteKey;
    void handleCreateDirect(initialDirectUserId, { closeCompose: false }).finally(
      () => onInitialDirectHandled?.(),
    );
  }, [
    handleCreateDirect,
    initialDirectRouteKey,
    initialDirectUserId,
    onInitialDirectHandled,
  ]);

  const toggleGroupMember = useCallback((userId: number) => {
    setGroupMemberIds((prev) =>
      prev.includes(userId)
        ? prev.filter((item) => item !== userId)
        : [...prev, userId],
    );
  }, []);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim()) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập tên nhóm.");
      return;
    }

    if (groupMemberIds.length < 2) {
      Alert.alert(
        "Thiếu thành viên",
        "Nhóm cần ít nhất 3 người (bạn và 2 thành viên khác).",
      );
      return;
    }

    setIsSubmittingCompose(true);
    try {
      const res = await api.createGroupConversation({
        name: groupName.trim(),
        memberIds: groupMemberIds,
      });
      upsertConversation(res.conversation);
      await openConversation(res.conversation);
      closeCompose();
    } catch (err) {
      Alert.alert(
        "Không thể tạo nhóm",
        err instanceof Error ? err.message : "Vui lòng thử lại",
      );
    } finally {
      setIsSubmittingCompose(false);
    }
  }, [
    closeCompose,
    groupMemberIds,
    groupName,
    openConversation,
    upsertConversation,
  ]);

  return {
    showComposeModal,
    composeMode,
    composeKeyword,
    searchUsers,
    groupName,
    groupMemberIds,
    filteredFriends,
    isSearchingUsers,
    isSubmittingCompose,
    setComposeMode,
    setComposeKeyword,
    setGroupName,
    openCompose,
    closeCompose,
    toggleGroupMember,
    handleCreateDirect,
    handleCreateGroup,
  };
}
