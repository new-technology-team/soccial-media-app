import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from "react-native-webrtc";
import type { Socket } from "socket.io-client";

export type CallType = "voice" | "video";

// Tối đa thành viên trong cuộc gọi nhóm full-mesh (đồng bộ với web GROUP_CALL_MAX_PARTICIPANTS).
export const GROUP_CALL_MAX_PARTICIPANTS = 6;

const TURN_URLS = String(
  process.env.EXPO_PUBLIC_TURN_URLS || process.env.EXPO_PUBLIC_TURN_URL || "",
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

// Khớp RTC_CONFIG của web: STUN Google mặc định + TURN nếu cấu hình env.
export const RTC_CONFIG: any = {
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ...(TURN_URLS.length
      ? [
          {
            urls: TURN_URLS,
            username: process.env.EXPO_PUBLIC_TURN_USERNAME || undefined,
            credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL || undefined,
          },
        ]
      : []),
  ],
};

export type RemoteStreamEntry = { userId: number; stream: MediaStream };

type EngineContext = {
  socket: Socket | null;
  selfId: number;
  conversationId: string | null;
  callType: CallType;
  // Cho biết cuộc gọi đã được trả lời chưa (để chuyển state connecting/connected khi ICE thay đổi).
  isAnswered: () => boolean;
  onRemoteStreamsChanged: (streams: RemoteStreamEntry[]) => void;
  onPeerJoined: (userId: number) => void;
  onPeerLeft: (userId: number) => void;
  onConnectionStateChange: (state: "connecting" | "connected") => void;
};

const ctx: EngineContext = {
  socket: null,
  selfId: 0,
  conversationId: null,
  callType: "video",
  isAnswered: () => false,
  onRemoteStreamsChanged: () => {},
  onPeerJoined: () => {},
  onPeerLeft: () => {},
  onConnectionStateChange: () => {},
};

// Singleton phiên gọi — tồn tại độc lập với vòng đời React (giống call-session.ts của web).
export const callSession = {
  peers: new Map<number, any>(),
  pendingCandidates: new Map<number, any[]>(),
  localStream: null as MediaStream | null,
};

const negotiationLocks = new Set<number>();

export function configureCallEngine(partial: Partial<EngineContext>) {
  Object.assign(ctx, partial);
}

function notifyRemoteStreams() {
  const entries: RemoteStreamEntry[] = [];
  for (const [userId, pc] of callSession.peers.entries()) {
    const remote = (pc as any)._zchatRemoteStream as MediaStream | undefined;
    if (remote) entries.push({ userId, stream: remote });
  }
  ctx.onRemoteStreamsChanged(entries);
}

export async function ensureLocalStream(callType: CallType): Promise<MediaStream> {
  const existing = callSession.localStream;
  if (existing) {
    if (callType === "video" && existing.getVideoTracks().length === 0) {
      try {
        const videoStream = await mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        const [videoTrack] = videoStream.getVideoTracks();
        if (videoTrack) existing.addTrack(videoTrack);
      } catch {
        // không có camera → giữ luồng âm thanh
      }
    }
    return existing;
  }

  let stream: MediaStream;
  try {
    stream = (await mediaDevices.getUserMedia({
      audio: true,
      video:
        callType === "video"
          ? { facingMode: "user" }
          : false,
    })) as MediaStream;
  } catch (error) {
    if (callType !== "video") throw error;
    // Không lấy được camera → thử lại chỉ âm thanh để vẫn tham gia bằng giọng nói.
    stream = (await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    })) as MediaStream;
  }
  if (callType === "voice") {
    stream.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });
  }
  callSession.localStream = stream;
  return stream;
}

export async function buildPeerConnection(
  targetUserId: number,
  callType: CallType,
  conversationId: string,
): Promise<any | null> {
  const socket = ctx.socket;
  if (!socket || !conversationId || targetUserId <= 0) return null;

  const existing = callSession.peers.get(targetUserId);
  if (existing && existing.signalingState !== "closed") return existing;

  const pc: any = new RTCPeerConnection(RTC_CONFIG);
  const localStream = await ensureLocalStream(callType);
  localStream.getTracks().forEach((track) => {
    const already = pc
      .getSenders()
      .some((sender: any) => sender.track && sender.track.id === track.id);
    if (!already) pc.addTrack(track, localStream);
  });

  pc.addEventListener("track", (event: any) => {
    const [stream] = event.streams || [];
    if (!stream) return;
    pc._zchatRemoteStream = stream;
    ctx.onPeerJoined(targetUserId);
    notifyRemoteStreams();
  });

  pc.addEventListener("icecandidate", (event: any) => {
    const candidate = event.candidate;
    if (!candidate) return;
    socket.emit("call:ice-candidate", {
      targetUserId,
      conversationId,
      candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      },
    });
  });

  pc.addEventListener("iceconnectionstatechange", () => {
    const state = pc.iceConnectionState;
    if (state === "failed" || state === "disconnected") {
      if (ctx.isAnswered()) ctx.onConnectionStateChange("connecting");
      if (state === "failed") {
        try {
          pc.restartIce();
        } catch {
          // bỏ qua nếu không hỗ trợ
        }
        void renegotiatePeer(targetUserId);
      }
    } else if (state === "connected" || state === "completed") {
      if (ctx.isAnswered()) ctx.onConnectionStateChange("connected");
    }
  });

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "failed") void renegotiatePeer(targetUserId);
  });

  callSession.peers.set(targetUserId, pc);
  return pc;
}

