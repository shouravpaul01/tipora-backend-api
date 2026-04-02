import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import { AuthValidations } from "./auth.validation";
import { AuthControllers } from "./auth.controller";
import auth from "../../middlewares/auth";

const router = Router();

// Registration & email verification
router.post(
  "/register",
  validateRequest(AuthValidations.register),
  AuthControllers.register
);

router.post(
  "/verify-otp",
  validateRequest(AuthValidations.verifyOtp),
  AuthControllers.verifyOtp
);

// Login / logout
router.post(
  "/login",
  validateRequest(AuthValidations.login),
  AuthControllers.login
);

router.post("/logout", AuthControllers.logout);

// Token refresh
router.post(
  "/refresh-token",
  validateRequest(AuthValidations.refreshToken),
  AuthControllers.refreshToken
);

// Password reset flow
router.post(
  "/forgot-password",
  validateRequest(AuthValidations.forgotPassword),
  AuthControllers.forgotPassword
);

router.post(
  "/verify-reset-otp",
  validateRequest(AuthValidations.verifyResetOtp),
  AuthControllers.verifyResetOtp
);

router.post(
  "/reset-password",
  validateRequest(AuthValidations.resetPassword),
  AuthControllers.resetPassword
);
router.patch(
  "/change-password",
  auth(),
  validateRequest(AuthValidations.changePassword),
  AuthControllers.changePassword,
);
router.post(
  "/logout",
  auth(),
  AuthControllers.logout
);
export const AuthRoutes = router;