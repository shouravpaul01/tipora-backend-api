// paymentMethod.routes.ts

import { Router } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PaymentMethodController } from "./paymentMethod.controller";
import { PaymentMethodValidation } from "./paymentMethod.validation";

const router = Router();

// Get all payment methods
router.get("/", auth(), PaymentMethodController.getMyPaymentMethods);

// Create Stripe Setup Intent
router.post(
  "/setup-intent",
  auth(),
  PaymentMethodController.createSetupIntent,
);

// Add card
router.post(
  "/add-card",
  auth(),
  validateRequest(PaymentMethodValidation.addCard),
  PaymentMethodController.addCard,
);

// Add wallet
router.post(
  "/add-wallet",
  auth(),
  validateRequest(PaymentMethodValidation.addWallet),
  PaymentMethodController.addWallet,
);

// Set default payment method
router.patch(
  "/:id/set-default",
  auth(),
  PaymentMethodController.setDefault,
);

// Remove payment method
router.delete(
  "/:id",
  auth(),
  PaymentMethodController.removePaymentMethod,
);

// Get Stripe key
router.get(
  "/stripe-key",
  auth(),
  PaymentMethodController.getStripeKey,
);

export const PaymentMethodRoutes = router;