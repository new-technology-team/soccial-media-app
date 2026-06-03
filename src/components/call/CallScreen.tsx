import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { RTCView } from "react-native-webrtc";
import type { CallType, RemoteStreamEntry } from "../../lib/call-webrtc";

type RemoteMediaState = Record<number, { micMuted?: boolean; cameraOff?: boolean }>;

type CallScreenProps = {
  visible: boolean;
  callType: CallType;
  mode: "private" | "group";
  title: string;
  statusText: string;
  localStream: { toURL: () => string } | null;
  remoteStreams: RemoteStreamEntry[];
  remoteMedia: RemoteMediaState;
  participantNames: Record<number, string>;
  micMuted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onToggleSpeaker: () => void;
  onEnd: () => void;
};

function initialsOf(name: string): string {
  const parts = String(name || "?").trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function AvatarTile({ name, label }: { name: string; label?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-zinc-800">
      <View className="w-20 h-20 rounded-full bg-zinc-600 items-center justify-center">
        <Text className="text-2xl font-bold text-white">{initialsOf(name)}</Text>
      </View>
      {label ? (
        <Text className="mt-3 text-sm text-zinc-300">{label}</Text>
      ) : null}
    </View>
  );
}

export function CallScreen({
  visible,
  callType,
  mode,
  title,
  statusText,
  localStream,
  remoteStreams,
  remoteMedia,
  participantNames,
  micMuted,
  cameraOff,
  speakerOn,
  onToggleMic,
  onToggleCamera,
  onSwitchCamera,
  onToggleSpeaker,
  onEnd,
}: CallScreenProps) {
  const isVideo = callType === "video";
  const isGroup = mode === "group";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onEnd}>
      <View className="flex-1 bg-black">
        {/* Header */}
        <View className="absolute top-0 left-0 right-0 z-10 pt-12 pb-3 px-4 bg-black/40">
          <Text className="text-white text-base font-bold text-center" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-zinc-300 text-xs text-center mt-0.5">{statusText}</Text>
        </View>

        {/* Vùng video / avatar */}
        <View className="flex-1">
          {!isVideo ? (
            <AvatarTile name={title} label={statusText} />
          ) : remoteStreams.length === 0 ? (
            <AvatarTile name={title} label="Đang chờ kết nối..." />
          ) : isGroup ? (
            <View className="flex-1 flex-row flex-wrap pt-20">
              {remoteStreams.map((entry) => {
                const off = remoteMedia[entry.userId]?.cameraOff;
                const name = participantNames[entry.userId] || "Thành viên";
                return (
                  <View
                    key={entry.userId}
                    className="w-1/2 h-1/2 p-0.5"
                  >
                    {off ? (
                      <AvatarTile name={name} />
                    ) : (
                      <RTCView
                        streamURL={entry.stream.toURL()}
                        style={{ flex: 1, backgroundColor: "#18181b" }}
                        objectFit="cover"
                      />
                    )}
                  </View>
                );
              })}
            </View>
          ) : remoteMedia[remoteStreams[0].userId]?.cameraOff ? (
            <AvatarTile name={title} label="Đã tắt camera" />
          ) : (
            <RTCView
              streamURL={remoteStreams[0].stream.toURL()}
              style={{ flex: 1 }}
              objectFit="cover"
            />
          )}

          {/* Local preview (PiP) — chỉ khi gọi video và đang bật camera */}
          {isVideo && localStream && !cameraOff ? (
            <View className="absolute right-3 top-24 w-28 h-40 rounded-xl overflow-hidden border border-white/30">
              <RTCView
                streamURL={localStream.toURL()}
                style={{ flex: 1 }}
                objectFit="cover"
                mirror
                zOrder={1}
              />
            </View>
          ) : null}
        </View>

        {/* Thanh điều khiển */}
        <View className="absolute bottom-0 left-0 right-0 pb-10 pt-4 px-6 bg-black/40">
          <View className="flex-row items-center justify-center">
            <ControlButton
              icon={micMuted ? "mic-off" : "mic"}
              active={!micMuted}
              danger={micMuted}
              onPress={onToggleMic}
            />
            {isVideo ? (
              <ControlButton
                icon={cameraOff ? "video-off" : "video"}
                active={!cameraOff}
                danger={cameraOff}
                onPress={onToggleCamera}
              />
            ) : null}
            {isVideo ? (
              <ControlButton icon="refresh-cw" active onPress={onSwitchCamera} />
            ) : null}
            <ControlButton
              icon="volume-2"
              active={speakerOn}
              onPress={onToggleSpeaker}
            />
            <TouchableOpacity
              className="w-14 h-14 rounded-full bg-red-600 items-center justify-center mx-2"
              onPress={onEnd}
              activeOpacity={0.85}
            >
              <Feather name="phone-off" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ControlButton({
  icon,
  active,
  danger,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const bg = danger ? "bg-white" : active ? "bg-white/25" : "bg-white/10";
  const color = danger ? "#dc2626" : "#ffffff";
  return (
    <TouchableOpacity
      className={`w-14 h-14 rounded-full items-center justify-center mx-2 ${bg}`}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Feather name={icon} size={22} color={color} />
    </TouchableOpacity>
  );
}
