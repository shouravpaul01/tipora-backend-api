// tip.controller.ts

import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { TipServices } from "./tips.service";
;

const sendTip = catchAsync(async (req: Request, res: Response) => {
  const result = await TipServices.sendTip(req.user.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Tip sent successfully.",
    data: result,
  });
});

const getMySentTips = catchAsync(async (req: Request, res: Response) => {
  const result = await TipServices.getMySentTips(req.user.id, req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Sent tips fetched successfully.",
    data: result.data,
    meta: result.meta,
  });
});

export const TipController = {
  sendTip,
  getMySentTips,
};