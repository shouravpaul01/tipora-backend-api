import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import { WithdrawServices } from "./withdraw.service";
import sendResponse from "../../../shared/sendResponse";

// ═════════════════════════════════════════════════════════════════════════════
// REQUEST WITHDRAWAL
// POST /api/v1/withdraw
// ═════════════════════════════════════════════════════════════════════════════

const requestWithdraw = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const result = await WithdrawServices.requestWithdraw(userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdrawal processed successfully.",
    data: result,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET MY WITHDRAW HISTORY
// GET /api/v1/withdraw/history
// ═════════════════════════════════════════════════════════════════════════════

const getMyWithdrawHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const result = await WithdrawServices.getMyWithdrawHistory(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdraw history retrieved successfully.",
    data: result.data,
    meta: result.meta,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — GET ALL WITHDRAW REQUESTS
// GET /api/v1/withdraw/admin/all
// ═════════════════════════════════════════════════════════════════════════════

const getAllWithdraws = catchAsync(async (req, res) => {
  const result = await WithdrawServices.getAllWithdraws(req.query);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Withdraw requests retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});
const getSingleWithdraw = catchAsync(async (req, res) => {
  const result = await WithdrawServices.getSingleWithdraw(
    req.params.id as string,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Withdraw request retrieved successfully",
    data: result,
  });
});
const getWithdrawSummary = catchAsync(async (req, res) => {
  const result = await WithdrawServices.getWithdrawSummary();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Withdraw summary retrieved successfully.",
    data: result,
  });
});
export const WithdrawControllers = {
  requestWithdraw,

  getMyWithdrawHistory,
  getAllWithdraws,
  getSingleWithdraw,
  getWithdrawSummary,
};
