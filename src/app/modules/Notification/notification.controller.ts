// notification.controller.ts

import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { NotificationServices } from "./notification.service";

const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const result = await NotificationServices.getMyNotifications(
    req.user.id,
    req.query,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notifications fetched successfully.",
    data: result.data,
    meta: result.meta,
  });
});

const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const result = await NotificationServices.getUnreadCount(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Unread count fetched.",
    data: result,
  });
});

const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const result = await NotificationServices.markAsRead(
    req.user.id,
    req.params.id as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification marked as read.",
    data: result,
  });
});

const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  const result = await NotificationServices.markAllAsRead(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const deleteNotification = catchAsync(async (req: Request, res: Response) => {
  const result = await NotificationServices.deleteNotification(
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

const deleteAllNotifications = catchAsync(
  async (req: Request, res: Response) => {
    const result = await NotificationServices.deleteAllNotifications(
      req.user.id,
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: null,
    });
  },
);

export const NotificationController = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
};