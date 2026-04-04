import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { uploadFileToS3 } from "../../../helpers/uploadToS3";

// ── get my profile ────────────────────────────────────

const getMe = async (userId: string) => {
  
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false }});

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  return user;
};

// ── update my profile ─────────────────────────────────

const updateMe = async (
  userId: string,
  file: Express.Multer.File | undefined,
  payload: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    bio?: string;
  },
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  // ── photo upload ──────────────────────────────────
  let photoUrl: string | undefined;
  if (file) {
    const { fileUrl } = await uploadFileToS3(file);
    photoUrl = fileUrl;
  }

  const firstName = payload.firstName ?? user.firstName;
  const lastName = payload.lastName ?? user.lastName;
  const fullName = `${firstName} ${lastName}`;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...payload,
      fullName,
      ...(photoUrl && { photo: photoUrl }),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      phone: true,
      photo: true,
      bio: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updated;
};
// ── delete my account ─────────────────────────────────

const deleteMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  // soft delete 
  await prisma.user.update({
    where: { id: userId },
    data: {
      isDeleted: true,
      status: "BLOCKED",
      fcmToken: null,
    },
  });

  return { message: "Account deleted successfully." };
};

export const UserServices = {
  getMe,
  updateMe,
  deleteMe,
};