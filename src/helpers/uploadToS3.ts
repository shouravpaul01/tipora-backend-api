import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ObjectCannedACL,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import config from "../config";
import ApiError from "../errors/ApiErrors";
import httpStatus from "http-status";

// Configure DigitalOcean Spaces
const s3 = new S3Client({
  region: "nyc3",
  endpoint: config.s3.do_space_endpoint,
  credentials: {
    accessKeyId: config.s3.do_space_accesskey || "", 
    secretAccessKey: config.s3.do_space_secret_key || "", 
  },
});

// Function to upload a file to DigitalOcean Space
export const uploadFileToS3 = async (
  // eslint-disable-next-line no-undef
  file: Express.Multer.File
) => {
  if (!process.env.DO_SPACE_BUCKET) {
    throw new Error(
      "DO_SPACE_BUCKET is not defined in the environment variables."
    );
  }
  const slug = file.originalname
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-\.]/g, "");
  const params = {
    Bucket: process.env.DO_SPACE_BUCKET, 
    Key: `tourismhub/${Date.now()}_${slug}`, 
   
    Body: file.buffer, 
    ContentType: file.mimetype,
    ACL: "public-read" as ObjectCannedACL, 
  };

  try {
    await s3.send(new PutObjectCommand(params));
    // console.log(result, "check result");
    return `https://${config.s3.do_space_bucket}.${(
      config.s3.do_space_endpoint || "nyc3.digitaloceanspaces.com"
    ).replace("https://", "")}/${params.Key}`;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
};

export const deleteFromCloud = async (fileUrl: string): Promise<void> => {
  try {
    // Extract the file key from the URL
    const key = fileUrl.replace(
      `${process.env.DO_SPACE_ENDPOINT}/${process.env.DO_SPACE_BUCKET}/`,
      ""
    );

    // Prepare the delete command
    const command = new DeleteObjectCommand({
      Bucket: `${process.env.DO_SPACE_BUCKET}`,
      Key: key,
    });

    // Execute the delete command
    await s3.send(command);

    console.log(`Successfully deleted file: ${fileUrl}`);
  } catch (error: any) {
    console.error(`Error deleting file: ${fileUrl}`, error);
    throw new Error(`Failed to delete file: ${error?.message}`);
  }
};

//delete multiple image url
export const deleteMultipleFromCloud = async (
  fileUrls: string[]
): Promise<void> => {
  try {
    if (!Array.isArray(fileUrls) || fileUrls.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "No file URLs provided");
    }

    // Extract file keys from URLs
    const objectKeys = fileUrls.map((fileUrl) =>
      fileUrl.replace(
        `${process.env.DO_SPACE_ENDPOINT}/${process.env.DO_SPACE_BUCKET}/`,
        ""
      )
    );

    // Prepare the delete command for multiple objects
    const command = new DeleteObjectsCommand({
      Bucket: process.env.DO_SPACE_BUCKET!,
      Delete: {
        Objects: objectKeys.map((Key) => ({ Key })),
      },
    });

    await s3.send(command);

    // console.log(`Successfully deleted files:`, fileUrls);
  } catch (error: any) {
    console.error(`Error deleting files:`, error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to delete files: ${error?.message}`
    );
  }
};

// aws uploder

// import {
//   DeleteObjectCommand,
//   DeleteObjectsCommand,
//   ObjectCannedACL,
//   PutObjectCommand,
//   S3Client,
// } from "@aws-sdk/client-s3";
// import config from "../config";
// import ApiError from "../errors/ApiErrors";
// import httpStatus from "http-status";

// // Configure DigitalOcean Spaces
// const s3 = new S3Client({
//   region: config.s3.aws_s3_region,
//   credentials: {
//     accessKeyId: config.s3.aws_s3_access_key as string, // Ensure this is never undefined
//     secretAccessKey: config.s3.aws_s3_secret_key as string, // Ensure this is never undefined
//   },
// });

// // Function to upload a file to DigitalOcean Space
// export const uploadFileToS3 = async (
//   // eslint-disable-next-line no-undef
//   file: Express.Multer.File
// ) => {
//   if (!config.s3.aws_s3_bucket) {
//     throw new Error("s3 bucket is not defined in the environment variables.");
//   }
//   const slug = file.originalname
//     .toLowerCase()
//     .replace(/\s+/g, "-")
//     .replace(/[^a-z0-9\-\.]/g, "");
//   const params = {
//     Bucket: config.s3.aws_s3_bucket, // Your Space name
//     Key: `files/${Date.now()}_${slug}`, // Object key in the Space
//     // Key: `${Date.now()}_${file.originalname}`, // Object key in the Space
//     Body: file.buffer, // Use the buffer from the memory storage
//     ContentType: file.mimetype,
//     // ACL: "public-read" as ObjectCannedACL, // Make the object publicly accessible
//   };

//   try {
//     await s3.send(new PutObjectCommand(params));
//     // console.log(result, "check result");
//     return `https://${config.s3.aws_s3_bucket}.s3.${config.s3.aws_s3_region}.amazonaws.com/${params.Key}`;
//     // return `https://${config.s3.do_space_bucket}.${(
//     //   config.s3.do_space_endpoint || "nyc3.digitaloceanspaces.com"
//     // ).replace("https://", "")}/${params.Key}`;
//   } catch (error) {
//     console.error("Error uploading file:", error);
//     throw error;
//   }
// };

// export const deleteFromCloud = async (fileUrl: string): Promise<void> => {
//   try {
//     // Extract the file key from the URL
//     const key = fileUrl.replace(
//       `https://${config.s3.aws_s3_bucket}.s3.${config.s3.aws_s3_region}.amazonaws.com/`,
//       ""
//     );

//     // Prepare the delete command
//     const command = new DeleteObjectCommand({
//       Bucket: `${config.s3.aws_s3_bucket}`,
//       Key: key,
//     });

//     // Execute the delete command
//     await s3.send(command);

//     console.log(`Successfully deleted file: ${fileUrl}`);
//   } catch (error: any) {
//     console.error(`Error deleting file: ${fileUrl}`, error);
//     throw new Error(`Failed to delete file: ${error?.message}`);
//   }
// };

// //delete multiple image url
// export const deleteMultipleFromCloud = async (
//   fileUrls: string[]
// ): Promise<void> => {
//   try {
//     if (!Array.isArray(fileUrls) || fileUrls.length === 0) {
//       throw new ApiError(httpStatus.BAD_REQUEST, "No file URLs provided");
//     }

//     // Extract file keys from URLs
//     const objectKeys = fileUrls.map((fileUrl) =>
//       fileUrl.replace(
//         `https://${config.s3.aws_s3_bucket}.s3.${config.s3.aws_s3_region}.amazonaws.com/`,
//         ""
//       )
//     );

//     // Prepare the delete command for multiple objects
//     const command = new DeleteObjectsCommand({
//       Bucket: config.s3.aws_s3_bucket!,
//       Delete: {
//         Objects: objectKeys.map((Key) => ({ Key })),
//       },
//     });

//     await s3.send(command);

//     // console.log(`Successfully deleted files:`, fileUrls);
//   } catch (error: any) {
//     console.error(`Error deleting files:`, error);
//     throw new ApiError(
//       httpStatus.INTERNAL_SERVER_ERROR,
//       `Failed to delete files: ${error?.message}`
//     );
//   }
// };
