import express from "express";
import auth from "../../middlewares/auth";
import { DashboardController } from "./overview.controller";
import { UserRole } from "@prisma/client";


const router = express.Router();

// ── Main endpoint — everything the overview page needs, in one call ──
router.get(
  "/overview",
  auth(UserRole.ADMIN),
  DashboardController.getOverview
);

// ── Granular endpoints — optional, for isolated refresh/lazy-loading ──
router.get("/cards", auth(UserRole.ADMIN), DashboardController.getCards);
router.get("/revenue-charts", auth(UserRole.ADMIN), DashboardController.getRevenueCharts);
router.get("/growth-charts", auth(UserRole.ADMIN), DashboardController.getGrowthCharts);
router.get("/comparison", auth(UserRole.ADMIN), DashboardController.getComparison);
router.get("/recent-users", auth(UserRole.ADMIN), DashboardController.getRecentUsers); // ?limit=10

export const DashboardRoutes = router;