import { Router } from "express";
import { UserRole } from "@prisma/client";

import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { fileUploader } from "../../middlewares/fileUploader";

import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = Router();

/**
 * ======================================================
 * Current Authenticated User
 * ======================================================
 */
router.get(
  "/me",
  auth(),
  UserController.getMe
);

router.patch(
  "/me",
  auth(),
  fileUploader.single("photo"),
  validateRequest(UserValidation.UpdateProfile),
  UserController.updateMe
);

router.delete(
  "/me",
  auth(),
  UserController.deleteMe
);

/**
 * ======================================================
 * User Onboarding
 * ======================================================
 */
router.post(
  "/me/onboarding",
  auth(),
  UserController.startOnboarding
);

router.patch(
  "/me/onboarding/status",
  auth(),
  UserController.updateOnboardingStatus
);

/**
 * ======================================================
 * Admin User Management
 * ======================================================
 */
router.get(
  "/summary",
  auth(UserRole.ADMIN),
  UserController.getUserSummary,
);

router.get(
  "/",
  auth(UserRole.ADMIN),
  UserController.getAllUsers,
);

router.get(
  "/details/:id",
  auth(UserRole.ADMIN),
  UserController.getSingleUserDetails,
);

router.get(
  "/me",
  auth(),
  UserController.getMe,
);
router.get(
  "/",
  auth(UserRole.ADMIN),
  UserController.getAllUsers
);

router.get(
  "/:id",
  auth(UserRole.ADMIN),
  UserController.getSingleUserDetails
);

router.patch(
  "/:id/status",
  auth(UserRole.ADMIN),
  validateRequest(UserValidation.updateStatus),
  UserController.updateStatus
);

export const UserRoutes = router;