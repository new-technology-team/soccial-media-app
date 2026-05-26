export type Conversation = {
  id: string;
  name: string | null;
  isGroup: boolean;
  type?: "group" | "direct" | string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  viewerSettings?: {
    notificationsEnabled: boolean;
  };
  directPeerId?: number | null;
  isBlockedByMe?: boolean;
  isBlockedMe?: boolean;
  members?: Array<{
    userId: number;
    fullName: string;
    avatarUrl?: string | null;
    role?: string;
    notificationsEnabled?: boolean;
  }>;
  participants?: Array<{ userId: number; name: string; avatarUrl?: string }>;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: number;
  senderName: string;
  content: string;
  createdAt: string;
  isRecalled?: boolean;
  isRemovedForMe?: boolean;
};

export type SendMessagePayload = {
  conversationId: string;
  content: string;
};
