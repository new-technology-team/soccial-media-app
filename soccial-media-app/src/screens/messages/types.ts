import type { AuthUser } from "../../types";

export type FriendCandidate = {
  id: number;
  name: string;
  avatarUrl?: string;
  status?: string;
  requestedByMe?: boolean;
};

export interface MessagesScreenProps {
  user: AuthUser;
  mode?: "all" | "groups";
  initialDirectUserId?: number;
  initialDirectRouteKey?: number;
  onInitialDirectHandled?: () => void;
}
