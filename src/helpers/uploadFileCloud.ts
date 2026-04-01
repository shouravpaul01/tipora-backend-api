import ApiError from "../errors/ApiErrors";
import { uploadFileToS3 } from "./uploadToS3";

export const uploadFile = async (
  file: Express.Multer.File,
  fileName: string
) => {
  if (!file) {
    throw new ApiError(400, `${fileName} image is required`);
  }
  return await uploadFileToS3(file);
};
