import express from "express";
import { UserRole } from "@prisma/client";

import auth from "../../middlewares/auth";

import { PlatformRevenueControllers } from "./platformRevenue.controller";

const router = express.Router();

router.get(
  "/",
  auth(UserRole.ADMIN),
  PlatformRevenueControllers.getAllPlatformRevenues,
);

router.get(
  "/:id",
  auth(UserRole.ADMIN),
  PlatformRevenueControllers.getSinglePlatformRevenue,
);

export const PlatformRevenueRoutes = router;