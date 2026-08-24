// paymentMethod.controller.ts

import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { PaymentMethodServices } from "./paymentMethod.service";

const createSetupIntent = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentMethodServices.createSetupIntent(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Setup intent created.",
    data: result,
  });
});

const addCard = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentMethodServices.addCard(
    req.user.id,
    req.body.stripePaymentMethodId,
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Card added successfully.",
    data: result,
  });
});

const addWallet = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentMethodServices.addWallet(req.user.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: `${req.body.type === "APPLE_PAY" ? "Apple Pay" : "Google Pay"} added successfully.`,
    data: result,
  });
});

const getMyPaymentMethods = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentMethodServices.getMyPaymentMethods(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment methods fetched successfully.",
    data: result,
  });
});

const setDefault = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentMethodServices.setDefault(
    req.user.id,
    req.params.id as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const removePaymentMethod = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentMethodServices.removePaymentMethod(
    req.user.id,
    req.params.id as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});
const getStripeKey = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentMethodServices.getStripeKey();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully fetched",
    data: result,
  });
});
export const PaymentMethodController = {
  createSetupIntent,
  addCard,
  addWallet,
  getMyPaymentMethods,
  setDefault,
  removePaymentMethod,
  getStripeKey
};
