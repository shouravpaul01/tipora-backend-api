import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import emailSender from "../../../helpers/emailSender";
import ApiPathError from "../../../errors/ApiPathError";
import redis from "../../../shared/redis";
import { jwtHelpers } from "../../../helpers/jwtHelpers";
import { generateOtp } from "../../../utils/generateOtp";
import { env } from "../../../config/env.config";
import ApiError from "../../../errors/ApiErrors";

const setTokenCookies = (res: any, userId: string, role: string) => {
  const accessToken = jwtHelpers.generateToken(
    { id: userId, role },
    env.JWT_SECRET,
    env.EXPIRES_IN as any,
  );
  const refreshToken = jwtHelpers.generateToken(
    { id: userId, role },
    env.REFRESH_TOKEN_SECRET!,
    env.REFRESH_TOKEN_EXPIRES_IN as any,
  );

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 min
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return { accessToken, refreshToken };
};

// ── register ─────────────────────────────────────────

const register = async (payload: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}) => {
  const existing = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (existing) {
    throw new ApiPathError(
      httpStatus.CONFLICT,
      "email",
      "Email already exists.",
    );
  }

  const hashedPassword = await bcrypt.hash(payload.password, 12);
  const { password, ...userData } = payload;

  const user = await prisma.user.create({
  data: {
    ...userData,
    fullName: `${payload.firstName} ${payload.lastName}`, 
    auth: {
      create: { password: hashedPassword },
    },
  },
  select: { id: true, fullName: true, email: true, role: true },
});

  // store OTP in Redis — key: otp:register:<email>
  const otp = generateOtp();
  await redis.set(`otp:register:${user.email}`, otp, "EX", 5 * 60);

  await emailSender({
    to: user.email,
    subject: "Your verification OTP",
    html: `Your OTP is ${otp}. It expires in 5 minutes.`,
  });

  return user;
};

// ── verify OTP (email verification) ──────────────────

const verifyOtp = async (
  payload: { email: string; otp: string; fcmToken?: string },
  res: any,
) => {
  const storedOtp = await redis.get(`otp:register:${payload.email}`);
  if (!storedOtp || storedOtp !== payload.otp) {
    throw new ApiPathError(httpStatus.BAD_REQUEST, "otp", "Invalid or expired OTP.");
  }

  const user = await prisma.user.update({
    where: { email: payload.email },
    data: {
      isEmailVerified: true,
      ...(payload.fcmToken && { fcmToken: payload.fcmToken }), 
    },
    select: { id: true, fullName: true, email: true, role: true },
  });

  await redis.del(`otp:register:${payload.email}`);
  const tokens = setTokenCookies(res, user.id, user.role);
  return { user, ...tokens };
};

// ── login ─────────────────────────────────────────────

const login = async (
  payload: { email: string; password: string; fcmToken?: string },
  res: any,
) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
    include: { auth: true },
  });

  if (!user || !user.auth) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "Invalid credentials.",
    );
  }
  if (user.status === "BLOCKED") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Your account is blocked.",
    );
  }

  const passwordMatch = await bcrypt.compare(
    payload.password,
    user.auth.password,
  );
  if (!passwordMatch) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "Invalid credentials.",
    );
  }

  // ── If email exists but not verified──────
  if (!user.isEmailVerified) {
    const otp = generateOtp();
    await redis.set(`otp:register:${user.email}`, otp, "EX", 5 * 60);

    await emailSender({
      to: user.email,
      subject: "Verify your email",
      html: `Your OTP is ${otp}. It expires in 5 minutes.`,
    });

    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Email not verified. A new OTP has been sent to your email.",
    );
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
  const tokens = setTokenCookies(res, user.id, user.role);
  return { user: safeUser, ...tokens };
};

// ── forgot password ───────────────────────────────────

const forgotPassword = async (payload: { email: string }) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User don't exists.");
  }

  const otp = generateOtp();
  await redis.set(`otp:reset:${payload.email}`, otp, "EX", 10 * 60);

  await emailSender({
    to: payload.email,
    subject: "Password reset OTP",
    html: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
  });

  return { message: "If this email exists, an OTP has been sent." };
};

// ── verify reset OTP → return short-lived reset token ─

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

// ── reset password ────────────────────────────────────

const resetPassword = async (payload: {
  resetToken: string;
  newPassword: string;
}) => {
  // Verify token
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

// ── refresh access token ──────────────────────────────

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
    select: { id: true, role: true, status: true, isDeleted: true },
  });

  if (!user || user.isDeleted || user.status === "BLOCKED") {
    throw new ApiPathError(
      httpStatus.UNAUTHORIZED,
      "refreshToken",
      "User no longer active.",
    );
  }

  const tokens = setTokenCookies(res, user.id, user.role);
  return tokens;
};
// ── change password ───────────────────────────────────

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
// ── logout ────────────────────────────────────────────

const logout = async (userId: string, res: any) => { 
  await prisma.user.update({ // ← add
    where: { id: userId },
    data: { fcmToken: null },
  });

  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
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
