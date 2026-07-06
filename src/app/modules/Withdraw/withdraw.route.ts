import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";

import WithdrawValidations from "./withdraw.validation";
import { UserRole } from "@prisma/client";
import { WithdrawControllers } from "./withdraw.controller";

const router = express.Router();

// Get personal withdraw history — query handled by QueryBuilder
router.get(
  "/history",
  auth(UserRole.USER),
  WithdrawControllers.getMyWithdrawHistory,
);

// Request a withdrawal — triggers Stripe Transfer immediately
router.post(
  "/",
  auth(UserRole.USER),
  validateRequest(WithdrawValidations.requestWithdraw),
  WithdrawControllers.requestWithdraw,
);

// ── Admin Routes ──────────────────────────────────────────────────────────────

// Get all withdraw requests across all users — query handled by QueryBuilder
// router.get(
//   "/admin/all",
//   auth(UserRole.ADMIN),
//   WithdrawControllers.getAllWithdrawRequests,
// );

export const WithdrawRoutes = router;
