import express from "express";
import { UserRole } from "@prisma/client";

import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";

import WithdrawValidations from "./withdraw.validation";
import { WithdrawControllers } from "./withdraw.controller";

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// User Routes
// ─────────────────────────────────────────────────────────────

// Request a withdrawal
router.post(
  "/",
  auth(UserRole.USER),
  validateRequest(WithdrawValidations.requestWithdraw),
  WithdrawControllers.requestWithdraw,
);

// Logged-in user's withdraw history
router.get(
  "/history",
  auth(UserRole.USER),
  WithdrawControllers.getMyWithdrawHistory,
);

// ─────────────────────────────────────────────────────────────
// Admin Routes
// ─────────────────────────────────────────────────────────────

// Get all withdraw requests
router.get(
  "/",
  auth(UserRole.ADMIN),
  WithdrawControllers.getAllWithdraws,
);

// Get withdraw request details
router.get(
  "/:id",
  auth(UserRole.ADMIN),
  WithdrawControllers.getSingleWithdraw,
);

export const WithdrawRoutes = router;