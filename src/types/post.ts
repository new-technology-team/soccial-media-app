export type FeedPost = {
  id: string;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | string;
  visibility: "public" | "private";
  authorId: number;
  authorName: string;
  authorAvatar?: string | null;
  createdAt: string;
  reactionCount: number;
  commentCount: number;
  viewerReaction?: string | null;
};

export type FeedComment = {
  id: string;
  postId?: string;
  parentId?: string | null;
  content: string;
  userId: number;
  authorName: string;
  authorAvatar?: string | null;
  reactionCount: number;
  viewerReaction?: string | null;
  replyCount?: number;
  createdAt: string;
};

export type CreatePostPayload = {
  content?: string;
  mediaUrl?: string;
  visibility?: "public" | "private";
};
