import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { TopBar } from "../components/common/TopBar";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Button } from "../components/common/Button";
import { Avatar } from "../components/common/Avatar";
import { api } from "../lib/api";
import type { AuthUser } from "../types";

interface ProfileScreenProps {
  user: AuthUser;
  onLogout: () => void;
  onUserUpdated?: (user: AuthUser) => void;
  onBack?: () => void;
}

export function ProfileScreen({
  user,
  onLogout,
  onUserUpdated,
  onBack,
}: ProfileScreenProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth || "");
  const [gender, setGender] = useState(user.gender || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl || null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [status, setStatus] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [privacyLastSeen, setPrivacyLastSeen] = useState(false);
  const [privacyProfilePhoto, setPrivacyProfilePhoto] = useState(false);
  const [allowFriendRequests, setAllowFriendRequests] = useState(true);
  const [isLoadingPrivacy, setIsLoadingPrivacy] = useState(true);
  const [savingPrivacyKey, setSavingPrivacyKey] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user.fullName);
    setDateOfBirth(user.dateOfBirth || "");
    setGender(user.gender || "");
    setAvatarUrl(user.avatarUrl || null);
  }, [user]);

  useEffect(() => {
    let canceled = false;
    api.getPrivacySettings()
      .then((s) => {
        if (canceled) return;
        setPrivacyLastSeen(Boolean(s.privacyLastSeen));
        setPrivacyProfilePhoto(Boolean(s.privacyProfilePhoto));
        setAllowFriendRequests(Boolean(s.allowFriendRequests));
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!canceled) setIsLoadingPrivacy(false); });
    return () => { canceled = true; };
  }, []);

  const handleTogglePrivacy = async (
    key: "privacyLastSeen" | "privacyProfilePhoto" | "allowFriendRequests",
    value: boolean,
  ) => {
    if (key === "privacyLastSeen") setPrivacyLastSeen(value);
    else if (key === "privacyProfilePhoto") setPrivacyProfilePhoto(value);
    else setAllowFriendRequests(value);

    setSavingPrivacyKey(key);
    try {
      const updated = await api.updatePrivacySettings({ [key]: value });
      setPrivacyLastSeen(Boolean(updated.privacyLastSeen));
      setPrivacyProfilePhoto(Boolean(updated.privacyProfilePhoto));
      setAllowFriendRequests(Boolean(updated.allowFriendRequests));
    } catch {
      // revert on error
      if (key === "privacyLastSeen") setPrivacyLastSeen(!value);
      else if (key === "privacyProfilePhoto") setPrivacyProfilePhoto(!value);
      else setAllowFriendRequests(!value);
    } finally {
      setSavingPrivacyKey(null);
    }
  };

  const normalizeGender = (value: string) => {
    const lower = value.trim().toLowerCase();
    if (["nam", "male", "m"].includes(lower)) return "male";
    if (["nu", "n", "female", "f"].includes(lower)) return "female";
    if (["khac", "other", "o"].includes(lower)) return "other";
    return value.trim();
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus("");
    try {
      const res = await api.updateProfile({
        fullName: fullName || undefined,
        dateOfBirth: dateOfBirth || null,
        gender: gender ? normalizeGender(gender) : null,
      });
      setStatus("Cập nhật hồ sơ thành công");
      onUserUpdated?.(res.user);
      setFullName(res.user.fullName);
      setDateOfBirth(res.user.dateOfBirth || "");
      setGender(res.user.gender || "");
      setAvatarUrl(res.user.avatarUrl || null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setStatus("Vui lòng cấp quyền thư viện ảnh để đổi avatar");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.55,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setStatus("Không đọc được dữ liệu ảnh");
        return;
      }

      const approxBytes = Math.floor((asset.base64.length * 3) / 4);
      if (approxBytes > 8 * 1024 * 1024) {
        setStatus("Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 8MB");
        return;
      }

      setIsUploadingAvatar(true);
      setStatus("");

      const uploaded = await api.uploadAvatarBase64({
        fileName: asset.fileName || `avatar-${Date.now()}.jpg`,
        contentType: asset.mimeType || "image/jpeg",
        base64Data: asset.base64,
      });

      if (!uploaded.fileUrl) {
        throw new Error("Không nhận được URL avatar từ server");
      }

      const res = await api.updateProfile({ avatarUrl: uploaded.fileUrl });
      onUserUpdated?.(res.user);
      setAvatarUrl(res.user.avatarUrl || uploaded.fileUrl);
      setStatus("Cập nhật avatar thành công");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Tải avatar lên thất bại");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      setStatus("Vui lòng nhập đầy đủ mật khẩu");
      return;
    }

    setIsSaving(true);
    setStatus("");
    try {
      await api.changePassword({ currentPassword, newPassword });
      setStatus("Đổi mật khẩu thành công");
      setCurrentPassword("");
      setNewPassword("");
      setShowSettingsModal(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Đổi mật khẩu thất bại");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <TopBar
        title="Cài đặt"
        leftAction={onBack ? { label: "Quay lại", onPress: onBack } : undefined}
        rightAction={
          !onBack ? (
            <TouchableOpacity
              className="w-10 h-10 items-end justify-center"
              onPress={() => setShowSettingsModal(true)}
              activeOpacity={0.75}
            >
              <Feather name="settings" size={18} color="#4b5563" />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Card style={{ marginBottom: 12 }}>
          <View className="items-center">
            <Avatar
              name={fullName || user.fullName}
              avatarUrl={avatarUrl}
              size="lg"
            />
            <Text className="mt-3 text-lg font-bold text-foreground">
              {fullName || user.fullName}
            </Text>
            <Text className="text-muted-foreground text-xs">
              {user.email || user.phone || "Tài khoản ZChat"}
            </Text>

            <TouchableOpacity
              className="mt-3 rounded-full border border-border bg-surface-secondary px-3 py-2"
              onPress={() => {
                void handleChangeAvatar();
              }}
              disabled={isUploadingAvatar}
              activeOpacity={0.8}
            >
              <View className="flex-row items-center">
                {isUploadingAvatar ? (
                  <ActivityIndicator size="small" color="#0052ce" />
                ) : (
                  <Feather name="camera" size={14} color="#0052ce" />
                )}
                <Text className="text-primary font-semibold text-xs ml-2">
                  {isUploadingAvatar ? "Đang tải lên..." : "Đổi avatar"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text className="text-base font-bold text-foreground mb-2">
            Thông tin cá nhân
          </Text>
          <Text className="text-xs text-muted-foreground mb-4">
            Cập nhật thông tin cơ bản để đồng bộ giữa mobile và web.
          </Text>
          <Input
            label="Họ và tên"
            placeholder="Họ và tên"
            value={fullName}
            onChangeText={setFullName}
          />
          <Input
            label="Ngày sinh"
            placeholder="YYYY-MM-DD"
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
          />
          <Input
            label="Giới tính"
            placeholder="Nam / Nữ / Khác"
            value={gender}
            onChangeText={setGender}
          />
          <Button
            title={isSaving ? "Đang lưu..." : "Lưu thay đổi"}
            onPress={() => {
              void handleSave();
            }}
            loading={isSaving}
          />

          <TouchableOpacity
            className="mt-3 h-11 rounded-xl border border-border bg-surface-secondary items-center justify-center"
            onPress={() => setShowSettingsModal(true)}
            activeOpacity={0.8}
          >
            <Text className="text-sm font-semibold text-foreground">
              Quản lý tài khoản và mật khẩu
            </Text>
          </TouchableOpacity>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base font-bold text-foreground">Quyền riêng tư</Text>
            {isLoadingPrivacy ? <ActivityIndicator size="small" color="#0052ce" /> : null}
          </View>

          {[
            {
              key: "privacyLastSeen" as const,
              label: "Hiển thị lần cuối hoạt động",
              desc: "Người khác có thể thấy bạn hoạt động khi nào",
              value: privacyLastSeen,
            },
            {
              key: "privacyProfilePhoto" as const,
              label: "Ảnh đại diện công khai",
              desc: "Tất cả mọi người có thể xem ảnh đại diện của bạn",
              value: privacyProfilePhoto,
            },
            {
              key: "allowFriendRequests" as const,
              label: "Nhận lời mời kết bạn",
              desc: "Cho phép người khác gửi lời mời kết bạn đến bạn",
              value: allowFriendRequests,
            },
          ].map((item, index, arr) => (
            <View
              key={item.key}
              className={`flex-row items-center justify-between py-3 ${index < arr.length - 1 ? "border-b border-border" : ""}`}
            >
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-foreground">{item.label}</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">{item.desc}</Text>
              </View>
              {savingPrivacyKey === item.key ? (
                <ActivityIndicator size="small" color="#0052ce" />
              ) : (
                <Switch
                  value={item.value}
                  onValueChange={(v) => { void handleTogglePrivacy(item.key, v); }}
                  disabled={isLoadingPrivacy || savingPrivacyKey !== null}
                  trackColor={{ false: "#e5e7eb", true: "#93c5fd" }}
                  thumbColor={item.value ? "#0052ce" : "#f3f4f6"}
                />
              )}
            </View>
          ))}
        </Card>

        {status ? (
          <View className="mt-1 rounded-xl px-4 py-3 border border-border bg-surface-secondary">
            <Text className="text-sm text-foreground">{status}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={showSettingsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            Keyboard.dismiss();
            setShowSettingsModal(false);
          }}
        >
          <View className="flex-1 bg-black/40 justify-end">
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View className="bg-surface rounded-t-3xl px-4 pt-3 pb-6">
                <View className="items-center mb-3">
                  <View className="w-10 h-1 rounded-full bg-border" />
                </View>

                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-foreground text-base font-bold">
                    Cài đặt tài khoản
                  </Text>
                  <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                    <Feather name="x" size={20} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <Text className="text-xs text-muted-foreground mb-3">
                  Đổi mật khẩu và quản lý tài khoản trong khu vực này.
                </Text>

                <Input
                  label="Mật khẩu hiện tại"
                  placeholder="********"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                />
                <Input
                  label="Mật khẩu mới"
                  placeholder="********"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />

                <Button
                  title={isSaving ? "Đang đổi mật khẩu..." : "Đổi mật khẩu"}
                  onPress={() => {
                    void handleChangePassword();
                  }}
                  loading={isSaving}
                />

                {/* Xoá tài khoản: backend chưa hỗ trợ → tạm ẩn để tránh lỗi 404. */}

                <Pressable className="mt-4" onPress={onLogout}>
                  <View className="h-11 rounded-xl border border-red-200 bg-red-50 flex-row items-center justify-center">
                    <Feather name="log-out" size={14} color="#dc2626" />
                    <Text className="text-danger font-semibold text-sm ml-2">
                      Đăng xuất
                    </Text>
                  </View>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}
