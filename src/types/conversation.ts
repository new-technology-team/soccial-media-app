export type Conversation = {
  id: string;
  name: string | null;
  isGroup: boolean;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
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
