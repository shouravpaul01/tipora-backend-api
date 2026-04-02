import { z } from "zod";
import dotenv from "dotenv";
import validateRequest from "../app/middlewares/validateRequest";

dotenv.config();

const envSchema = z.object({
  // General
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
  BACKEND_IMAGE_URL: z.string().url("BACKEND_IMAGE_URL must be a valid URL"),
  PORT: z.coerce.number().default(5000),

  // Stripe
  // STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  // STRIPE_PUBLISHABLE_KEY: z.string().min(1, "STRIPE_PUBLISHABLE_KEY is required"),
  // STRIPE_CLIENT_ID: z.string().min(1, "STRIPE_CLIENT_ID is required"),
  // STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  EXPIRES_IN: z.string().min(1, "EXPIRES_IN is required"),
  REFRESH_TOKEN_SECRET: z.string().min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().min(1, "REFRESH_TOKEN_EXPIRES_IN is required"),
  RESET_PASS_TOKEN: z.string().min(1, "RESET_PASS_TOKEN is required"),
  RESET_PASS_TOKEN_EXPIRES_IN: z.string().min(1, "RESET_PASS_TOKEN_EXPIRES_IN is required"),
  RESET_PASS_LINK: z.string().url("RESET_PASS_LINK must be a valid URL"),

  // Email
  EMAIL: z.string().email("EMAIL must be a valid email address"),
  APP_PASS: z.string().min(1, "APP_PASS is required"),


 
 // AWS S3
 AWS_S3_REGION:z.string().min(1, " AWS_S3_REGION is required"),
 AWS_S3_ENDPOINT: z.string().url("AWS_S3_ENDPOINT must be a valid URL"),
 AWS_S3_ACCESS_KEY:z.string().min(1, "AWS_S3_ACCESS_KEY is required"),
 AWS_S3_SECRET_KEY:z.string().min(1, "AWS_S3_SECRET_KEY is required"),
 AWS_S3_BUCKET:z.string().min(1, "AWS_S3_BUCKET is required"),


  // DigitalOcean S3
  // DO_SPACE_ENDPOINT: z.string().url("DO_SPACE_ENDPOINT must be a valid URL"),
  // DO_SPACE_ACCESS_KEY: z.string().min(1, "DO_SPACE_ACCESS_KEY is required"),
  // DO_SPACE_SECRET_KEY: z.string().min(1, "DO_SPACE_SECRET_KEY is required"),
  // DO_SPACE_BUCKET: z.string().min(1, "DO_SPACE_BUCKET is required"),
});

const validateEnv= envSchema.safeParse(process.env);
if (!validateEnv.success) {
  console.error("❌ Invalid environment variables:\n");
  const errors = validateEnv.error.flatten().fieldErrors;
  Object.entries(errors).forEach(([key, messages]) => {
    console.error(`  ${key}: ${messages?.join(", ")}`);
  });
  console.error("\nServer startup aborted.");
  process.exit(1);
}
export const env = validateEnv.data;