import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { DashboardService } from "./overview.service";


const getOverview = catchAsync(async (req: Request, res: Response) => {
  const result = await DashboardService.getDashboardOverview();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Dashboard overview fetched successfully",
    data: result,
  });
});

const getCards = catchAsync(async (req: Request, res: Response) => {
  const result = await DashboardService.getDashboardCards();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Dashboard cards fetched successfully",
    data: result,
  });
});

const getRevenueCharts = catchAsync(async (req: Request, res: Response) => {
  const result = await DashboardService.getRevenueCharts();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Revenue charts fetched successfully",
    data: result,
  });
});

const getGrowthCharts = catchAsync(async (req: Request, res: Response) => {
  const result = await DashboardService.getGrowthCharts();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Growth charts fetched successfully",
    data: result,
  });
});

const getComparison = catchAsync(async (req: Request, res: Response) => {
  const result = await DashboardService.getComparison();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Current vs previous month comparison fetched successfully",
    data: result,
  });
});

const getRecentUsers = catchAsync(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const result = await DashboardService.getRecentUsers(limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Recent users fetched successfully",
    data: result,
  });
});

export const DashboardController = {
  getOverview,
  getCards,
  getRevenueCharts,
  getGrowthCharts,
  getComparison,
  getRecentUsers,
};