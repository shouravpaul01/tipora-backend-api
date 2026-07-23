import bcrypt from "bcrypt";
import crypto from "crypto";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiPathError from "../../../errors/ApiPathError";
import redis from "../../../shared/redis";
import { jwtHelpers } from "../../../helpers/jwtHelpers";
import { generateOtp } from "../../../utils/generateOtp";
import { env } from "../../../config/env.config";
import ApiError from "../../../errors/ApiErrors";
import { sendSMS } from "../../../helpers/sendSMS";
import { User } from "@prisma/client";
import ms, { StringValue } from "ms";

const setTokenCookies = (res: any, user: Partial<User>) => {
  const accessToken = jwtHelpers.generateToken(
    { ...user },
    env.JWT_SECRET,
    env.EXPIRES_IN as any,
  );

  const refreshToken = jwtHelpers.generateToken(
    { user },
    env.REFRESH_TOKEN_SECRET!,
    env.REFRESH_TOKEN_EXPIRES_IN as any,
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    domain:
      process.env.NODE_ENV === "production"
        ? ".app-magic.com"
        : undefined,
    path: "/",
  };

  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: ms(env.EXPIRES_IN as StringValue),
  });

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: ms(env.REFRESH_TOKEN_EXPIRES_IN as StringValue),
  });

  return {
    accessToken,
    refreshToken,
  };
};

// ── register ──────────────────────────────────────────────────────────────────
// Creates the user and sends a phone OTP for verification.


const register = async (payload: {
  firstName: string;
  lastName: string;
  email?: string;
  password: string;
  phone: string;
}) => {
  const existingUser = await prisma.user.findUnique({
    where: { phone: payload.phone },
    include: { auth: true },
  });

  // ── Verified account already exists ───────────────────────────────
  if (existingUser?.isPhoneVerified) {
    throw new ApiPathError(
      httpStatus.CONFLICT,
      "phone",
      "An account with this phone number already exists.",
    );
  }

  const hashedPassword = await bcrypt.hash(payload.password, 12);
  const { password, ...userData } = payload;

  let user;

  if (existingUser) {
    // ── Update existing unverified user ─────────────────────────────
    user = await prisma.user.update({
      where: { phone: payload.phone },
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

  // ── OTP send (একবারই) ────────────────────────────────────────────
  const otp = generateOtp();
  await redis.set(`otp:register:${payload.phone}`, otp, "EX", 5 * 60);
  await sendSMS({
    body: `Your OTP code is ${otp}. It expires in 5 minutes.`,
    to: payload.phone,
  });

  return { user };
};


// ── verify OTP ────────────────────────────────────────────────────────────────
// Verifies the phone OTP sent during registration.

const verifyOtp = async (
  payload: { phone: string; otp: string; fcmToken?: string },
  res: any,
) => {
  const storedOtp = await redis.get(`otp:register:${payload.phone}`);
  if (!storedOtp || storedOtp !== payload.otp) {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "otp",
      "Invalid or expired OTP.",
    );
  }

  //  Update user (verify phone)
  const user = await prisma.user.update({
    where: { phone: payload.phone },
    data: {
      isPhoneVerified: true,
      ...(payload.fcmToken && { fcmToken: payload.fcmToken }),
    },
    select: { id: true, fullName: true, phone: true, email: true, role: true,photo:true },
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

  await redis.del(`otp:register:${payload.phone}`);

  const tokens = setTokenCookies(res, {id:user.id,role:user.role,email:user.email,phone:user.phone,fullName:user.fullName, photo:user.photo});

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
  const tokens = setTokenCookies(res, {id:user.id,role:user.role,email:user.email,phone:user.phone,fullName:user.fullName,photo:user.photo});
  return { user: safeUser, ...tokens };
};

// ── forgot password ───────────────────────────────────────────────────────────
// Sends a password reset OTP to the user's phone number.

const forgotPassword = async (payload: { phone: string }) => {
  const user = await prisma.user.findUnique({
    where: { phone: payload.phone },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "No account found with this phone number.");
  }

  const otp = generateOtp();
  await redis.set(`otp:reset:${payload.phone}`, otp, "EX", 10 * 60);

  await sendSMS({
    body: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
    to: payload.phone,
  });

  return { message: "If this phone number exists, an OTP has been sent." };
};

// ── verify reset OTP → return short-lived reset token ─────────────────────────

const verifyResetOtp = async (payload: { phone: string; otp: string }) => {
  const storedOtp = await redis.get(`otp:reset:${payload.phone}`);
  if (!storedOtp || storedOtp !== payload.otp) {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "otp",
      "Invalid or expired OTP.",
    );
  }

  await redis.del(`otp:reset:${payload.phone}`);

  // Issue a short-lived, single-use reset token (JWT)
  const resetToken = jwtHelpers.generateToken(
    { phone: payload.phone, purpose: "password_reset" },
    env.RESET_PASS_TOKEN!,
    env.RESET_PASS_TOKEN_EXPIRES_IN as any,
  );

  // Store token hash in Redis to enforce single-use
  const tokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  await redis.set(`reset_token:${tokenHash}`, payload.phone, "EX", 10 * 60);

  return { resetToken };
};

// ── reset password ────────────────────────────────────────────────────────────

const resetPassword = async (payload: {
  resetToken: string;
  newPassword: string;
}) => {
  let decoded: { phone: string; purpose: string };
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
  const storedPhone = await redis.get(`reset_token:${tokenHash}`);
  if (!storedPhone) {
    throw new ApiPathError(
      httpStatus.BAD_REQUEST,
      "resetToken",
      "Token already used or expired.",
    );
  }

  const hashedPassword = await bcrypt.hash(payload.newPassword, 12);

  await prisma.user.update({
    where: { phone: decoded.phone },
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

  const tokens = setTokenCookies(res, {id:user.id,role:user.role,email:user.email,phone:user.phone,fullName:user.fullName,photo:user.photo});
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

const logout = async ( res: any) => {
 

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