import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AuthServices } from "./auth.service";

const register = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.register(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Registration successful. Please check your email for the OTP.",
    data: result,
  });
});

const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.verifyOtp(req.body, res);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Email verified successfully.",
    data: result,
  });
});

const login = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.login(req.body, res);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Login successful.",
    data: result,
  });
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.forgotPassword(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const verifyResetOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.verifyResetOtp(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP verified. Use the reset token to set a new password.",
    data: result,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthServices.resetPassword(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  const result = await AuthServices.refreshToken(token, res);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Access token refreshed.",
    data: result,
  });
});

const logout = catchAsync(async (req: Request, res: Response) => {
  const result = AuthServices.logout(res);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const AuthControllers = {
  register,
  verifyOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  refreshToken,
  logout,
};