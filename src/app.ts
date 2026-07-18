import express, { Application, NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import bodyParser from "body-parser";
import router from "./app/routes";
import helmet from "helmet";
import GlobalErrorHandler from "./app/middlewares/globalErrorHandler";
import { AppBodyTemplate } from "./utils/BodyTemplate";
import morgan from "morgan";
import compression from "compression"
import { rateLimit } from "express-rate-limit";
import ApiError from "./errors/ApiErrors";
import { stripeWebhookHandler } from "./webhook/stripe.webhook";


const app: Application = express();

export const corsOptions = {
  origin: ["http://localhost:3000"],

  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  credentials: true,
};
const limiterOptions = {
  windowMs: 1 * 60 * 1000, // 1 minutes
  limit: 30,
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  ipv6Subnet: 56,
  handler: (req: Request, res: Response) => {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      "Too many requests from this IP. Please try again later.",
    );
  },
};
const helmetOptions={
    crossOriginResourcePolicy: false,

    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        scriptSrc: [
          "'self'",
          "https://js.stripe.com",
        ],

        imgSrc: [
          "'self'",
          "data:",
          "https:",
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https:",
        ],

        connectSrc: [
          "'self'",
          "https://api.stripe.com",
        ],
      },
    },
  }
app.use(helmet(helmetOptions));
// Middleware setup
app.use(cors(corsOptions));
app.use(compression());
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);
app.use(cookieParser());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.static("public"));
app.use(morgan("dev"));

// Apply rate limiting to protect the API from abuse, brute-force attacks,
// and excessive requests by limiting the number of requests per IP.
app.use(rateLimit(limiterOptions));

// Route handler for the root endpoint
app.get("/", (req: Request, res: Response) => {
  res.send(
    AppBodyTemplate({
      message: "Welcome to  Project API 🚀",
      version: "1.0.1",
      status: "Active",
      repoUrl: "",
      docsUrl: "https://github.com/shouravpaul01",
      showButtons: true,
    }),
  );
});

// app.use("/uploads", express.static(path.join("/var/www/uploads")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"))); 
// Setup API routes
app.use("/api/v1", router);

//Global Error handling middleware
app.use(GlobalErrorHandler);

// 404 Not Found handler
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: "API NOT FOUND!",
    error: {
      path: req.originalUrl,
      message: "Your requested path is not found!",
    },
  });
});

export default app;
