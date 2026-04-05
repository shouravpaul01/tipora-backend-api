// paymentMethod.routes.ts

import { Router } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PaymentMethodController } from "./paymentMethod.controller";
import { PaymentMethodValidation } from "./paymentMethod.validation";

const router = Router();

router.get("/", auth(), PaymentMethodController.getMyPaymentMethods);

router.post(
  "/setup-intent",
  auth(),
  PaymentMethodController.createSetupIntent,
);

router.post(
  "/add-card",
  auth(),
  validateRequest(PaymentMethodValidation.addCard),
  PaymentMethodController.addCard,
);

router.post(
  "/add-wallet",
  auth(),
  validateRequest(PaymentMethodValidation.addWallet),
  PaymentMethodController.addWallet,
);

router.patch(
  "/:id/set-default",
  auth(),
  PaymentMethodController.setDefault,
);

router.delete(
  "/:id",
  auth(),
  PaymentMethodController.removePaymentMethod,
);

export const PaymentMethodRoutes = router;