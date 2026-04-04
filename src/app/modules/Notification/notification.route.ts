import { Router } from "express";
import auth from "../../middlewares/auth";
import { NotificationController } from "./notification.controller";

const router = Router();

router.get("/", auth(), NotificationController.getMyNotifications);
router.get("/unread-count", auth(), NotificationController.getUnreadCount);
router.patch("/mark-all-read", auth(), NotificationController.markAllAsRead);
router.patch("/:id/read", auth(), NotificationController.markAsRead);
router.delete("/", auth(), NotificationController.deleteAllNotifications);
router.delete("/:id", auth(), NotificationController.deleteNotification);

export const NotificationRoutes = router;