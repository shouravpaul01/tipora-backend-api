import httpStatus from "http-status";

import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";

import { PlatformRevenueServices } from "./platformRevenue.service";

const getAllPlatformRevenues = catchAsync(async (req, res) => {
  const result = await PlatformRevenueServices.getAllPlatformRevenues(
    req.query,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Platform revenues retrieved successfully.",
    meta: result.meta,
    data: result.data,
  });
});

const getSinglePlatformRevenue = catchAsync(async (req, res) => {
  const result =
    await PlatformRevenueServices.getSinglePlatformRevenue(req.params.id as string);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Platform revenue retrieved successfully.",
    data: result,
  });
});
const getPlatformRevenueSummary = catchAsync(async (req, res) => {
  const result =
    await PlatformRevenueServices.getPlatformRevenueSummary();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Platform revenue summary retrieved successfully.",
    data: result,
  });
});
export const PlatformRevenueControllers = {
  getAllPlatformRevenues,
  getSinglePlatformRevenue,
  getPlatformRevenueSummary
};