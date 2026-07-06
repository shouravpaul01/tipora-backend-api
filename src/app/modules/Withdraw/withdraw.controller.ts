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

// const getAllWithdrawRequests = catchAsync(
//   async (req: Request, res: Response) => {
//     const result = await WithdrawServices.get(req.query);

//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: "Withdraw requests retrieved successfully.",
//       data: result.data,
//       meta: result.meta,
//     });
//   },
// );

export const WithdrawControllers = {
  requestWithdraw,

  getMyWithdrawHistory,

};

 