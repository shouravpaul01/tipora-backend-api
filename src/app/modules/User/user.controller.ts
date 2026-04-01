import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import { UserService } from "./user.service";
import sendResponse from "../../../shared/sendResponse";
import { User } from "@prisma/client";
import { ImageServices } from "../Image/Image.service";

const getUserById = catchAsync(async (req: Request, res: Response) => {
  const userId = req.params.id;
  console.log(userId);
  const result = await UserService.getUserById(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User retrieved successfully!",
    data: result,
  });
});

const updateUser = catchAsync(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const updateData: User = req.body;
  if (req.file) {
    const url = await ImageServices.createImage(req.file);
    req.body.profileImage = url.imageUrl;
  }

  const result = await UserService.updateUser(userId, updateData);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User updated successfully!",
    data: result,
  });
});

const blockUser = catchAsync(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const result = await UserService.blockUser(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result.data,
  });
});

const deleteUser = catchAsync(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const result = await UserService.deleteUser(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User deleted successfully!",
    data: result,
  });
});

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getAllUsers(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All users retrieved successfully!",
    meta: result.meta,
    data: result.data,
  });
});
const updateMe = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await UserService.updateMe(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "your profile updated successfully!",
    data: result,
  });
});
// get user profile
const getMe = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await UserService.getMe(userId as string);
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "your profile retrieved successfully",
    data: result,
  });
});

export const UserController = {
  getUserById,
  updateUser,
  deleteUser,
  getAllUsers,
  blockUser,
  updateMe,
  getMe,
};
