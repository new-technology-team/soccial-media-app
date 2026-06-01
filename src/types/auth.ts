export type AuthUser = {
  id: number;
  email?: string | null;
  phone?: string | null;
  fullName: string;
  avatarUrl?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  isVerified?: boolean;
  role?: string;
  accountStatus?: string;
  createdAt?: string;
  lastActiveAt?: string | null;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type LoginPayload = {
  emailOrPhone: string;
  password: string;
};

export type RegisterPayload = {
  emailOrPhone: string;
  password: string;
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type RegisterResponse = {
  message: string;
  requiresVerification?: boolean;
  otpSent: boolean;
  otpChannel?: string;
  otpDestination?: string;
  otpReason?: string;
  otpError?: string;
  emailOrPhone: string;
  verificationCode?: string;
};

export type UpdateProfilePayload = {
  fullName?: string;
  avatarUrl?: string;
  dateOfBirth?: string | null;
  gender?: string | null;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};
