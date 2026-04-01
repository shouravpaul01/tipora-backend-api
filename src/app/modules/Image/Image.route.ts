import { Router } from "express";
import { ImageControllers } from "./Image.controller";
import fileUploaderCloud from "../../../helpers/fileUploaderCloud";

const router = Router();

// create image
router.post(
  "/upload",
  fileUploaderCloud.upload.single("image"),
  ImageControllers.createImage
);

// create multiple images
router.post(
  "/upload-multiple",
  fileUploaderCloud.upload.array("images"),
  ImageControllers.createMultipleImages
);

// delete image
router.delete("/delete", ImageControllers.deleteImage);

// delete multiple images
router.delete("/delete-multiple", ImageControllers.deleteMultipleImage);

export const ImageRoutes = router;
