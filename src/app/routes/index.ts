import express from "express";

import { AuthRoutes } from "../modules/Auth/auth.routes";
import { UserRoutes } from "../modules/User/user.route";

import { NotificationRoutes } from "../modules/Notification/notification.route";
import { PaymentMethodRoutes } from "../modules/PaymentMethod/paymentMethod.route";
import { TipRoutes } from "../modules/Tips/tips.route";

const router = express.Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/users",
    route: UserRoutes,
  },
  {
    path: "/notifications",
    route: NotificationRoutes,
  },
  {
    path: "/payment-method",
    route: PaymentMethodRoutes,
  },
  {
    path: "/tips",
    route: TipRoutes,
  },

];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
