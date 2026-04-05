// notification.service.ts

import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";

import { getIO } from "../../../helpers/socket";
import { SendNotificationPayload } from "./notification.interface";
import { emitUnreadCount } from "../../../utils/emitUnreadCount";
import admin from "firebase-admin";
import QueryBuilder from "../../../helpers/queryBuilder";

const SendNotification = async (payload: SendNotificationPayload) => {
  const { userId, title, body, type, data } = payload;

  const notification = await prisma.notification.create({
    data: {
      userId,
      title,
      body,
      type,
      data: data ?? null,
    },
  });

  // ── 2. unread count emit ───────────────────────────
  await emitUnreadCount(userId);

  // ── 3. FCM push notification ──────────────────────
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });

  if (user?.fcmToken) {
    try {
      await admin.messaging().send({
        token: user.fcmToken,
        notification: { title, body },
        data: {
          type,
          notificationId: notification.id,
          ...(data &&
            Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)]),
            )),
        },
        android: { priority: "high" },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
      });
    } catch (err) {
      console.error("FCM send error:", err);
    }
  }

  // ── 4. Socket.io real-time notification ───────────
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit("notification", notification);
  } catch (err) {
    console.error("Socket emit error:", err);
  }

  return notification;
};
const getMyNotifications = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const queryBuilder = new QueryBuilder(prisma.notification, query);

  const notifications = await queryBuilder
    .rawFilter({ userId })
    .sort()
    .paginate()
    .execute();

  const meta = await queryBuilder.countTotal();

  return { data: notifications, meta };
};
// ── unread count ──────────────────────────────────────

const getUnreadCount = async (userId: string) => {
  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  return { unreadCount: count };
};

// ── mark single as read ───────────────────────────────

const markAsRead = async (userId: string, notificationId: string) => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, "Notification not found.");
  }
  if (notification.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });

  await emitUnreadCount(userId);
  return updated;
};

// ── mark all as read ──────────────────────────────────

const markAllAsRead = async (userId: string) => {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  await emitUnreadCount(userId);
  return { message: "All notifications marked as read." };
};

// ── delete single ─────────────────────────────────────

const deleteNotification = async (userId: string, notificationId: string) => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, "Notification not found.");
  }
  if (notification.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  }

  await prisma.notification.delete({ where: { id: notificationId } });

  await emitUnreadCount(userId);
  return { message: "Notification deleted." };
};

// ── delete all ────────────────────────────────────────

const deleteAllNotifications = async (userId: string) => {
  await prisma.notification.deleteMany({ where: { userId } });

  await emitUnreadCount(userId);
  return { message: "All notifications deleted." };
};

export const NotificationServices = {
  SendNotification,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
};
