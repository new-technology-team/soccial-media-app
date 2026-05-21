import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
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
}

export function ProfileScreen({
  user,
  onLogout,
  onUserUpdated,
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

  useEffect(() => {
    setFullName(user.fullName);
    setDateOfBirth(user.dateOfBirth || "");
    setGender(user.gender || "");
    setAvatarUrl(user.avatarUrl || null);
  }, [user]);

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
      setStatus("Cap nhat ho so thanh cong");
      onUserUpdated?.(res.user);
      setFullName(res.user.fullName);
      setDateOfBirth(res.user.dateOfBirth || "");
      setGender(res.user.gender || "");
      setAvatarUrl(res.user.avatarUrl || null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Cap nhat that bai");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setStatus("Vui long cap quyen thu vien anh de doi avatar");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setStatus("Khong doc duoc du lieu anh");
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
        throw new Error("Khong nhan duoc URL avatar tu server");
      }

      const res = await api.updateProfile({ avatarUrl: uploaded.fileUrl });
      onUserUpdated?.(res.user);
      setAvatarUrl(res.user.avatarUrl || uploaded.fileUrl);
      setStatus("Cap nhat avatar thanh cong");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload avatar that bai");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      setStatus("Vui long nhap day du mat khau");
      return;
    }

    setIsSaving(true);
    setStatus("");
    try {
      await api.changePassword({ currentPassword, newPassword });
      setStatus("Doi mat khau thanh cong");
      setCurrentPassword("");
      setNewPassword("");
      setShowSettingsModal(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Doi mat khau that bai");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <TopBar
        title="Ho so"
        rightAction={
          <TouchableOpacity
            className="w-10 h-10 items-end justify-center"
            onPress={() => setShowSettingsModal(true)}
            activeOpacity={0.75}
          >
            <Feather name="settings" size={18} color="#4b5563" />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View className="items-center mb-6">
          <Avatar name={fullName || user.fullName} avatarUrl={avatarUrl} size="lg" />
          <Text className="mt-3 text-lg font-bold text-foreground">
            {fullName || user.fullName}
          </Text>
          <Text className="text-muted-foreground text-xs">{user.email || user.phone}</Text>

          <TouchableOpacity
            className="mt-2 rounded-full border border-border bg-surface-secondary px-3 py-1.5"
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
                {isUploadingAvatar ? "Dang upload..." : "Doi avatar"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Card style={{ marginBottom: 12 }}>
          <Text className="text-base font-bold text-foreground mb-4">Thong tin ca nhan</Text>
          <Input
            label="Ho va ten"
            placeholder="Ho va ten"
            value={fullName}
            onChangeText={setFullName}
          />
          <Input
            label="Ngay sinh"
            placeholder="YYYY-MM-DD"
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
          />
          <Input
            label="Gioi tinh"
            placeholder="Nam / Nu / Khac"
            value={gender}
            onChangeText={setGender}
          />
          <Button
            title={isSaving ? "Dang luu..." : "Luu thay doi"}
            onPress={() => {
              void handleSave();
            }}
            loading={isSaving}
          />
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
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-surface rounded-t-3xl px-4 pt-4 pb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-foreground text-base font-bold">Cai dat tai khoan</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Feather name="x" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Input
              label="Mat khau hien tai"
              placeholder="••••••••"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
            />
            <Input
              label="Mat khau moi"
              placeholder="••••••••"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />

            <Button
              title={isSaving ? "Dang doi mat khau..." : "Doi mat khau"}
              onPress={() => {
                void handleChangePassword();
              }}
              loading={isSaving}
            />

            <TouchableOpacity className="mt-4 px-4 py-3 items-center" onPress={onLogout}>
              <Text className="text-danger font-bold text-base">Dang xuat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
