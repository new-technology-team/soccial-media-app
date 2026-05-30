import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Input } from "../common/Input";
import { Button } from "../common/Button";
import { DatePickerField } from "../common/DatePickerField";
import { api } from "../../lib/api";
import { authStore } from "../../lib/auth";
import type { AuthUser } from "../../types";

type AuthMode = "login" | "register" | "verify" | "forgot" | "reset";

interface AuthFormProps {
  onLogin: (user: AuthUser) => void;
}

const modeSubtitle: Record<AuthMode, string> = {
  login: "Chào mừng bạn quay trở lại",
  register: "Tạo tài khoản miễn phí",
  verify: "Kiểm tra hộp thư của bạn",
  forgot: "Nhập thông tin để lấy lại tài khoản",
  reset: "Đặt mật khẩu mới cho tài khoản",
};

const GENDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
  { value: "other", label: "Khác" },
];

function dobToApiFormat(dob: string): string | undefined {
  if (dob.length !== 10) return undefined;
  const [dd, mm, yyyy] = dob.split("/");
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return undefined;
  return `${yyyy}-${mm}-${dd}`;
}

export function AuthForm({ onLogin }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const resetForms = () => {
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setNewPassword("");
  };

  const handleLogin = async () => {
    if (!emailOrPhone.trim() || !password) {
      setError("Vui lòng nhập đầy đủ thông tin");
      return;
    }
    setIsLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.login({ emailOrPhone: emailOrPhone.trim(), password });
      await authStore.setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
      onLogin(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!fullName.trim()) {
      setError("Vui lòng nhập họ và tên");
      return;
    }
    if (!emailOrPhone.trim()) {
      setError("Vui lòng nhập email hoặc số điện thoại");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccess("");
    try {
      const registerRes = await api.register({
        emailOrPhone: emailOrPhone.trim(),
        password,
        fullName: fullName.trim(),
        dateOfBirth: dobToApiFormat(dateOfBirth),
        gender: gender || undefined,
      });

      // Nếu backend yêu cầu xác thực OTP → chuyển sang bước verify
      if (registerRes.requiresVerification || registerRes.otpSent) {
        setMode("verify");
        setSuccess(
          registerRes.message ||
            `Mã xác thực đã gửi tới ${emailOrPhone.trim()}`,
        );
        return;
      }

      // Không cần OTP → auto-login
      const res = await api.login({
        emailOrPhone: emailOrPhone.trim(),
        password,
      });
      await authStore.setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
      onLogin(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng ký thất bại. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code) {
      setError("Vui lòng nhập mã OTP");
      return;
    }
    setIsLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.verifyRegistration({ emailOrPhone, code });
      await authStore.setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
      onLogin(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xác thực thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!emailOrPhone.trim()) {
      setError("Vui lòng nhập email hoặc số điện thoại");
      return;
    }
    setIsLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.forgotPassword(emailOrPhone.trim());
      setSuccess(
        res.message + (res.resetCode ? ` (Demo: ${res.resetCode})` : ""),
      );
      if (res.resetCode) setCode(res.resetCode);
      setMode("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi yêu cầu thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!code || !newPassword) {
      setError("Vui lòng nhập mã và mật khẩu mới");
      return;
    }
    if (newPassword.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    setIsLoading(true);
    setError("");
    setSuccess("");
    try {
      await api.resetPassword({ emailOrPhone, code, newPassword });
      setSuccess("Đặt lại mật khẩu thành công");
      setTimeout(() => {
        setMode("login");
        resetForms();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đặt lại thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  const modeTitle: Record<AuthMode, string> = {
    login: "Đăng nhập",
    register: "Đăng ký",
    verify: "Xác thực OTP",
    forgot: "Quên mật khẩu",
    reset: "Đặt lại mật khẩu",
  };

  const showTabs = mode === "login" || mode === "register";

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ minHeight: "100%" }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Brand Header */}
      <View className="bg-primary px-4 pt-12 pb-6">
        <Text className="text-white text-4xl font-extrabold tracking-tight">
          ZChat
        </Text>
        <Text className="text-white/80 text-sm mt-1">
          Kết nối mọi lúc, mọi nơi
        </Text>
      </View>

      <View className="px-4 py-6 flex-1">
        {/* Mode Tabs — hiện ở cả login và register */}
        {showTabs && (
          <View className="flex-row mb-6 bg-surface-secondary rounded-xl p-1">
            {(["login", "register"] as AuthMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                className={`flex-1 py-2.5 rounded-lg ${mode === m ? "bg-surface shadow-sm" : "bg-transparent"}`}
                onPress={() => {
                  setMode(m);
                  resetForms();
                }}
                activeOpacity={0.7}
              >
                <Text
                  className={`text-center text-sm font-semibold ${mode === m ? "text-primary" : "text-muted-foreground"}`}
                >
                  {m === "login" ? "Đăng nhập" : "Đăng ký"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text className="text-2xl font-extrabold text-foreground mb-1 tracking-tight">
          {modeTitle[mode]}
        </Text>
        <Text className="text-sm text-muted-foreground mb-6">
          {modeSubtitle[mode]}
        </Text>

        {/* Error / Success */}
        {error ? (
          <View className="bg-red-50 border border-[#fecaca] rounded-xl px-4 py-3 mb-4">
            <Text className="text-danger text-sm font-medium">{error}</Text>
          </View>
        ) : null}
        {success ? (
          <View className="bg-green-50 border border-[#bbf7d0] rounded-xl px-4 py-3 mb-4">
            <Text className="text-success text-sm font-medium">{success}</Text>
          </View>
        ) : null}

        {/* ── LOGIN ── */}
        {mode === "login" && (
          <View>
            <Input
              label="Email hoặc số điện thoại"
              icon="📧"
              placeholder="example@email.com"
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label="Mật khẩu"
              icon="🔒"
              placeholder="Nhập mật khẩu"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity
              className="self-end mb-4 -mt-1"
              onPress={() => {
                setMode("forgot");
                resetForms();
              }}
              activeOpacity={0.7}
            >
              <Text className="text-primary font-semibold text-sm">
                Quên mật khẩu?
              </Text>
            </TouchableOpacity>
            <Button
              title={isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
              onPress={handleLogin}
              loading={isLoading}
            />
          </View>
        )}

        {/* ── REGISTER ── */}
        {mode === "register" && (
          <View>
            <Input
              label="Họ và tên *"
              icon="👤"
              placeholder="Nguyễn Văn A"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
            <Input
              label="Email hoặc số điện thoại *"
              icon="📧"
              placeholder="example@email.com"
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Ngày sinh */}
            <DatePickerField
              label="Ngày sinh"
              value={dateOfBirth}
              onChange={setDateOfBirth}
            />

            {/* Giới tính — pill buttons */}
            <View className="mb-3">
              <Text className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Giới tính
              </Text>
              <View className="flex-row gap-2">
                {GENDER_OPTIONS.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setGender(value)}
                    activeOpacity={0.75}
                    className={`flex-1 py-3 rounded-xl border items-center ${
                      gender === value
                        ? "bg-primary border-primary"
                        : "bg-surface border-border"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        gender === value ? "text-white" : "text-foreground"
                      }`}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Input
              label="Mật khẩu *"
              icon="🔒"
              placeholder="Tối thiểu 6 ký tự"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Input
              label="Xác nhận mật khẩu *"
              icon="🔐"
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <Button
              title={isLoading ? "Đang đăng ký..." : "Tạo tài khoản"}
              onPress={handleRegister}
              loading={isLoading}
            />

            <View className="flex-row justify-center mt-4">
              <Text className="text-muted-foreground text-sm">
                Đã có tài khoản?{" "}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setMode("login");
                  resetForms();
                }}
                activeOpacity={0.7}
              >
                <Text className="text-primary font-semibold text-sm">
                  Đăng nhập
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── VERIFY ── */}
        {mode === "verify" && (
          <View>
            <Text className="text-sm text-muted-foreground mb-6">
              Nhập mã OTP đã gửi tới{" "}
              <Text className="font-semibold text-foreground">{emailOrPhone}</Text>
            </Text>
            <Input
              label="Mã OTP"
              placeholder="Nhập mã 6 số"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <Button
              title={isLoading ? "Đang xác thực..." : "Xác thực"}
              onPress={handleVerify}
              loading={isLoading}
            />
            <View className="flex-row justify-center mt-4">
              <TouchableOpacity onPress={() => setMode("login")} activeOpacity={0.7}>
                <Text className="text-primary font-semibold text-sm">
                  Quay về đăng nhập
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── FORGOT ── */}
        {mode === "forgot" && (
          <View>
            <Input
              label="Email hoặc số điện thoại"
              icon="📧"
              placeholder="example@email.com"
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Button
              title={isLoading ? "Đang gửi..." : "Gửi mã đặt lại"}
              onPress={handleForgot}
              loading={isLoading}
            />
            <View className="flex-row justify-center mt-4">
              <TouchableOpacity
                onPress={() => {
                  setMode("login");
                  resetForms();
                }}
                activeOpacity={0.7}
              >
                <Text className="text-primary font-semibold text-sm">
                  Quay về đăng nhập
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── RESET ── */}
        {mode === "reset" && (
          <View>
            <Input
              label="Mã đặt lại"
              placeholder="Nhập mã từ email/SMS"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
            />
            <Input
              label="Mật khẩu mới"
              placeholder="Tối thiểu 6 ký tự"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <Button
              title={isLoading ? "Đang đặt lại..." : "Đặt lại mật khẩu"}
              onPress={handleReset}
              loading={isLoading}
            />
            <View className="flex-row justify-center mt-4">
              <TouchableOpacity
                onPress={() => {
                  setMode("login");
                  resetForms();
                }}
                activeOpacity={0.7}
              >
                <Text className="text-primary font-semibold text-sm">
                  Quay về đăng nhập
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Demo hint */}
        {mode === "login" && (
          <View className="mt-6 bg-blue-50 rounded-xl px-4 py-3 border border-blue-200">
            <Text className="text-primary font-semibold text-xs">
              💡 Demo mode
            </Text>
            <Text className="text-muted-foreground text-xs mt-1">
              Trong môi trường dev, OTP hiển thị trực tiếp. Không cần check
              email.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
