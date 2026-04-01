/* eslint-disable prefer-const */
// Image.service: Module file for the Image.service functionality.
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";

import { uploadFile } from "../../../helpers/uploadFileCloud";
import {
  deleteFromCloud,
  deleteMultipleFromCloud,
} from "../../../helpers/uploadToS3";

//create image
const createImage = async (file: Express.Multer.File) => {
  let imageUrl = await uploadFile(file!, "file");
  return { imageUrl };
};

// Service for creating images//multiple images creation
const createMultipleImages = async (files: Express.Multer.File[]) => {
  const imageUrls = [];

  for (let file of files) {
    let url = await uploadFile(file, "files");

    imageUrls.push(url);
  }

  return { imageUrls };
};

//delete single image
const deleteImage = async (url: string) => {
  if (!url) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No image provided");
  }
  const result = deleteFromCloud(url);
  return result;
};

//delete multiple images
const deleteMultipleImages = async (urls: string[]) => {
  if (!urls || urls.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No images provided for deletion"
    );
  }

  const result = deleteMultipleFromCloud(urls);

  return result;
};

export const ImageServices = {
  createImage,
  createMultipleImages,
  deleteImage,
  deleteMultipleImages,
};
