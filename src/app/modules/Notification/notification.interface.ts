import { NotificationType } from "@prisma/client";

export interface SendNotificationPayload {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  data?: Record<string, any>;
}