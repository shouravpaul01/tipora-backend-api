import { getIO } from "../helpers/socket";
import prisma from "../shared/prisma";

export const emitUnreadCount = async (userId: string) => {
  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit("notification:unread-count", { unreadCount });
  } catch (err) {
    console.error("Socket emit error:", err);
  }
};