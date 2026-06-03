import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import InCallManager from "react-native-incall-manager";
import { api, authStore, getSocket } from "../lib";
import {
  GROUP_CALL_MAX_PARTICIPANTS,
  addRemoteCandidate,
  applyRemoteDescription,
  buildPeerConnection,
  callSession,
  closePeer,
  configureCallEngine,
  ensureLocalStream,
  flushPendingCandidates,
  resetCallSession,
  setCameraEnabled,
  setMicEnabled,
  switchCamera as switchCameraTrack,
  type CallType,
  type RemoteStreamEntry,
} from "../lib/call-webrtc";
import type { AuthUser, Conversation } from "../types";

export type CallMode = "private" | "group";

type CallStatus =
  | "completed"
  | "missed"
  | "rejected"
  | "no_answer"
  | "cancelled"
  | "failed";

export type IncomingCall = {
  conversationId: string;
  fromUserId: number;
  fromUserName: string;
  callType: CallType;
  mode: CallMode;
  offer?: { type: string; sdp: string };
  conversationName: string;
};

export type ActiveCall = {
  conversationId: string;
  callType: CallType;
  mode: CallMode;
  title: string;
  startedAt: number;
  targetUserIds: number[];
};

type CallPhase = "idle" | "calling" | "connecting" | "connected";

type RemoteMediaState = Record<number, { micMuted?: boolean; cameraOff?: boolean }>;

export type StartCallParams = {
  conversationId: string;
  title: string;
  callType: CallType;
  mode: CallMode;
  targetUserIds: number[];
};

type UseWebRTCCallArgs = {
  user: AuthUser;
  conversationsRef: React.MutableRefObject<Conversation[]>;
  activeConversationIdRef: React.MutableRefObject<string | null>;
  incomingCallBootstrap?: {
    conversationId: string;
    fromUserId: number;
    fromUserName?: string;
    callType?: CallType;
    mode?: CallMode;
    offer?: { type: string; sdp: string };
    routeKey?: number;
  } | null;
  onIncomingCallBootstrapHandled?: () => void;
  onRequestOpenConversation?: (conversationId: string) => void;
};

const NO_ANSWER_TIMEOUT_MS = 30000;

// Hỏi server xem một user có đang online không (ack), timeout 1200ms → coi như offline. Khớp web.
function checkPresence(
  socket: { emit: (ev: string, data: unknown, ack?: (resp: unknown) => void) => void } | null,
  userId: number,
): Promise<{ userId: number; online: boolean }> {
  if (!socket || !userId) {
    return Promise.resolve({ userId, online: false });
  }
  return new Promise((resolve) => {
    let settled = false;
    const fallback = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ userId, online: false });
    }, 1200);
    try {
      socket.emit("presence:check", { userId }, (resp: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        const data = resp as { userId?: number; online?: boolean };
        resolve({
          userId: Number(data?.userId || userId),
          online: Boolean(data?.online),
        });
      });
    } catch {
      clearTimeout(fallback);
      settled = true;
      resolve({ userId, online: false });
    }
  });
}

