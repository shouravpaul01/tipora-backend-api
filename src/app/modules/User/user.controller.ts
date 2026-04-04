
import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { UserServices } from "./user.service";

const getMe = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.getMe(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile fetched successfully.",
    data: result,
  });
});

const updateMe = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.updateMe(req.user.id,req.file as Express.Multer.File, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully.",
    data: result,
  });
});

const deleteMe = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.deleteMe(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const UserController = {
  getMe,
  updateMe,
  deleteMe,
};