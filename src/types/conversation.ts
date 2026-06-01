export type Conversation = {
  id: string;
  name: string | null;
  avatarUrl?: string | null;
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
  isPinned?: boolean;
  isMuted?: boolean;
  mutedUntil?: string | null;
  members?: Array<{
    userId: number;
    fullName: string;
    avatarUrl?: string | null;
    role?: string;
    notificationsEnabled?: boolean;
    nickname?: string | null;
    lastReadAt?: string | null;
    lastReadMessageId?: string | null;
  }>;
  participants?: Array<{ userId: number; name: string; avatarUrl?: string }>;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: number;
  senderName: string;
  content: string;
  type?: string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  meta?: Record<string, any> | null;
  createdAt: string;
  isRecalled?: boolean;
  isRemovedForMe?: boolean;
  isPinned?: boolean;
  readBy?: Array<{ userId: number; at?: string }>;
  replyTo?: {
    id: string;
    senderId: number;
    senderName: string;
    content: string;
    type?: string;
  } | null;
  reactions?: Array<{ type: string; count: number; viewerReacted: boolean }>;
};

export type SendMessagePayload = {
  conversationId: string;
  content: string;
};