export function useWebRTCCall({
  user,
  conversationsRef,
  activeConversationIdRef,
  incomingCallBootstrap,
  onIncomingCallBootstrapHandled,
  onRequestOpenConversation,
}: UseWebRTCCallArgs) {
  const selfId = Number(user.id);

  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<ActiveCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMediaState>({});
  const [participantNames, setParticipantNames] = useState<Record<number, string>>({});
  const [localStream, setLocalStream] = useState<{ toURL: () => string } | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const answeredRef = useRef(false);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const outgoingCallRef = useRef<ActiveCall | null>(null);
  const callPhaseRef = useRef<CallPhase>("idle");
  const handledBootstrapRef = useRef<number>(0);
  const noAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callLogRef = useRef<{
    conversationId: string;
    initiatorId: number;
    callType: CallType;
    mode: CallMode;
    startedAt: number;
    answeredAt: number | null;
    targetUserIds: number[];
    withName?: string;
    logged: boolean;
  } | null>(null);

  activeCallRef.current = activeCall;
  incomingCallRef.current = incomingCall;
  outgoingCallRef.current = outgoingCall;
  callPhaseRef.current = callPhase;

  const lookupName = useCallback(
    (userId: number): string => {
      for (const conv of conversationsRef.current) {
        const member = (conv.members || []).find(
          (m: any) => Number(m.userId) === userId,
        );
        if (member && (member as any).fullName) return String((member as any).fullName);
        if (member && (member as any).name) return String((member as any).name);
      }
      return `Người dùng #${userId}`;
    },
    [conversationsRef],
  );

  // Ghi lịch sử cuộc gọi — chỉ phía người khởi tạo (callLogRef chỉ set khi bắt đầu gọi).
  const logCall = useCallback(
    (status: CallStatus) => {
      const meta = callLogRef.current;
      if (!meta || meta.logged) return;
      if (meta.initiatorId !== selfId) return;
      meta.logged = true;
      const conv = conversationsRef.current.find(
        (c) => String(c.id) === meta.conversationId,
      );
      const memberIds = (conv?.members || [])
        .map((m: any) => Number(m.userId))
        .filter((id: number) => id > 0);
      const participantIds = memberIds.length
        ? memberIds
        : [selfId, ...meta.targetUserIds];
      void api
        .createCall({
          conversationId: meta.conversationId,
          initiatorId: selfId,
          participantIds,
          callType: meta.callType,
          mode: meta.mode,
          status,
          startedAt: meta.startedAt,
          answeredAt: meta.answeredAt,
          endedAt: Date.now(),
          durationSec: meta.answeredAt
            ? Math.max(0, Math.round((Date.now() - meta.answeredAt) / 1000))
            : 0,
          withName: meta.withName,
        })
        .catch(() => undefined);
    },
    [conversationsRef, selfId],
  );

  const clearNoAnswerTimer = useCallback(() => {
    if (noAnswerTimerRef.current) {
      clearTimeout(noAnswerTimerRef.current);
      noAnswerTimerRef.current = null;
    }
  }, []);

  // Dọn toàn bộ tài nguyên + state khi cuộc gọi kết thúc.
  const teardown = useCallback(() => {
    clearNoAnswerTimer();
    resetCallSession();
    try {
      InCallManager.stop();
    } catch {
      // bỏ qua nếu native module chưa sẵn sàng
    }
    answeredRef.current = false;
    callLogRef.current = null;
    setActiveCall(null);
    setOutgoingCall(null);
    setIncomingCall(null);
    setCallPhase("idle");
    setRemoteStreams([]);
    setRemoteMedia({});
    setParticipantNames({});
    setLocalStream(null);
    setMicMuted(false);
    setCameraOff(false);
    setSpeakerOn(false);
    setCallSeconds(0);
  }, [clearNoAnswerTimer]);

  const startInCallManager = useCallback((callType: CallType) => {
    try {
      InCallManager.start({ media: callType === "video" ? "video" : "audio" });
      const speaker = callType === "video";
      InCallManager.setForceSpeakerphoneOn(speaker);
      setSpeakerOn(speaker);
    } catch {
      // bỏ qua nếu native module chưa sẵn sàng
    }
  }, []);

  const setupEngine = useCallback(
    (conversationId: string, callType: CallType) => {
      const socket = socketRef.current;
      configureCallEngine({
        socket,
        selfId,
        conversationId,
        callType,
        isAnswered: () => answeredRef.current,
        onRemoteStreamsChanged: (streams) => setRemoteStreams(streams),
        onPeerJoined: (userId) => {
          setParticipantNames((prev) =>
            prev[userId] ? prev : { ...prev, [userId]: lookupName(userId) },
          );
        },
        onPeerLeft: (userId) => {
          setRemoteMedia((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        },
        onConnectionStateChange: (state) => {
          if (!answeredRef.current) return;
          setCallPhase(state);
        },
      });
    },
    [lookupName, selfId],
  );

  // ---- Bắt đầu cuộc gọi đi ----
  const startCall = useCallback(
    async ({ conversationId, title, callType, mode, targetUserIds }: StartCallParams) => {
      const socket = getSocket(authStore.getTokens()?.accessToken || "");
      socketRef.current = socket;
      if (!socket) {
        Alert.alert("Chưa kết nối", "Vui lòng thử lại sau ít giây.");
        return;
      }
      const targets = targetUserIds.filter((id) => id > 0 && id !== selfId);
      if (targets.length === 0) {
        Alert.alert("Không thể gọi", "Không tìm thấy người nhận.");
        return;
      }
      if (mode === "group" && targets.length + 1 > GROUP_CALL_MAX_PARTICIPANTS) {
        Alert.alert(
          "Cuộc gọi nhóm",
          `Chỉ hỗ trợ tối đa ${GROUP_CALL_MAX_PARTICIPANTS} người.`,
        );
        return;
      }

      const startedAt = Date.now();
      const call: ActiveCall = {
        conversationId,
        callType,
        mode,
        title,
        startedAt,
        targetUserIds: targets,
      };
      callLogRef.current = {
        conversationId,
        initiatorId: selfId,
        callType,
        mode,
        startedAt,
        answeredAt: null,
        targetUserIds: targets,
        withName: title,
        logged: false,
      };

      setupEngine(conversationId, callType);

      try {
        const stream = await ensureLocalStream(callType);
        setLocalStream(stream as any);
        setCameraOff(callType === "voice");
      } catch {
        Alert.alert(
          "Không thể truy cập micro/camera",
          "Hãy cấp quyền để thực hiện cuộc gọi.",
        );
        teardown();
        return;
      }
      startInCallManager(callType);

      // Nhóm: chỉ gửi offer cho thành viên đang online (khớp web — tránh peer "treo").
      // 1-1: gọi thẳng người nhận, không lọc presence.
      let offerTargets = targets;
      if (mode === "group") {
        const presence = await Promise.all(
          targets.map((id) => checkPresence(socket, id)),
        );
        offerTargets = presence.filter((p) => p.online).map((p) => p.userId);
      }

      for (const targetUserId of offerTargets) {
        const pc = await buildPeerConnection(targetUserId, callType, conversationId);
        if (!pc) continue;
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        socket.emit("call:offer", {
          targetUserId,
          conversationId,
          callType,
          offer: { type: offer.type, sdp: offer.sdp },
          platform: "mobile",
        });
        socket.emit(mode === "group" ? "group_call_started" : "call_started", {
          targetUserId,
          conversationId,
          callType,
        });
      }

      socket.emit("call:join", {
        conversationId,
        callType,
        mode,
        micMuted: false,
        cameraOff: callType === "voice",
      });
      if (mode === "group") {
        socket.emit("call:participants", {
          conversationId,
          participantCount: 1 + targets.length,
          participantIds: [selfId, ...targets],
        });
      }

      setActiveCall(call);
      if (mode === "group") {
        setCallPhase("connecting");
      } else {
        setOutgoingCall(call);
        setCallPhase("calling");
        // Không có phản hồi sau timeout → tự kết thúc.
        clearNoAnswerTimer();
        noAnswerTimerRef.current = setTimeout(() => {
          if (answeredRef.current) return;
          targets.forEach((targetUserId) =>
            socket.emit("call:end", {
              conversationId,
              targetUserId,
              fromUserId: selfId,
              reason: "no_answer",
            }),
          );
          logCall("no_answer");
          teardown();
          Alert.alert("Không có phản hồi", "Người nhận chưa trả lời cuộc gọi.");
        }, NO_ANSWER_TIMEOUT_MS);
      }
    },
    [clearNoAnswerTimer, logCall, selfId, setupEngine, startInCallManager, teardown],
  );

  // ---- Nhận cuộc gọi đến ----
  const acceptIncoming = useCallback(async () => {
    const call = incomingCall;
    const socket = socketRef.current;
    if (!call || !socket || !call.offer) return;

    setupEngine(call.conversationId, call.callType);
    try {
      const stream = await ensureLocalStream(call.callType);
      setLocalStream(stream as any);
      setCameraOff(call.callType === "voice");
    } catch {
      Alert.alert(
        "Không thể truy cập micro/camera",
        "Hãy cấp quyền để nhận cuộc gọi.",
      );
      socket.emit("call:reject", {
        conversationId: call.conversationId,
        targetUserId: call.fromUserId,
        fromUserId: selfId,
        reason: "error",
      });
      teardown();
      return;
    }
    startInCallManager(call.callType);

    const pc = await buildPeerConnection(
      call.fromUserId,
      call.callType,
      call.conversationId,
    );
    if (pc) {
      await applyRemoteDescription(call.fromUserId, call.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call:answer", {
        targetUserId: call.fromUserId,
        conversationId: call.conversationId,
        answer: { type: answer.type, sdp: answer.sdp },
        callType: call.callType,
        mode: call.mode,
        answeredAt: Date.now(),
      });
    }
    socket.emit("call:join", {
      conversationId: call.conversationId,
      callType: call.callType,
      mode: call.mode,
      micMuted: false,
      cameraOff: call.callType === "voice",
    });
    socket.emit(call.mode === "group" ? "group_call_joined" : "call_joined", {
      conversationId: call.conversationId,
      callType: call.callType,
    });

    answeredRef.current = true;
    setActiveCall({
      conversationId: call.conversationId,
      callType: call.callType,
      mode: call.mode,
      title: call.conversationName,
      startedAt: Date.now(),
      targetUserIds: [call.fromUserId],
    });
    setIncomingCall(null);
    setCallPhase("connecting");
  }, [incomingCall, selfId, setupEngine, startInCallManager, teardown]);

  const declineIncoming = useCallback(() => {
    const call = incomingCall;
    const socket = socketRef.current;
    if (call && socket) {
      socket.emit("call:reject", {
        conversationId: call.conversationId,
        targetUserId: call.fromUserId,
        fromUserId: selfId,
        reason: "rejected",
      });
    }
    setIncomingCall(null);
  }, [incomingCall, selfId]);

  const cancelOutgoing = useCallback(() => {
    const call = outgoingCall;
    const socket = socketRef.current;
    if (call && socket) {
      call.targetUserIds.forEach((targetUserId) =>
        socket.emit("call:end", {
          conversationId: call.conversationId,
          targetUserId,
          fromUserId: selfId,
          reason: "cancelled",
        }),
      );
      logCall("cancelled");
    }
    teardown();
  }, [logCall, outgoingCall, selfId, teardown]);

  const hangup = useCallback(() => {
    const call = activeCallRef.current;
    const socket = socketRef.current;
    if (call && socket) {
      if (call.mode === "group") {
        socket.emit("group_call_left", {
          conversationId: call.conversationId,
          fromUserId: selfId,
        });
      } else {
        call.targetUserIds.forEach((targetUserId) =>
          socket.emit("call:end", {
            conversationId: call.conversationId,
            targetUserId,
            fromUserId: selfId,
            reason: "ended",
          }),
        );
      }
      logCall(answeredRef.current ? "completed" : "cancelled");
    }
    teardown();
  }, [logCall, selfId, teardown]);

  // ---- Điều khiển media ----
  const toggleMic = useCallback(() => {
    const next = !micMuted;
    setMicMuted(next);
    setMicEnabled(!next);
    const call = activeCallRef.current;
    socketRef.current?.emit("participant_muted", {
      conversationId: call?.conversationId,
      micMuted: next,
    });
  }, [micMuted]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraOff;
    setCameraOff(next);
    await setCameraEnabled(!next);
    const call = activeCallRef.current;
    socketRef.current?.emit(
      next ? "participant_camera_off" : "participant_camera_on",
      { conversationId: call?.conversationId },
    );
  }, [cameraOff]);

  const switchCamera = useCallback(() => {
    switchCameraTrack();
  }, []);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerOn;
    setSpeakerOn(next);
    try {
      InCallManager.setForceSpeakerphoneOn(next);
    } catch {
      // bỏ qua
    }
  }, [speakerOn]);

  // ---- Mesh: chủ động gửi offer tới người mới (quy ước id nhỏ hơn gọi trước) ----
  const meshInitiate = useCallback(
    async (newUserId: number) => {
      const call = activeCallRef.current;
      const socket = socketRef.current;
      if (!call || !socket || !answeredRef.current) return;
      if (newUserId <= 0 || newUserId === selfId) return;
      if (callSession.peers.has(newUserId)) return; // đã có kết nối với người này
      if (selfId > newUserId) return; // bên kia sẽ gửi offer cho mình
      const pc = await buildPeerConnection(
        newUserId,
        call.callType,
        call.conversationId,
      );
      if (!pc) return;
      try {
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        socket.emit("call:offer", {
          targetUserId: newUserId,
          conversationId: call.conversationId,
          callType: call.callType,
          offer: { type: offer.type, sdp: offer.sdp },
          platform: "mobile",
        });
      } catch {
        // bỏ qua: mesh thất bại
      }
    },
    [selfId],
  );

  // ---- Đồng hồ thời lượng cuộc gọi ----
  useEffect(() => {
    if (callPhase !== "connected") return;
    const timer = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [callPhase]);

  // ---- Socket listeners signaling cuộc gọi ----
  useEffect(() => {
    const token = authStore.getTokens()?.accessToken;
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;

    const onOffer = async (raw: any) => {
      const fromUserId = Number(raw?.fromUserId || 0);
      const conversationId = String(raw?.conversationId || "").trim();
      const offer = raw?.offer?.sdp
        ? { type: String(raw.offer.type || "offer"), sdp: String(raw.offer.sdp) }
        : null;
      if (!fromUserId || fromUserId === selfId || !conversationId || !offer) return;
      const callType: CallType = raw?.callType === "voice" ? "voice" : "video";

      // Mesh / renegotiate: đang trong cuộc gọi cùng hội thoại → tự answer, không hiện modal.
      const active = activeCallRef.current;
      if (answeredRef.current && active && active.conversationId === conversationId) {
        try {
          const pc =
            (await buildPeerConnection(fromUserId, active.callType, conversationId)) || null;
          if (pc) {
            await applyRemoteDescription(fromUserId, offer);
            await flushPendingCandidates(fromUserId);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("call:answer", {
              targetUserId: fromUserId,
              conversationId,
              answer: { type: answer.type, sdp: answer.sdp },
            });
            setParticipantNames((prev) =>
              prev[fromUserId] ? prev : { ...prev, [fromUserId]: lookupName(fromUserId) },
            );
          }
        } catch {
          // bỏ qua thiết lập mesh thất bại
        }
        return;
      }

      // Đang có cuộc gọi khác → từ chối bận.
      if (activeCallRef.current || incomingCallRef.current || outgoingCallRef.current) {
        socket.emit("call:reject", {
          conversationId,
          targetUserId: fromUserId,
          fromUserId: selfId,
          reason: "busy",
        });
        return;
      }

      const conv = conversationsRef.current.find(
        (c) => String(c.id) === conversationId,
      );
      const mode: CallMode = conv?.isGroup ? "group" : "private";
      const fromUserName = String(raw?.fromUserName || lookupName(fromUserId));
      const conversationName = String(conv?.name || fromUserName || "Cuộc gọi");
      const next: IncomingCall = {
        conversationId,
        fromUserId,
        fromUserName,
        callType,
        mode,
        offer,
        conversationName,
      };
      setIncomingCall(next);
      if (conv && activeConversationIdRef.current !== conversationId) {
        onRequestOpenConversation?.(conversationId);
      }
    };

    const onAnswer = async (raw: any) => {
      const fromUserId = Number(raw?.fromUserId || 0);
      if (!fromUserId) return;
      try {
        if (raw?.answer?.sdp) {
          await applyRemoteDescription(fromUserId, {
            type: String(raw.answer.type || "answer"),
            sdp: String(raw.answer.sdp),
          });
        }
      } catch {
        // bỏ qua
      }
      const answeredAt = Number(raw?.answeredAt || 0) || Date.now();
      if (callLogRef.current && !callLogRef.current.answeredAt) {
        callLogRef.current.answeredAt = answeredAt;
      }
      answeredRef.current = true;
      clearNoAnswerTimer();
      setOutgoingCall(null);
      setActiveCall((prev) => (prev ? { ...prev, startedAt: answeredAt } : prev));
      setCallPhase("connected");
    };

    const onIce = async (raw: any) => {
      const fromUserId = Number(raw?.fromUserId || 0);
      if (!fromUserId || !raw?.candidate) return;
      await addRemoteCandidate(fromUserId, raw.candidate);
    };

    const onRemoteEnd = (raw: any) => {
      const fromUserId = Number(raw?.fromUserId || 0);
      const conversationId = String(raw?.conversationId || "").trim();
      const active = activeCallRef.current;
      const outgoing = outgoingCallRef.current;
      const incoming = incomingCallRef.current;
      const relevant =
        (active && active.conversationId === conversationId) ||
        (outgoing && outgoing.conversationId === conversationId) ||
        (incoming && incoming.conversationId === conversationId);
      if (!relevant) return;

      // Nhóm: 1 người rời → chỉ đóng peer của họ, giữ cuộc gọi.
      if (active && active.mode === "group" && fromUserId && fromUserId !== selfId) {
        closePeer(fromUserId);
        return;
      }
      const wasAnswered = answeredRef.current;
      logCall(wasAnswered ? "completed" : "cancelled");
      teardown();
    };

    const onReject = (raw: any) => {
      const conversationId = String(raw?.conversationId || "").trim();
      const outgoing = outgoingCallRef.current;
      if (!outgoing || (conversationId && outgoing.conversationId !== conversationId)) return;
      logCall("rejected");
      teardown();
      Alert.alert("Cuộc gọi bị từ chối", "Người nhận đã từ chối cuộc gọi.");
    };

    const onUnavailable = (raw: any) => {
      const conversationId = String(raw?.conversationId || "").trim();
      const outgoing = outgoingCallRef.current;
      if (outgoing && conversationId && outgoing.conversationId !== conversationId) return;
      logCall("no_answer");
      teardown();
      Alert.alert("Không thể gọi", "Người dùng hiện không trực tuyến.");
    };

    const onCallJoin = (raw: any) => {
      const fromUserId = Number(raw?.fromUserId || 0);
      if (fromUserId > 0 && fromUserId !== selfId) void meshInitiate(fromUserId);
    };

    const onParticipants = (raw: any) => {
      const ids: number[] = Array.isArray(raw?.participantIds)
        ? raw.participantIds.map((id: any) => Number(id)).filter((id: number) => id > 0)
        : [];
      ids.forEach((id) => {
        if (id !== selfId) void meshInitiate(id);
      });
      if (Array.isArray(raw?.participants)) {
        setRemoteMedia((prev) => {
          const next = { ...prev };
          for (const p of raw.participants) {
            const id = Number(p?.userId || 0);
            if (!id || id === selfId) continue;
            next[id] = {
              ...next[id],
              micMuted: Boolean(p?.micMuted),
              cameraOff: Boolean(p?.cameraOff),
            };
          }
          return next;
        });
      }
    };

    const onParticipantMuted = (raw: any) => {
      const id = Number(raw?.fromUserId || 0);
      if (id > 0)
        setRemoteMedia((prev) => ({
          ...prev,
          [id]: { ...prev[id], micMuted: raw?.micMuted !== false },
        }));
    };
    const onParticipantCameraOff = (raw: any) => {
      const id = Number(raw?.fromUserId || 0);
      if (id > 0)
        setRemoteMedia((prev) => ({ ...prev, [id]: { ...prev[id], cameraOff: true } }));
    };
    const onParticipantCameraOn = (raw: any) => {
      const id = Number(raw?.fromUserId || 0);
      if (id > 0)
        setRemoteMedia((prev) => ({ ...prev, [id]: { ...prev[id], cameraOff: false } }));
    };

    socket.on("call:offer", onOffer);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice-candidate", onIce);
    socket.on("call:end", onRemoteEnd);
    socket.on("call:ended", onRemoteEnd);
    socket.on("call:left", onRemoteEnd);
    socket.on("call:reject", onReject);
    socket.on("call:unavailable", onUnavailable);
    socket.on("call:join", onCallJoin);
    socket.on("call:participants", onParticipants);
    socket.on("participant_muted", onParticipantMuted);
    socket.on("participant_camera_off", onParticipantCameraOff);
    socket.on("participant_camera_on", onParticipantCameraOn);

    return () => {
      socket.off("call:offer", onOffer);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice-candidate", onIce);
      socket.off("call:end", onRemoteEnd);
      socket.off("call:ended", onRemoteEnd);
      socket.off("call:left", onRemoteEnd);
      socket.off("call:reject", onReject);
      socket.off("call:unavailable", onUnavailable);
      socket.off("call:join", onCallJoin);
      socket.off("call:participants", onParticipants);
      socket.off("participant_muted", onParticipantMuted);
      socket.off("participant_camera_off", onParticipantCameraOff);
      socket.off("participant_camera_on", onParticipantCameraOn);
    };
  }, [
    activeConversationIdRef,
    clearNoAnswerTimer,
    conversationsRef,
    lookupName,
    logCall,
    meshInitiate,
    onRequestOpenConversation,
    selfId,
    teardown,
  ]);

  // ---- Cuộc gọi đến khi đang ở tab khác (bootstrap từ App.tsx) ----
  useEffect(() => {
    const payload = incomingCallBootstrap;
    if (!payload?.conversationId || !payload?.offer?.sdp) return;
    const routeKey = Number(payload.routeKey || 0);
    if (routeKey && handledBootstrapRef.current === routeKey) return;
    if (routeKey) handledBootstrapRef.current = routeKey;
    if (activeCallRef.current || incomingCallRef.current) {
      onIncomingCallBootstrapHandled?.();
      return;
    }
    const conversationId = String(payload.conversationId);
    const conv = conversationsRef.current.find((c) => String(c.id) === conversationId);
    const fromUserId = Number(payload.fromUserId || 0);
    const fromUserName = String(payload.fromUserName || lookupName(fromUserId));
    setIncomingCall({
      conversationId,
      fromUserId,
      fromUserName,
      callType: payload.callType === "voice" ? "voice" : "video",
      mode: payload.mode || (conv?.isGroup ? "group" : "private"),
      offer: payload.offer,
      conversationName: String(conv?.name || fromUserName || "Cuộc gọi"),
    });
    if (conv && activeConversationIdRef.current !== conversationId) {
      onRequestOpenConversation?.(conversationId);
    }
    onIncomingCallBootstrapHandled?.();
  }, [
    activeConversationIdRef,
    conversationsRef,
    incomingCallBootstrap,
    lookupName,
    onIncomingCallBootstrapHandled,
    onRequestOpenConversation,
  ]);

  const statusText = useMemo(() => {
    if (callPhase === "calling") return "Đang gọi...";
    if (callPhase === "connecting") return "Đang kết nối...";
    if (callPhase === "connected") {
      const m = Math.floor(callSeconds / 60)
        .toString()
        .padStart(2, "0");
      const s = (callSeconds % 60).toString().padStart(2, "0");
      return `${m}:${s}`;
    }
    return "";
  }, [callPhase, callSeconds]);

  return {
    incomingCall,
    outgoingCall,
    activeCall,
    callPhase,
    isInCall: Boolean(activeCall && !outgoingCall),
    localStream,
    remoteStreams,
    remoteMedia,
    participantNames,
    micMuted,
    cameraOff,
    speakerOn,
    statusText,
    startCall,
    acceptIncoming,
    declineIncoming,
    cancelOutgoing,
    hangup,
    toggleMic,
    toggleCamera,
    switchCamera,
    toggleSpeaker,
  };
}
