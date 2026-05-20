import type { AuthUser } from "../../types";

export type FriendTab = "friends" | "pending" | "search";

export type Friend = {
  id: number;
  name: string;
  avatarUrl?: string;
};

export type PendingRequest = {
  id: number;
  fullName: string;
  avatarUrl: string | null;
};

export type SearchUser = {
  id: number;
  fullName: string;
  username?: string;
  avatarUrl?: string;
};

export interface FriendsScreenProps {
  user: AuthUser;
  onMessageFriend?: (userId: number) => void;
  onOpenUserProfile?: (userId: number) => void;
}
