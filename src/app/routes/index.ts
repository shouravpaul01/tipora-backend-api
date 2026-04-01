import express from "express";

import { AuthRoutes } from "../modules/Auth/auth.routes";
import { UserRoutes } from "../modules/User/user.route";
import { ImageRoutes } from "../modules/Image/Image.route";
import { PostRoutes } from "../modules/Post/Post.route";

// import { paymentRoutes } from "../modules/Payment/payment.route";

const router = express.Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/user",
    route: UserRoutes,
  },

  {
    path: "/files",
    route: ImageRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
