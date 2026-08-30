import bcrypt from "bcrypt";
import crypto from "crypto";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiPathError from "../../../errors/ApiPathError";
import redis from "../../../shared/redis";
import { generateOtp } from "../../../utils/generateOtp";
import ApiError from "../../../errors/ApiErrors";
import { emailQueue } from "../../../services/Email/email.queue";
import { setTokenCookies, cookiesDomain, AuthUtils } from "./auth.utils";
import { jwtHelpers } from "../../../helpers/jwtHelpers";
import { env } from "../../../config/env.config";


// ── register ──────────────────────────────────────────────────────────────────
// Creates the user and sends an email OTP for verification.


const register = async (payload: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
}) => {
  // ── Check duplicate email ─────────────────────────────────────────
  const existingByEmail = await prisma.user.findUnique({
    where: { email: payload.email },
    include: { auth: true },
  });

  if (existingByEmail?.isPhoneVerified) {
    throw new ApiPathError(
      httpStatus.CONFLICT,
      "email",
      "An account with this email already exists.",
    );
  }

  // ── Check duplicate phone ─────────────────────────────────────────
  const existingByPhone = await prisma.user.findUnique({
    where: { phone: payload.phone },
    include: { auth: true },
  });

  if (existingByPhone?.isPhoneVerified) {
    throw new ApiPathError(
      httpStatus.CONFLICT,
      "phone",
      "An account with this phone number already exists.",
    );
  }

  const hashedPassword = await bcrypt.hash(payload.password, 12);
  const { password, ...userData } = payload;

  let user;

  // Prefer updating by email if found unverified, else by phone
  const existingUser = existingByEmail || existingByPhone;

  if (existingUser) {
    // ── Update existing unverified user ─────────────────────────────
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        ...userData,
        fullName: `${payload.firstName} ${payload.lastName}`,
        auth: {
          upsert: {
            update: { password: hashedPassword },
            create: { password: hashedPassword },
          },
        },
      },
      select: { id: true, fullName: true, phone: true, email: true, role: true },
    });
  } else {
    // ── Create new user ──────────────────────────────────────────────
    user = await prisma.user.create({
      data: {
        ...userData,
        fullName: `${payload.firstName} ${payload.lastName}`,
        auth: {
          create: { password: hashedPassword },
        },
      },
      select: { id: true, fullName: true, phone: true, email: true, role: true },
    });
  }

  // ── OTP send via Email ────────────────────────────────────────────
  const otp = generateOtp();
  await redis.set(`otp:register:${payload.email}`, otp, "EX", 5 * 60);
  await emailQueue.add("send-otp", {
    to: payload.email,
    subject: "Your OTP Code – Tipora",
    html: AuthUtils.otpEmailTemplate(payload.firstName, otp),
  });

  return { user };
};


// ── verify OTP ────────────────────────────────────────────────────────────────
// Verifies the email OTP sent during registration.

const verifyOtp = async (
  payload: { email: string; otp: string; fcmToken?: string },
  res: any,
) => {
  const storedOtp = await redis.get(`otp:register:${payload.email}`);
  if (!storedOtp || storedOtp !== payload.otp) {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "otp",
      "Invalid or expired OTP.",
    );
  }

  //  Find user by email and mark as verified
  const user = await prisma.user.update({
    where: { email: payload.email },
    data: {
      isPhoneVerified: true,
      ...(payload.fcmToken && { fcmToken: payload.fcmToken }),
    },
    select: { id: true, fullName: true, phone: true, email: true, role: true, photo: true },
  });

  //  Wallet check
  const existingWallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
  });

  //  Create wallet if not exists
  if (!existingWallet) {
    await prisma.wallet.create({
      data: {
        userId: user.id,
      },
    });
  }

  await redis.del(`otp:register:${payload.email}`);

  const tokens = AuthUtils.setTokenCookies(res, { id: user.id, role: user.role, email: user.email, phone: user.phone, fullName: user.fullName, photo: user.photo });

  return { user, ...tokens };
};

// ── login ─────────────────────────────────────────────────────────────────────
// Authenticates with phone + password.

const login = async (
  payload: { phone: string; password: string; fcmToken?: string },
  res: any,
) => {
  const user = await prisma.user.findUnique({
    where: { phone: payload.phone },
    include: { auth: true },
  });

  // ── User নেই বা phone verify হয়নি → same error দেখাও ─────────────
  if (!user || !user.auth || !user.isPhoneVerified) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  if (user.status === "BLOCKED") {
    throw new ApiError(httpStatus.FORBIDDEN, "Your account is blocked.");
  }

  const passwordMatch = await bcrypt.compare(
    payload.password,
    user.auth.password,
  );
  if (!passwordMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid credentials.");
  }

  await prisma.userAuth.update({
    where: { userId: user.id },
    data: { lastLoginAt: new Date() },
  });

  if (payload.fcmToken) {
    await prisma.user.update({
      where: { id: user.id },
      data: { fcmToken: payload.fcmToken },
    });
  }

  const { auth, ...safeUser } = user;
  const tokens = AuthUtils.setTokenCookies(res, { id: user.id, role: user.role, email: user.email, phone: user.phone, fullName: user.fullName, photo: user.photo });
  return { user: safeUser, ...tokens };
};

