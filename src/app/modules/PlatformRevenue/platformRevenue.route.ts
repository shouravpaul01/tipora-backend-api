import express from "express";
import { UserRole } from "@prisma/client";

import auth from "../../middlewares/auth";
import { PlatformRevenueControllers } from "./platformRevenue.controller";

const router = express.Router();

// Summary
router.get(
  "/summary",
  auth(UserRole.ADMIN),
  PlatformRevenueControllers.getPlatformRevenueSummary,
);

// Get All Platform Revenues
router.get(
  "/",
  auth(UserRole.ADMIN),
  PlatformRevenueControllers.getAllPlatformRevenues,
);

// Get Single Platform Revenue
router.get(
  "/:id",
  auth(UserRole.ADMIN),
  PlatformRevenueControllers.getSinglePlatformRevenue,
);

export const PlatformRevenueRoutes = router;