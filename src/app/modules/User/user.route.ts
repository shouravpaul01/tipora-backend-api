

import { Router } from "express";

import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { fileUploader } from "../../middlewares/fileUploader";

const router = Router();
router.get("/details/:id",  UserController.getSingleUserDetails);
router.get("/me", auth(), UserController.getMe);

router.patch(
  "/me",
  auth(),
  fileUploader.single("photo"),
  validateRequest(UserValidation.UpdateProfile),
  UserController.updateMe,
);

router.delete("/me", auth(), UserController.deleteMe);
router.post(
  "/onboarding",
  auth(),
  UserController.startOnboarding,
);

export const UserRoutes = router;