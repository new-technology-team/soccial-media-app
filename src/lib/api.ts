import { authStore } from "./auth";
import { normalizeServiceUrl } from "./service-url";
import { Buffer } from "buffer";
import type {
  AuthUser,
  AuthResponse,
  RegisterResponse,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
  ChangePasswordPayload,
  FeedPost,
  FeedComment,
  CreatePostPayload,
  Conversation,
  Message,
  Notification,
} from "../types";

const DEFAULT_API_URL = "http://10.0.2.2:5000";
const API_URL = normalizeServiceUrl(
  process.env.EXPO_PUBLIC_API_URL,
  DEFAULT_API_URL,
);
const API_ORIGIN = (() => {
  try {
    return new URL(API_URL).origin;
  } catch {
    return API_URL.replace(/\/+$/, "");
  }
})();
const REQUEST_TIMEOUT_MS = Number(
  process.env.EXPO_PUBLIC_API_TIMEOUT_MS || 20000,
);

let refreshTokenInFlight: Promise<string | null> | null = null;

type HttpResult = {
  status: number;
  responseText: string;
};

function parseJsonSafe(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshTokenInFlight) return refreshTokenInFlight;

  refreshTokenInFlight = (async () => {
    const current = authStore.getTokens();
    const refreshToken = current?.refreshToken;
    if (!refreshToken) return null;

    try {
      const result = await performHttpRequest(
        `${API_URL}/api/auth/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken }),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (result.status < 200 || result.status >= 300) {
        return null;
      }

      const data = parseJsonSafe(result.responseText);
      const nextAccessToken = String(data?.accessToken || data?.access_token || "").trim();
      const nextRefreshToken = String(data?.refreshToken || data?.refresh_token || refreshToken).trim();

      if (!nextAccessToken) return null;

      await authStore.setTokens({
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
      });
      return nextAccessToken;
    } catch {
      return null;
    } finally {
      refreshTokenInFlight = null;
    }
  })();

  return refreshTokenInFlight;
}

function performHttpRequest(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open((options.method || "GET").toUpperCase(), url, true);
    xhr.timeout = timeoutMs;

    const requestHeaders = new Headers(options.headers || {});
    requestHeaders.forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.onload = () => {
      const status = Number(xhr.status || 0);
      if (!Number.isFinite(status) || status < 200 || status > 599) {
        reject(new Error(`NETWORK_STATUS_INVALID:${status || "unknown"}`));
        return;
      }
      resolve({
        status,
        responseText: String(xhr.responseText || ""),
      });
    };

    xhr.onerror = () => reject(new Error("NETWORK_REQUEST_FAILED"));
    xhr.ontimeout = () => reject(new Error("NETWORK_TIMEOUT"));
    xhr.onabort = () => reject(new Error("NETWORK_ABORTED"));

    if (options.body !== undefined && options.body !== null) {
      xhr.send(options.body as any);
    } else {
      xhr.send();
    }
  });
}

function normalizeNetworkError(error: Error): string {
  if (error.message === "NETWORK_TIMEOUT") {
    const connectionHint = API_URL.includes("10.0.2.2")
      ? " Neu ban dung Expo Go tren dien thoai that, doi EXPO_PUBLIC_API_URL sang IP LAN cua may tinh (vi du http://192.168.x.x:5000)."
      : "";
    return `Khong nhan duoc phan hoi tu server sau ${Math.round(REQUEST_TIMEOUT_MS / 1000)} giay. Kiem tra API URL: ${API_URL}.${connectionHint}`;
  }

  if (
    error.message === "NETWORK_REQUEST_FAILED" ||
    error.message === "NETWORK_ABORTED" ||
    error.message.startsWith("NETWORK_STATUS_INVALID")
  ) {
    return `Khong the ket noi den server (${API_URL}). Kiem tra backend dang chay va EXPO_PUBLIC_API_URL phu hop thiet bi.`;
  }

  return error.message;
}

async function requestWithXhr<T>(
  path: string,
  options: RequestInit = {},
  allowRetry = true,
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const tokens = authStore.getTokens();

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens?.accessToken}`);
  }

  const url = `${API_URL}${path}`;

  let result: HttpResult;
  try {
    result = await performHttpRequest(
      url,
      {
        ...options,
        headers,
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch (error: any) {
    if (error instanceof Error) {
      throw new Error(normalizeNetworkError(error));
    }
    throw new Error(
      `Khong the ket noi den server (${API_URL}). Kiem tra backend dang chay va EXPO_PUBLIC_API_URL phu hop thiet bi.`,
    );
  }

  const data = parseJsonSafe(result.responseText);

  if (
    result.status === 401 &&
    allowRetry &&
    !path.startsWith("/api/auth/login") &&
    !path.startsWith("/api/auth/register") &&
    !path.startsWith("/api/auth/refresh")
  ) {
    const nextAccessToken = await refreshAccessToken();
    if (nextAccessToken) {
      const retryHeaders = new Headers(options.headers || {});
      if (!retryHeaders.has("Content-Type")) {
        retryHeaders.set("Content-Type", "application/json");
      }
      retryHeaders.set("Authorization", `Bearer ${nextAccessToken}`);

      return requestWithXhr<T>(
        path,
        {
          ...options,
          headers: retryHeaders,
        },
        false,
      );
    }
  }

  if (result.status === 401) {
    await authStore.clear();
  }

  if (result.status < 200 || result.status >= 300) {
    const detailedMessage =
      data?.message ||
      data?.issues?.[0]?.message ||
      data?.issues?.[0]?.path?.join?.(".") ||
      `Request failed with status ${result.status}`;
    throw new Error(String(detailedMessage));
  }

  return data as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  return requestWithXhr<T>(path, options, true);

  /*
  const headers = new Headers(options.headers || {});
  const tokens = authStore.getTokens();

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens?.accessToken}`);
  }

  const timeoutId = setTimeout(() => undefined, REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error: any) {
    if (error instanceof Error && error.name === "AbortError") {
      const connectionHint = API_URL.includes("10.0.2.2")
        ? " Nếu bạn dùng Expo Go trên điện thoại thật, hãy đổi EXPO_PUBLIC_API_URL sang IP LAN của máy tính (ví dụ http://192.168.100.116:5000)."
        : "";

      throw new Error(
        `Không nhận được phản hồi từ server sau ${Math.round(REQUEST_TIMEOUT_MS / 1000)} giây. Kiểm tra API URL: ${API_URL}.${connectionHint}`,
      );
    }

    throw new Error(
      `Không thể kết nối đến server (${API_URL}). Kiểm tra backend đang chạy và EXPO_PUBLIC_API_URL phù hợp thiết bị.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detailedMessage =
      data?.message ||
      data?.issues?.[0]?.message ||
      data?.issues?.[0]?.path?.join?.(".") ||
      "Request failed";
    throw new Error(detailedMessage);
  }

  return data as T;
  */
}

function toStringId(value: unknown): string {
  return String(value ?? "");
}

function resolveAssetUrl(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;

  if (
    /^https?:\/\//i.test(raw) ||
    raw.startsWith("data:") ||
    raw.startsWith("file:") ||
    raw.startsWith("blob:")
  ) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return `${API_ORIGIN}${raw}`;
  }

  return `${API_ORIGIN}/${raw.replace(/^\/+/, "")}`;
}

function mapAuthUser(raw: any): AuthUser {
  const rawSex = Number(raw?.sex);
  const normalizedGender =
    raw?.gender ||
    (rawSex === 1 ? "male" : rawSex === 2 ? "female" : rawSex === 0 ? "other" : null);

  return {
    id: Number(raw?.id ?? raw?.userId ?? raw?.user_id ?? 0),
    email: raw?.email || null,
    phone: raw?.phone || null,
    fullName: String(raw?.fullName || raw?.full_name || raw?.displayName || "Người dùng"),
    avatarUrl: resolveAssetUrl(raw?.avatarUrl || raw?.avatar_url) || null,
    dateOfBirth: raw?.dateOfBirth ? String(raw.dateOfBirth) : null,
    gender: normalizedGender || null,
    isVerified: Boolean(raw?.isVerified ?? raw?.is_verified ?? false),
    role: raw?.role,
    accountStatus: raw?.accountStatus || raw?.status,
    createdAt: raw?.createdAt ? String(raw.createdAt) : undefined,
  };
}

function mapFeedPost(raw: any): FeedPost {
  const owner = raw?.owner || {};
  return {
    id: toStringId(raw?.id ?? raw?._id),
    content: String(raw?.content || ""),
    mediaUrl: resolveAssetUrl(raw?.mediaUrl),
    visibility: raw?.visibility === "private" ? "private" : "public",
    authorId: Number(raw?.authorId || owner?.userId || 0),
    authorName: String(raw?.authorName || owner?.displayName || "Người dùng"),
    authorAvatar: resolveAssetUrl(raw?.authorAvatar || owner?.avatarUrl) || null,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    reactionCount: Number(raw?.reactionCount || 0),
    commentCount: Number(raw?.commentCount || 0),
    viewerReaction: raw?.viewerReaction || null,
  };
}

function mapFeedComment(raw: any): FeedComment {
  return {
    id: toStringId(raw?.id ?? raw?._id),
    postId: raw?.postId ? toStringId(raw.postId) : undefined,
    parentId: raw?.parentId ? toStringId(raw.parentId) : null,
    content: String(raw?.content || ""),
    userId: Number(raw?.userId || 0),
    authorName: String(raw?.authorName || "Người dùng"),
    authorAvatar: resolveAssetUrl(raw?.authorAvatar) || null,
    reactionCount: Number(raw?.reactionCount || 0),
    viewerReaction: raw?.viewerReaction || null,
    replyCount: Number(raw?.replyCount || 0),
    createdAt: String(raw?.createdAt || new Date().toISOString()),
  };
}

function mapConversation(raw: any): Conversation {
  const lastMessage = raw?.lastMessage;
  const lastMessageText =
    typeof lastMessage === "string"
      ? lastMessage
      : lastMessage?.text ||
        lastMessage?.body ||
        (lastMessage?.mediaUrl ? "Tin nhắn đa phương tiện" : undefined);

  const participants = (raw?.members || raw?.participants || []).map(
    (member: any) => ({
      userId: Number(member?.userId || 0),
      name: String(member?.fullName || member?.name || "Người dùng"),
      avatarUrl: resolveAssetUrl(member?.avatarUrl) || undefined,
    }),
  );

  const members = (raw?.members || []).map((member: any) => ({
    userId: Number(member?.userId || 0),
    fullName: String(
      member?.fullName || member?.displayName || member?.name || "Nguoi dung",
    ),
    avatarUrl: resolveAssetUrl(member?.avatarUrl) || null,
    role: member?.role ? String(member.role) : undefined,
    notificationsEnabled:
      member?.notificationsEnabled === undefined
        ? undefined
        : Boolean(member.notificationsEnabled),
    nickname: member?.nickname ? String(member.nickname) : null,
    lastReadAt: member?.lastReadAt ? String(member.lastReadAt) : null,
    lastReadMessageId: member?.lastReadMessageId
      ? String(member.lastReadMessageId)
      : null,
  }));

  return {
    id: toStringId(raw?.id ?? raw?._id),
    name: raw?.name || null,
    avatarUrl: resolveAssetUrl(raw?.avatarUrl) || null,
    type: raw?.type || (raw?.isGroup ? "group" : "direct"),
    isGroup:
      String(raw?.type || "").toLowerCase() === "group" ||
      Boolean(raw?.isGroup),
    lastMessage: lastMessageText,
    lastMessageAt:
      lastMessage?.createdAt || raw?.lastMessageAt || raw?.updatedAt,
    unreadCount: Number(raw?.unreadCount || 0),
    viewerSettings: {
      notificationsEnabled: Boolean(
        raw?.viewerSettings?.notificationsEnabled ?? true,
      ),
    },
    directPeerId:
      raw?.directPeerId === undefined || raw?.directPeerId === null
        ? null
        : Number(raw?.directPeerId),
    isBlockedByMe: Boolean(raw?.isBlockedByMe ?? false),
    isBlockedMe: Boolean(raw?.isBlockedMe ?? false),
    isPinned: Boolean(raw?.isPinned ?? raw?.pinned ?? false),
    isMuted: Boolean(raw?.isMuted ?? raw?.muted ?? false),
    mutedUntil:
      raw?.mutedUntil === undefined || raw?.mutedUntil === null
        ? null
        : String(raw.mutedUntil),
    members,
    participants,
  };
}

function getCurrentUserId(): number | null {
  try {
    const tokens = authStore.getTokens();
    const token = tokens?.accessToken;
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(payloadBase64, "base64").toString("utf8");
    const payload = JSON.parse(jsonStr);
    return Number(payload.id || payload.userId || payload.sub || 0) || null;
  } catch {
    return null;
  }
}

function mapMessage(raw: any): Message {
  const currentUserId = getCurrentUserId();
  
  let reactions: Array<{ type: string; count: number; viewerReacted: boolean }> = [];
  
  if (Array.isArray(raw?.reactions)) {
    const isRawList = raw.reactions.some(
      (r: any) => r && typeof r.userId === "number" && (r.reaction || r.type)
    );
    
    if (isRawList) {
      const groups: Record<string, { count: number; viewerReacted: boolean }> = {};
      for (const r of raw.reactions) {
        const rType = String(r.reaction || r.type || "like");
        const rUserId = Number(r.userId || 0);
        const isViewer = currentUserId !== null && rUserId === currentUserId;
        
        if (!groups[rType]) {
          groups[rType] = { count: 0, viewerReacted: false };
        }
        groups[rType].count += 1;
        if (isViewer) {
          groups[rType].viewerReacted = true;
        }
      }
      reactions = Object.keys(groups).map((type) => ({
        type,
        count: groups[type].count,
        viewerReacted: groups[type].viewerReacted,
      }));
    } else {
      reactions = raw.reactions.map((r: any) => ({
        type: String(r.type || r.reaction || "like"),
        count: Number(r.count || 0),
        viewerReacted: Boolean(
          r.viewerReacted ||
          (raw.viewerReaction && raw.viewerReaction === (r.type || r.reaction))
        ),
      }));
    }
  }

  return {
    id: toStringId(raw?.id ?? raw?._id),
    conversationId: toStringId(raw?.conversationId),
    senderId: Number(raw?.senderId || 0),
    senderName: String(raw?.senderName || raw?.senderFullName || "Người dùng"),
    content: String(raw?.content ?? raw?.text ?? ""),
    type: raw?.type ? String(raw.type) : "text",
    mediaUrl: resolveAssetUrl(raw?.mediaUrl) || "",
    fileName: raw?.fileName ? String(raw.fileName) : "",
    fileSize: Number(raw?.fileSize || 0),
    meta: raw?.meta || null,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    isRecalled: Boolean(raw?.isRecalled),
    isRemovedForMe: Boolean(raw?.isRemovedForMe),
    isPinned: Boolean(raw?.isPinned),
    readBy: Array.isArray(raw?.readBy)
      ? raw.readBy.map((r: any) => ({
          userId: Number(r?.userId || 0),
          at: r?.at ? String(r.at) : undefined,
        }))
      : [],
    replyTo: raw?.replyTo ? {
      id: String(raw.replyTo.id || raw.replyTo._id || ""),
      senderId: Number(raw.replyTo.senderId || 0),
      senderName: String(raw.replyTo.senderName || "Người dùng"),
      content: String(raw.replyTo.content ?? raw.replyTo.text ?? ""),
      type: raw.replyTo.type ? String(raw.replyTo.type) : "text",
    } : null,
    reactions,
  };
}

function mapNotification(raw: any): Notification {
  const isRead = Boolean(raw?.isRead ?? raw?.is_read);
  return {
    id: toStringId(raw?.id ?? raw?._id),
    type: raw?.type ? String(raw.type) : undefined,
    title: String(raw?.title || "Thông báo"),
    body: raw?.body ? String(raw.body) : undefined,
    isRead,
    is_read: isRead,
    meta: raw?.meta || null,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
  };
}

export const api = {
  mapMessage,
  // Auth
  register: (payload: RegisterPayload) =>
    request<RegisterResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  verifyRegistration: (payload: { emailOrPhone: string; code: string }) =>
    request<{ accessToken: string; refreshToken: string; user: AuthUser }>("/api/auth/verify-registration", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => ({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    })),

  resendVerification: (emailOrPhone: string) =>
    request<{
      message: string;
      verificationCode?: string;
      otpSent?: boolean;
      otpChannel?: string;
      otpDestination?: string;
    }>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ emailOrPhone }),
    }),

  login: (payload: LoginPayload) =>
    request<{ accessToken: string; refreshToken: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => ({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    })),

  forgotPassword: (emailOrPhone: string) =>
    request<{
      message: string;
      resetCode?: string;
      otpSent?: boolean;
      otpChannel?: string;
      otpDestination?: string;
    }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ emailOrPhone }),
    }),

  resetPassword: (payload: {
    emailOrPhone: string;
    code: string;
    newPassword: string;
  }) =>
    request<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  me: () =>
    request<{ user?: any } | any>("/api/auth/me").then((res) =>
      mapAuthUser((res as any)?.user ?? res),
    ),

  updateProfile: (payload: UpdateProfilePayload) =>
    request<{ message?: string; user?: any } | any>("/api/auth/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((res) => ({
      message: String((res as any)?.message || "Cap nhat ho so thanh cong"),
      user: mapAuthUser((res as any)?.user ?? res),
    })),

  changePassword: (payload: ChangePasswordPayload) =>
    request<{ message: string }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request<{ message: string }>("/api/auth/logout", { method: "POST" }),

  deleteAccount: (currentPassword: string) =>
    request<{ message: string }>("/api/auth/delete-account", {
      method: "POST",
      body: JSON.stringify({ currentPassword }),
    }),

  // Feed / Posts
  listFeed: () =>
    request<{ posts: any[] }>("/api/social/feed").then((res) => ({
      posts: (res.posts || []).map(mapFeedPost),
    })),

  listFeedWithParams: (params?: {
    includeHidden?: boolean;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.includeHidden) query.set("includeHidden", "1");
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";

    return request<{ posts: any[] }>(`/api/social/feed${suffix}`).then(
      (res) => ({
        posts: (res.posts || []).map(mapFeedPost),
      }),
    );
  },

  createPost: (payload: CreatePostPayload) =>
    request<any>("/api/social/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => ({ post: mapFeedPost((res as any)?.post ?? res) })),

  updatePost: (
    postId: string | number,
    payload: {
      content?: string;
      mediaUrl?: string;
      visibility?: "public" | "private";
    },
  ) =>
    request<any>(
      `/api/social/posts/${encodeURIComponent(String(postId))}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ).then((res) => ({
      message: String((res as any)?.message || "Cap nhat bai viet thanh cong"),
      post: mapFeedPost((res as any)?.post ?? res),
    })),

  getPost: (postId: string | number) =>
    request<any>(
      `/api/social/posts/${encodeURIComponent(String(postId))}`,
    ).then((res) => ({ post: mapFeedPost((res as any)?.post ?? res) })),

  reactPost: (postId: string | number, type: string = "like") =>
    request<any>(
      `/api/social/posts/${encodeURIComponent(String(postId))}/reaction`,
      {
        method: "POST",
        body: JSON.stringify({ type }),
      },
    ).then((res) => ({ post: mapFeedPost((res as any)?.post ?? res) })),

  unreactPost: (postId: string | number) =>
    request<any>(
      `/api/social/posts/${encodeURIComponent(String(postId))}/reaction`,
      {
        method: "DELETE",
      },
    ).then((res) => ({ post: mapFeedPost((res as any)?.post ?? res) })),

  deletePost: (postId: string | number) =>
    request<{ message: string }>(
      `/api/social/posts/${encodeURIComponent(String(postId))}`,
      {
        method: "DELETE",
      },
    ),

  savePost: (postId: string | number) =>
    request<{ saved: boolean }>(
      `/api/social/posts/${encodeURIComponent(String(postId))}/save`,
      { method: "POST" },
    ),

  unsavePost: (postId: string | number) =>
    request<{ saved: boolean }>(
      `/api/social/posts/${encodeURIComponent(String(postId))}/save`,
      { method: "DELETE" },
    ),

  listSavedPosts: () =>
    request<{ posts: any[] }>("/api/social/posts/saved").then((res) => ({
      posts: (res.posts || []).map(mapFeedPost),
    })),

  // Comments
  addComment: (
    postId: string | number,
    content: string,
    parentId?: string | null,
  ) =>
    request<{ comment: any }>(
      `/api/social/posts/${encodeURIComponent(String(postId))}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ content, parentCommentId: parentId || null }),
      },
    ).then((res) => ({ comment: mapFeedComment(res.comment) })),

  listComments: (postId: string | number) =>
    request<{ comments: any[]; total?: number }>(
      `/api/social/posts/${encodeURIComponent(String(postId))}/comments`,
    ).then((res) => ({
      comments: (res.comments || []).map(mapFeedComment),
      total: Number(res.total || (res.comments || []).length || 0),
    })),

  reactComment: (commentId: string | number, type: string = "like") =>
    request<{ comment: any }>(
      `/api/social/comments/${encodeURIComponent(String(commentId))}/reaction`,
      {
        method: "POST",
        body: JSON.stringify({ type }),
      },
    ).then((res) => ({ comment: mapFeedComment(res.comment) })),

  unreactComment: (commentId: string | number) =>
    request<{ comment: any }>(
      `/api/social/comments/${encodeURIComponent(String(commentId))}/reaction`,
      {
        method: "DELETE",
      },
    ).then((res) => ({ comment: mapFeedComment(res.comment) })),

  // Conversations
  listConversations: () =>
    request<{ conversations: any[] }>("/api/chat/conversations").then(
      (res) => ({
        conversations: (res.conversations || []).map(mapConversation),
      }),
    ),

  createDirectConversation: (userId: number) =>
    request<{ conversation: any }>("/api/chat/conversations/direct", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }).then((res) => ({ conversation: mapConversation(res.conversation) })),

  createGroupConversation: (payload: {
    name: string;
    memberIds: number[];
    avatarUrl?: string;
  }) =>
    request<{ conversation: any }>("/api/chat/conversations/group", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => ({ conversation: mapConversation(res.conversation) })),

  getConversationDetail: (conversationId: string | number) =>
    request<{ conversation: any }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}`,
    ).then((res) => ({
      conversation: mapConversation(res.conversation),
    })),

  toggleConversationNotifications: (
    conversationId: string | number,
    enabled: boolean,
  ) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/notifications`,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      },
    ),

  updateGroupConversationAvatar: (
    conversationId: string | number,
    avatarUrl: string,
  ) =>
    request<{ message: string; conversation: any }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/avatar`,
      {
        method: "PATCH",
        body: JSON.stringify({ avatarUrl }),
      },
    ).then((res) => ({
      message: String((res as any)?.message || "Da cap nhat avatar nhom"),
      conversation: mapConversation((res as any)?.conversation || {}),
    })),

  leaveGroupConversation: (conversationId: string | number) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/leave`,
      {
        method: "DELETE",
      },
    ),

  dissolveGroupConversation: (conversationId: string | number) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}`,
      {
        method: "DELETE",
      },
    ),

  // Messages
  listMessages: (
    conversationId: string | number,
    opts?: {
      q?: string;
      limit?: number;
      beforeId?: string;
      senderId?: number;
      type?: string;
    },
  ) => {
    const query = new URLSearchParams();
    if (opts?.q) query.set("q", opts.q);
    if (opts?.limit) query.set("limit", String(opts.limit));
    if (opts?.beforeId) query.set("beforeId", opts.beforeId);
    if (opts?.senderId) query.set("senderId", String(opts.senderId));
    if (opts?.type) query.set("type", opts.type);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ messages: any[] }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/messages${suffix}`,
    ).then((res) => ({
      messages: (res.messages || []).map(mapMessage),
    }));
  },

  markConversationRead: (
    conversationId: string | number,
    lastReadMessageId?: string,
  ) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/messages/read`,
      {
        method: "PATCH",
        body: JSON.stringify(
          lastReadMessageId ? { lastReadMessageId } : {},
        ),
      },
    ),

  clearConversationMessages: (conversationId: string | number) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/messages`,
      { method: "DELETE" },
    ),

  pinConversation: (conversationId: string | number, pinned: boolean) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/pin`,
      { method: pinned ? "PATCH" : "DELETE" },
    ),

  muteConversation: (
    conversationId: string | number,
    muted: boolean,
    mutedUntil?: string | null,
  ) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/mute`,
      {
        method: "PATCH",
        body: JSON.stringify({ muted, mutedUntil: mutedUntil ?? null }),
      },
    ),

  updateConversationNickname: (
    conversationId: string | number,
    userId: number,
    nickname: string | null,
  ) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/members/${encodeURIComponent(String(userId))}/nickname`,
      {
        method: "PATCH",
        body: JSON.stringify({ nickname }),
      },
    ),

  sendMessage: (conversationId: string | number, content: string) =>
    request<{ message: any }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ type: "text", text: content }),
      },
    ).then((res) => ({ message: mapMessage(res.message) })),

  sendMessagePayload: (
    conversationId: string | number,
    payload: {
      type?: string;
      text?: string;
      mediaUrl?: string;
      fileName?: string;
      fileSize?: number;
      meta?: Record<string, any> | null;
      replyToId?: string;
      sticker?: string;
    },
  ) =>
    request<{ message: any }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/messages`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ).then((res) => ({ message: mapMessage(res.message) })),

  sendSharedPostMessage: (
    conversationId: string | number,
    payload: {
      text?: string;
      postId: string;
      postAuthor?: string;
      postContent?: string;
      postMediaUrl?: string;
    },
  ) =>
    request<{ message: any }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "share_post",
          text: payload.text || "",
          meta: {
            postId: payload.postId,
            postAuthor: payload.postAuthor || "",
            postContent: payload.postContent || "",
            postMediaUrl: payload.postMediaUrl || "",
          },
        }),
      },
    ).then((res) => ({ message: mapMessage(res.message) })),

  // Message actions
  reactMessage: (messageId: string | number, type: string = "like") =>
    request<{ message: any }>(
      `/api/chat/messages/${encodeURIComponent(String(messageId))}/reaction`,
      {
        method: "POST",
        body: JSON.stringify({ type }),
      },
    ).then((res) => ({ message: mapMessage((res as any)?.chatMessage ?? (res as any)?.message ?? res) })),

  unreactMessage: (messageId: string | number) =>
    request<{ message: any }>(
      `/api/chat/messages/${encodeURIComponent(String(messageId))}/reaction`,
      {
        method: "DELETE",
      },
    ).then((res) => ({ message: mapMessage((res as any)?.chatMessage ?? res) })),

  forwardMessage: (messageId: string | number, targetConversationId: string | number) =>
    request<{ message: any }>(
      `/api/chat/messages/${encodeURIComponent(String(messageId))}/forward`,
      {
        method: "POST",
        body: JSON.stringify({ targetConversationId: String(targetConversationId) }),
      },
    ).then((res) => ({ message: mapMessage((res as any)?.message ?? res) })),

  pinMessage: (messageId: string | number) =>
    request<{ message: string }>(
      `/api/chat/messages/${encodeURIComponent(String(messageId))}/pin`,
      { method: "PATCH" },
    ),

  unpinMessage: (messageId: string | number) =>
    request<{ message: string }>(
      `/api/chat/messages/${encodeURIComponent(String(messageId))}/pin`,
      { method: "DELETE" },
    ),

  recallMessage: (
    messageId: string | number,
    scope?: "me" | "all",
  ) =>
    request<any>(
      `/api/chat/messages/${encodeURIComponent(String(messageId))}/recall`,
      {
        method: "PATCH",
        body: JSON.stringify({ scope: scope || "all" }),
      },
    ).then((res) => ({
      // Backend returns { message: "text", chatMessage: {...} }
      message: (res as any)?.chatMessage ? mapMessage((res as any).chatMessage) : null,
    })),

  deleteMessage: (messageId: string | number) =>
    request<{ message: string }>(
      `/api/chat/messages/${encodeURIComponent(String(messageId))}`,
      { method: "DELETE" },
    ),

  // Notifications
  notifications: () =>
    request<{ notifications: any[] }>("/api/social/notifications").then(
      (res) => ({
        notifications: (res.notifications || []).map(mapNotification),
      }),
    ),

  readNotification: (id: string | number) =>
    request<{ message: string }>(
      `/api/social/notifications/${encodeURIComponent(String(id))}/read`,
      {
        method: "PATCH",
      },
    ),

  readAllNotifications: () =>
    request<{ message: string }>("/api/social/notifications/read-all", {
      method: "PATCH",
    }),

  // Search
  searchUsers: (keyword: string) =>
    request<{ users: any[] }>(
      `/api/social/users/search?q=${encodeURIComponent(keyword)}`,
    ).then((res) => ({
      users: (res.users || []).map(mapAuthUser),
    })),

  getUserProfile: (userId: number) =>
    request<{ user: any; relationship: any }>(
      `/api/social/users/${encodeURIComponent(String(userId))}/profile`,
    ).then((res) => ({
      user: mapAuthUser(res.user),
      relationship: {
        status: String(res.relationship?.status || "none") as
          | "self"
          | "none"
          | "pending_sent"
          | "pending_received"
          | "friends",
        friendshipId: res.relationship?.friendshipId || null,
        requestedByMe: Boolean(res.relationship?.requestedByMe),
        isBlockedByMe: Boolean(res.relationship?.isBlockedByMe),
        isBlockedMe: Boolean(res.relationship?.isBlockedMe),
      },
    })),

  listUserPosts: (userId: number) =>
    request<{ posts: any[] }>(
      `/api/social/users/${encodeURIComponent(String(userId))}/posts`,
    ).then((res) => ({
      posts: (res.posts || []).map(mapFeedPost),
    })),

  // Privacy settings
  getPrivacySettings: () =>
    request<{
      settings: {
        privacyLastSeen: boolean;
        privacyProfilePhoto: boolean;
        allowFriendRequests: boolean;
      };
    }>("/api/social/settings").then((res) => res.settings),

  updatePrivacySettings: (payload: {
    privacyLastSeen?: boolean;
    privacyProfilePhoto?: boolean;
    allowFriendRequests?: boolean;
  }) =>
    request<{
      settings: {
        privacyLastSeen: boolean;
        privacyProfilePhoto: boolean;
        allowFriendRequests: boolean;
      };
    }>("/api/social/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((res) => res.settings),

  // Reports
  submitReport: (payload: {
    targetType: string;
    targetId: string | number;
    reason: string;
    details?: string;
  }) =>
    request<{ message: string }>("/api/social/reports", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Friends
  listFriends: () =>
    request<{ friends: any[] }>("/api/social/friends").then((res) => ({
      friends: (res.friends || []).map((friend) => ({
        id: Number(friend?.id || 0),
        name: String(friend?.fullName || "Người dùng"),
        avatarUrl: resolveAssetUrl(friend?.avatarUrl) || undefined,
        status: String(friend?.status || "pending"),
        requestedByMe: Boolean(friend?.requestedByMe),
      })),
    })),

  sendFriendRequest: (userId: number) =>
    request<{ message: string; friendshipId?: number }>("/api/social/friends/request", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  acceptFriendRequest: (userId: number) =>
    request<{ message: string }>(`/api/social/friends/${userId}/accept`, {
      method: "POST",
    }),

  rejectFriendRequest: (userId: number) =>
    // Backend không có endpoint /reject riêng — từ chối = xoá lời mời (DELETE /friends/:id).
    request<{ message: string }>(`/api/social/friends/${userId}`, {
      method: "DELETE",
    }),

  removeFriend: (userId: number) =>
    request<{ message: string }>(`/api/social/friends/${userId}`, {
      method: "DELETE",
    }),

  blockUser: (userId: number) =>
    request<{ message: string }>(`/api/social/users/${userId}/block`, {
      method: "POST",
    }),

  unblockUser: (userId: number) =>
    request<{ message: string }>(`/api/social/users/${userId}/block`, {
      method: "DELETE",
    }),

  listPendingFriendRequests: () =>
    request<{ requests: Array<{ id: number; fullName: string; avatarUrl: string | null }> }>(
      "/api/social/friends/requests",
    ).then((res) => (Array.isArray(res?.requests) ? res.requests : [])),

  // AI Chat
  aiChat: (message: string, history?: Array<{ role: 'user' | 'model'; text: string }>) =>
    request<{ reply: string; sessionId?: string }>("/api/social/ai/support", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),

  aiHistory: () =>
    request<any>("/api/social/ai/history"),

  summarizeChat: (messages: Array<{ role: "user" | "model"; text: string }>) =>
    request<{ summary: string }>("/api/social/ai/summarize", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),

  suggestReplies: (messages: Array<{ role: string; text: string }>, currentUserName: string) =>
    request<{ suggestions: string[] }>("/api/social/ai/suggest-replies", {
      method: "POST",
      body: JSON.stringify({ messages, currentUserName }),
    }),

  translateMessage: (text: string, targetLanguage = "vi") =>
    request<{ translatedText: string; detectedLanguage: string }>("/api/social/ai/translate", {
      method: "POST",
      body: JSON.stringify({ text, targetLanguage }),
    }),

  // Upload
  uploadAvatarBase64: (payload: {
    fileName: string;
    contentType: string;
    base64Data: string;
  }) =>
    request<{ fileUrl: string }>("/api/auth/avatar-upload-base64", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((res) => ({
      fileUrl: resolveAssetUrl(res.fileUrl) || "",
    })),

  uploadPostMediaBase64: (payload: {
    fileName: string;
    contentType: string;
    base64Data: string;
  }) =>
    request<{ mediaUrl?: string; fileUrl?: string }>(
      "/api/social/posts/upload-base64",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ).then((res) => ({
      fileUrl: resolveAssetUrl(res.fileUrl || res.mediaUrl) || "",
    })),

  uploadChatFileBase64: (
    conversationId: string | number,
    payload: {
      fileName: string;
      contentType: string;
      base64Data: string;
    },
  ) =>
    request<{ fileUrl: string; fileName?: string; contentType?: string; size?: number }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/messages/upload-base64`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ).then((res) => ({
      fileUrl: resolveAssetUrl(res.fileUrl) || "",
      fileName: String(res.fileName || payload.fileName || ""),
      contentType: String(res.contentType || payload.contentType || ""),
      size: Number(res.size || 0),
    })),

  // Shared content gallery
  getSharedContent: (conversationId: string | number) =>
    request<{ photosVideos: any[]; files: any[]; links: any[] }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/shared`,
    ).then((res) => ({
      photosVideos: (res.photosVideos || []).map(mapMessage),
      files: (res.files || []).map(mapMessage),
      links: (res.links || []).map(mapMessage),
    })),

  // Group management
  renameGroupConversation: (conversationId: string | number, name: string) =>
    request<{ message: string; conversation: any }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/profile`,
      {
        method: "PATCH",
        body: JSON.stringify({ name }),
      },
    ).then((res) => ({
      message: String((res as any)?.message || "Da doi ten nhom"),
      conversation: mapConversation((res as any)?.conversation || {}),
    })),

  addGroupMember: (conversationId: string | number, userId: number) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/members`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
      },
    ),

  removeGroupMember: (conversationId: string | number, userId: number) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/members/${encodeURIComponent(String(userId))}`,
      {
        method: "DELETE",
      },
    ),

  // Đặt/bỏ phó nhóm: userId để đặt, null để bỏ phó (PATCH /:id/deputy)
  setGroupDeputy: (
    conversationId: string | number,
    userId: number | null,
  ) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/deputy`,
      {
        method: "PATCH",
        body: JSON.stringify({ userId }),
      },
    ),

  // Chuyển quyền trưởng nhóm (PATCH /:id/leader)
  transferGroupLeader: (
    conversationId: string | number,
    userId: number,
  ) =>
    request<{ message: string }>(
      `/api/chat/conversations/${encodeURIComponent(String(conversationId))}/leader`,
      {
        method: "PATCH",
        body: JSON.stringify({ userId }),
      },
    ),

  // Notifications
  deleteNotification: (id: string | number) =>
    request<{ message: string }>(
      `/api/social/notifications/${encodeURIComponent(String(id))}`,
      {
        method: "DELETE",
      },
    ),

  // Comments
  deleteComment: (commentId: string | number) =>
    request<{ message: string }>(
      `/api/social/comments/${encodeURIComponent(String(commentId))}`,
      {
        method: "DELETE",
      },
    ),

  // Calls — ghi lịch sử cuộc gọi + cuộc gọi nhỡ (backend tự tạo notification)
  createCall: (payload: {
    conversationId: string;
    initiatorId: number;
    participantIds: number[];
    callType: "voice" | "video";
    mode: "private" | "group";
    status: "completed" | "missed" | "rejected" | "no_answer" | "cancelled" | "failed";
    startedAt?: number;
    answeredAt?: number | null;
    endedAt?: number | null;
    durationSec?: number;
    withName?: string;
  }) =>
    request<{ id: string }>("/api/social/calls", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Admin ──────────────────────────────────────────────────────────────────
  adminDashboard: () =>
    request<{ stats: Record<string, number>; recentReports: any[] }>(
      "/api/admin/dashboard",
      { method: "GET" },
    ),

  adminReports: (status?: string) => {
    const suffix =
      status && status !== "all"
        ? `?status=${encodeURIComponent(status)}`
        : "";
    return request<{ reports: any[] }>(`/api/admin/reports${suffix}`, {
      method: "GET",
    });
  },

  adminPosts: (params?: { q?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<{ posts: any[] }>(`/api/social/admin/posts${suffix}`, {
      method: "GET",
    });
  },

  updateAdminPost: (
    postId: number,
    payload: { status?: string; visibility?: string },
  ) =>
    request<{ message: string }>(`/api/social/admin/posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteAdminPost: (postId: number) =>
    request<{ message: string }>(`/api/social/admin/posts/${postId}`, {
      method: "DELETE",
    }),

  adminModerationUsers: () =>
    request<{ users: any[] }>("/api/moderator/users", { method: "GET" }),

  updateModerationUser: (
    userId: number,
    payload: { accountStatus?: string; reason?: string },
  ) =>
    request<{ message: string }>(`/api/social/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteAdminUser: (userId: number) =>
    request<{ message: string }>(`/api/admin/users/${userId}`, {
      method: "DELETE",
    }),

  // ── Moderator ──────────────────────────────────────────────────────────────
  moderationDashboard: () =>
    request<{ stats: Record<string, number>; reports: any[] }>(
      "/api/moderator/dashboard",
      { method: "GET" },
    ),

  moderationReports: (status?: string) => {
    const suffix =
      status && status !== "all"
        ? `?status=${encodeURIComponent(status)}`
        : "";
    return request<{ reports: any[] }>(`/api/moderator/reports${suffix}`, {
      method: "GET",
    });
  },

  reviewModerationReport: (
    reportId: number,
    payload: { status: string; resolution?: string },
  ) =>
    request<{ message: string }>(
      `/api/moderator/reports/${reportId}/status`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),

  moderatePost: (
    postId: number,
    payload: { status?: string; action?: string; resolution?: string },
  ) =>
    request<{ message: string }>(
      `/api/social/moderation/posts/${postId}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),

  warnModerationUser: (userId: number, reason?: string) =>
    request<{ message: string }>(`/api/moderator/users/${userId}/warn`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    }),

  restrictModerationUser: (userId: number, reason?: string) =>
    request<{ message: string }>(`/api/moderator/users/${userId}/restrict`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    }),

  tempLockModerationUser: (userId: number, reason?: string) =>
    request<{ message: string }>(`/api/moderator/users/${userId}/temp-lock`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    }),

  restoreModerationUser: (userId: number) =>
    request<{ message: string }>(`/api/moderator/users/${userId}/restore`, {
      method: "PATCH",
    }),
};