// ── forgot password ───────────────────────────────────────────────────────────
// Sends a password reset OTP to the user's email address.

const forgotPassword = async (payload: { email: string }) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });

  if (!user) {
    // Generic message to avoid user enumeration
    return { message: "If this email exists, an OTP has been sent." };
  }

  const otp = generateOtp();
  await redis.set(`otp:reset:${payload.email}`, otp, "EX", 10 * 60);

  await emailQueue.add("send-reset-otp", {
    to: payload.email,
    subject: "Password Reset OTP – Tipora",
    html: AuthUtils.resetOtpEmailTemplate(user.fullName, otp),
  });

  return { message: "If this email exists, an OTP has been sent." };
};

// ── verify reset OTP → return short-lived reset token ─────────────────────────

const verifyResetOtp = async (payload: { email: string; otp: string }) => {
  const storedOtp = await redis.get(`otp:reset:${payload.email}`);
  if (!storedOtp || storedOtp !== payload.otp) {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "otp",
      "Invalid or expired OTP.",
    );
  }

  await redis.del(`otp:reset:${payload.email}`);

  // Issue a short-lived, single-use reset token (JWT)
  const resetToken = jwtHelpers.generateToken(
    { email: payload.email, purpose: "password_reset" },
    env.RESET_PASS_TOKEN!,
    env.RESET_PASS_TOKEN_EXPIRES_IN as any,
  );

  // Store token hash in Redis to enforce single-use
  const tokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  await redis.set(`reset_token:${tokenHash}`, payload.email, "EX", 10 * 60);

  return { resetToken };
};

// ── reset password ────────────────────────────────────────────────────────────

const resetPassword = async (payload: {
  resetToken: string;
  newPassword: string;
}) => {
  let decoded: { email: string; purpose: string };
  try {
    decoded = jwtHelpers.verifyToken(
      payload.resetToken,
      env.RESET_PASS_TOKEN!,
    ) as any;
  } catch {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "resetToken",
      "Invalid or expired reset token.",
    );
  }

  if (decoded.purpose !== "password_reset") {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "resetToken",
      "Invalid token purpose.",
    );
  }

  // Check single-use hash
  const tokenHash = crypto
    .createHash("sha256")
    .update(payload.resetToken)
    .digest("hex");
  const storedEmail = await redis.get(`reset_token:${tokenHash}`);
  if (!storedEmail) {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "resetToken",
      "Token already used or expired.",
    );
  }

  const hashedPassword = await bcrypt.hash(payload.newPassword, 12);

  await prisma.user.update({
    where: { email: decoded.email },
    data: {
      auth: {
        update: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
        },
      },
    },
  });

  // Invalidate token after use
  await redis.del(`reset_token:${tokenHash}`);

  return { message: "Password reset successfully." };
};

// ── refresh access token ──────────────────────────────────────────────────────

const refreshToken = async (token: string, res: any) => {
  let decoded: { id: string; role: string };
  try {
    decoded = jwtHelpers.verifyToken(token, env?.REFRESH_TOKEN_SECRET!) as any;
  } catch {
    throw new ApiPathError(
      httpStatus.UNAUTHORIZED,
      "refreshToken",
      "Invalid or expired refresh token.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },

  });

  if (!user || user.isDeleted || user.status === "BLOCKED") {
    throw new ApiPathError(
      httpStatus.UNAUTHORIZED,
      "refreshToken",
      "User no longer active.",
    );
  }

  const tokens = AuthUtils.setTokenCookies(res, { id: user.id, role: user.role, email: user.email, phone: user.phone, fullName: user.fullName, photo: user.photo });
  return tokens;
};

// ── change password ───────────────────────────────────────────────────────────

const changePassword = async (
  userId: string,
  payload: { currentPassword: string; newPassword: string },
) => {
  const userAuth = await prisma.userAuth.findUnique({
    where: { userId },
  });

  if (!userAuth) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  const passwordMatch = await bcrypt.compare(
    payload.currentPassword,
    userAuth.password,
  );
  if (!passwordMatch) {
    throw new ApiPathError(
      httpStatus.UNAUTHORIZED,
      "currentPassword",
      "Current password is incorrect.",
    );
  }

  if (payload.currentPassword === payload.newPassword) {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "newPassword",
      "New password must be different from current password.",
    );
  }

  const hashedPassword = await bcrypt.hash(payload.newPassword, 12);

  await prisma.userAuth.update({
    where: { userId },
    data: {
      password: hashedPassword,
      passwordChangedAt: new Date(),
    },
  });

  return { message: "Password changed successfully." };
};

// ── logout ────────────────────────────────────────────────────────────────────

const logout = async (res: any) => {
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    domain: cookiesDomain,
    path: "/",
  };

  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
  return { message: "Logged out successfully." };
};

export const AuthServices = {
  register,
  verifyOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  refreshToken,
  changePassword,
  logout,
};