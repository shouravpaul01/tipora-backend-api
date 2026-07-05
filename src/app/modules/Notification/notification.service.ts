// notification.service.ts

import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";

import { getIO } from "../../../helpers/socket";
import { SendNotificationPayload } from "./notification.interface";
import { emitUnreadCount } from "../../../utils/emitUnreadCount";
import admin from "firebase-admin";
import QueryBuilder from "../../../helpers/queryBuilder";
import { NotificationType } from "@prisma/client";


 
// ═════════════════════════════════════════════════════════════════════════════
// SEND NOTIFICATION (single user)
// Creates the DB record, bumps unread count, pushes FCM, and emits over socket.
// ═════════════════════════════════════════════════════════════════════════════
 
const SendNotification = async (payload: SendNotificationPayload) => {
  const { userId, title, body, type, data } = payload;
 
  const notification = await prisma.notification.create({
    data: {
      userId,
      title,
      body,
      type: type as NotificationType,
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
          type: type as string,
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
 
// ═════════════════════════════════════════════════════════════════════════════
// NOTIFY ADMINS (broadcast)
// Sends the same notification to every active admin — used for things the
// platform team needs to see, like platform fee being earned on a withdrawal.
// Reuses SendNotification per-admin so each admin gets their own DB row,
// unread count, FCM push, and socket event.
// ═════════════════════════════════════════════════════════════════════════════
 
const NotifyAdmins = async (
  payload: Omit<SendNotificationPayload, "userId">,
) => {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isDeleted: false, status: "ACTIVE" },
    select: { id: true },
  });
 
  if (admins.length === 0) return [];
 
  const results = await Promise.allSettled(
    admins.map((admin_) =>
      SendNotification({ ...payload, userId: admin_.id }),
    ),
  );
 
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("NotifyAdmins error:", result.reason);
    }
  });
 
  return results;
};
 
// ═════════════════════════════════════════════════════════════════════════════
// NOTIFY PLATFORM FEE EARNED (convenience wrapper around NotifyAdmins)
// Call this whenever a PlatformRevenue row is created (e.g. after an
// instant-withdraw fee is collected) so admins see it show up immediately.
// ═════════════════════════════════════════════════════════════════════════════
 
const NotifyPlatformFeeEarned = async (payload: {
  amount: number;
  currency?: string;
  source: string; // e.g. "WITHDRAW_FEE"
  referenceId: string;
}) => {
  const { amount, currency = "usd", source, referenceId } = payload;
  const formattedAmount = `$${amount.toFixed(2)}`;
 
  return NotifyAdmins({
    title: "Platform fee earned 💰",
    body: `A ${formattedAmount} ${currency.toUpperCase()} platform fee was just recorded (${source}).`,
    type: "PLATFORM_FEE_EARNED",
    data: {
      amount: amount.toString(),
      currency,
      source,
      referenceId,
    },
  });
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
  NotifyAdmins,
  NotifyPlatformFeeEarned,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
};
