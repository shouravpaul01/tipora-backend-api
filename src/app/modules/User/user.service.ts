import bcrypt from "bcrypt";
import ApiError from "../../../errors/ApiErrors";
import prisma from "../../../shared/prisma";
import { User, UserRole, UserStatus } from "@prisma/client";
import httpStatus from "http-status";
import QueryBuilder from "../../../helpers/queryBuilder";

const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      password: true,
      role: true,
      phone: true,
      photo: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return user;
};

const updateUser = async (id: string, payload: Partial<User>) => {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "This user not found");
  }
  const result = await prisma.user.update({
    where: { id },
    data: payload,
  });
  const { password, ...userWithoutPassword } = result;
  return userWithoutPassword;
};

const blockUser = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
  });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "This user not found");
  }

  // Determine the new status
  const newStatus =
    user.status === UserStatus.BLOCKED ? UserStatus.ACTIVE : UserStatus.BLOCKED;

  const result = await prisma.user.update({
    where: { id },
    data: { status: newStatus },
  });

  return {
    data: result,
    message:
      newStatus === UserStatus.BLOCKED
        ? "User blocked successfully"
        : "User unblocked successfully",
  };
};

const deleteUser = async (id: string) => {
  const result = await prisma.user.update({
    where: { id },
    data: { isDeleted: true },
  });

  return result;
};

const getAllUsers = async (queryParams: Record<string, any>) => {
  try {
    const queryBuilder = new QueryBuilder(prisma.user, queryParams);
    const users = await queryBuilder
      .search(["firstName", "lastName", "email", "phone"])
      .rawFilter({
        role: {
          not: "ADMIN",
        },
        isDeleted: false,
      })
      .sort()
      .include({ hospital: true })
      .paginate()
      .execute();

    const meta = await queryBuilder.countTotal();
    return { data: users, meta };
  } catch (error) {
    console.log("error", error);
    return {
      meta: { page: 1, limit: 10, total: 0, totalPage: 0 },
      data: [],
    };
  }
};

// get user profile
const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      photo: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User Not found");
  }

  return user;
};
const updateMe = async (id: string, payload: User) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "user not found");
  }
  const updated = await prisma.user.update({ where: { id }, data: payload });
  return { message: "your profile update successfully" };
};

export const UserService = {
  getUserById,
  updateUser,
  deleteUser,
  getAllUsers,
  blockUser,
  updateMe,
  getMe,
};
