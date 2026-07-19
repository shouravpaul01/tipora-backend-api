// tip.routes.ts

import { Router } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { TipController } from "./tips.controller";
import { TipValidation } from "./tips.validation";
import { UserRole } from "@prisma/client";

const router = Router();
router.post(
  "/send",
  auth(),
  validateRequest(TipValidation.sendTip),
  TipController.sendTip,
);

router.get("/my-tips", auth(), TipController.getMySentTips);

router.get("/", auth(UserRole.ADMIN), TipController.getAllTips);

router.get("/:id", auth(UserRole.ADMIN), TipController.getSingleTip);
export const TipRoutes = router;
