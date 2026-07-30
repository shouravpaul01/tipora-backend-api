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
const getAllUsers = catchAsync(async (req, res) => {
  const result = await UserServices.getAllUsers(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Users retrieved successfully.",
    meta: result.meta,
    data: result.data,
  });
});

const updateStatus = catchAsync(async (req, res) => {
  const result = await UserServices.updateStatus(
    req.params.id as string,
    req.body.status,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User status updated successfully.",
    data: result,
  });
});
const getSingleUserDetails = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.getSingleUserDetails(
    req.params.id as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Single user fetched successfully.",
    data: result,
  });
});
const getUserDetailsWithCheck = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.getUserDetailsWithCheck(
    req.params.id as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Single user fetched successfully.",
    data: result,
  });
});
const updateMe = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.updateMe(
    req.user.id,
    req.file as Express.Multer.File,
    req.body,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully.",
    data: result,
  });
});

const deleteMe = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.deleteMe(req.user.id, res);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});
const startOnboarding = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.createOnboardingLink(req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Onboarding link generated successfully.",
    data: result,
  });
});

// ── check onboarding status ─────────────────────────

const updateOnboardingStatus = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserServices.updateOnboardingStatus(req.user.id, null);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Onboarding status fetched successfully.",
      data: result,
    });
  },
);
const getUserSummary = catchAsync(async (req, res) => {
  const result = await UserServices.getUserSummary();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "User summary retrieved successfully.",
    data: result,
  });
});
export const UserController = {
  getMe,
  getAllUsers,
  updateStatus,
  getSingleUserDetails,
  getUserDetailsWithCheck,
  updateMe,
  deleteMe,
  startOnboarding,
  updateOnboardingStatus,
  getUserSummary,
};