export async function renegotiatePeer(targetUserId: number) {
  const socket = ctx.socket;
  const pc = callSession.peers.get(targetUserId);
  const convId = ctx.conversationId;
  if (!socket || !pc || !convId || negotiationLocks.has(targetUserId)) return;
  negotiationLocks.add(targetUserId);
  try {
    const offer = await pc.createOffer({
      iceRestart: pc.iceConnectionState === "failed",
    });
    await pc.setLocalDescription(offer);
    socket.emit("call:offer", {
      targetUserId,
      conversationId: convId,
      callType: ctx.callType,
      offer: { type: offer.type, sdp: offer.sdp },
      platform: "mobile",
      renegotiate: true,
    });
  } catch {
    // bỏ qua: renegotiate thất bại
  } finally {
    negotiationLocks.delete(targetUserId);
  }
}

export async function applyRemoteDescription(
  targetUserId: number,
  description: { type: string; sdp: string },
) {
  const pc = callSession.peers.get(targetUserId);
  if (!pc) return;
  await pc.setRemoteDescription(
    new RTCSessionDescription({ type: description.type as any, sdp: description.sdp }),
  );
  await flushPendingCandidates(targetUserId);
}

export async function addRemoteCandidate(
  fromUserId: number,
  candidate: any,
) {
  const pc = callSession.peers.get(fromUserId);
  if (!pc || !candidate) return;
  if (!pc.remoteDescription) {
    const pending = callSession.pendingCandidates.get(fromUserId) || [];
    pending.push(candidate);
    callSession.pendingCandidates.set(fromUserId, pending);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {
    // bỏ qua candidate cũ
  }
}

export async function flushPendingCandidates(targetUserId: number) {
  const pc = callSession.peers.get(targetUserId);
  if (!pc) return;
  const pending = callSession.pendingCandidates.get(targetUserId) || [];
  callSession.pendingCandidates.delete(targetUserId);
  for (const candidate of pending) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // bỏ qua candidate cũ
    }
  }
}

export function closePeer(userId: number) {
  const pc = callSession.peers.get(userId);
  if (pc) {
    try {
      pc.close();
    } catch {
      // bỏ qua
    }
    callSession.peers.delete(userId);
  }
  callSession.pendingCandidates.delete(userId);
  ctx.onPeerLeft(userId);
  notifyRemoteStreams();
}

export function setMicEnabled(enabled: boolean) {
  callSession.localStream?.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

export async function setCameraEnabled(enabled: boolean) {
  const stream = callSession.localStream;
  if (!stream) return;
  if (!enabled) {
    stream.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });
    return;
  }
  let videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    const videoStream = await mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    videoTrack = videoStream.getVideoTracks()[0];
    if (videoTrack) {
      stream.addTrack(videoTrack);
      for (const pc of callSession.peers.values()) {
        const sender = pc
          .getSenders()
          .find((s: any) => !s.track || s.track.kind === "video");
        if (sender) sender.replaceTrack(videoTrack);
        else pc.addTrack(videoTrack, stream);
      }
      await renegotiateAllPeers();
    }
  } else {
    videoTrack.enabled = true;
  }
}

export function switchCamera() {
  callSession.localStream?.getVideoTracks().forEach((track) => {
    try {
      (track as any)._switchCamera();
    } catch {
      // bỏ qua nếu thiết bị không hỗ trợ
    }
  });
}

export async function renegotiateAllPeers() {
  await Promise.all(
    [...callSession.peers.keys()].map((userId) => renegotiatePeer(userId)),
  );
}

export function resetCallSession() {
  for (const pc of callSession.peers.values()) {
    try {
      pc.close();
    } catch {
      // bỏ qua
    }
  }
  callSession.peers.clear();
  callSession.pendingCandidates.clear();
  negotiationLocks.clear();
  if (callSession.localStream) {
    callSession.localStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // bỏ qua
      }
    });
    callSession.localStream = null;
  }
  ctx.onRemoteStreamsChanged([]);
}
