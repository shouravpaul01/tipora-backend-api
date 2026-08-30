# Tipora -- Backend API

**A real time, Stripe-powered tipping platform where anyone can send a tip to one person or split it across multiple performers  instantly or via standard payout  with zero platform fee on standard withdrawals.**



## Table of Contents

- [What is Tipora?](#what-is-tipora)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Module Breakdown](#module-breakdown)
- [Tip Flow](#tip-flow)
- [Withdrawal Flow and Fee Structure](#withdrawal-flow-and-fee-structure)
- [Authentication Flow](#authentication-flow)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Postman Collection](#postman-collection)
- [Database Schema](#database-schema)

---

## What is Tipora?

Tipora is a **real-time tip-sharing platform** built for performers, content creators, and service professionals. It allows any registered user to send a monetary tip to one person or divide a single tip amount across multiple recipients simultaneously all in a single transaction.

The platform is built around **Stripe Connect**, which handles the full lifecycle of money movement: from collecting payment from the sender's saved card (or Apple/Google Pay) to distributing funds into each receiver's connected bank account. Receivers first complete a **Stripe Express onboarding** to verify their identity and link their bank details. Once verified, they can withdraw their earned balance either on the standard schedule (free, 1–2 business days) or as an instant payout (3% platform fee deducted, funds arrive within minutes).

Tipping in person is supported via **QR code scanning**  each performer has a unique QR code that opens their tip page directly in the app, removing any search friction.

The system also includes an internal **wallet** per user that tracks available balance, pending amounts, and total lifetime earnings. All tip transactions, payout records, and platform revenue are persisted and accessible to administrators through a dedicated dashboard with charts and analytics.

---

## Core Features

| Feature | Description |
|---|---|
| **Single and Split Tipping** | A sender can tip one person or split a total amount evenly across multiple performers — all processed through a single Stripe PaymentIntent. Each recipient's wallet is credited their individual share. |
| **QR-Based Tipping** | Every performer has a unique QR code. Scanning it instantly opens their tip page in the app, enabling fast in-person tipping without requiring the sender to search for a profile manually. |
| **Stripe Connect Onboarding** | Performers complete a Stripe Express onboarding flow to verify their identity and connect their bank account. The `stripeAccountId` is stored on the user record and required before any withdrawal can be processed. |
| **Standard Payout (Free)** | The default withdrawal mode. The full requested amount is transferred to the performer's Stripe Connected Account and paid out on Stripe's standard 1–2 business day schedule. No platform fee is deducted. |
| **Instant Payout (3% fee)** | An accelerated payout mode where the performer's funds arrive within minutes to their connected bank or debit card. A 3% platform fee is deducted from the requested amount before payout. The deducted fee is recorded as platform revenue. |
| **Email OTP Authentication** | User registration and password reset are verified with a 6-digit OTP sent to the user's email address. OTPs are generated server-side, stored in Redis with a TTL, and delivered via a BullMQ email queue backed by Nodemailer. No SMS provider is required. |
| **In-App Wallet** | Every user has a wallet record that tracks their `availableBalance` (funds ready to withdraw), `pendingBalance` (tips in processing), and `totalEarned` (all-time earnings). Balance updates happen atomically using Prisma transactions. |
| **Real-time Notifications** | Tip events, payout status changes, and support ticket updates are delivered in real time via Socket.IO for web/admin clients and via Firebase Cloud Messaging (FCM) for mobile clients. Each notification is also persisted in the database so users can review their notification history. |
| **Support Ticket System** | A full ticket lifecycle system where users (or guests) can submit support requests with file attachments. Tickets can be assigned to admins, progressed through statuses (`OPEN` → `IN_PROGRESS` → `RESOLVED`), prioritized, and rated by the user after resolution using a CSAT score (1–5). |
| **Admin Dashboard** | A dedicated analytics layer providing overview cards, revenue time-series charts, user/tip growth charts, and period-over-period comparisons — all accessible through a single endpoint or individual granular endpoints for lazy loading. |
| **BullMQ Job Queue** | All outbound emails are processed asynchronously through a BullMQ queue backed by Redis. Jobs are retried up to 3 times with exponential backoff on failure, ensuring reliable email delivery even under transient SMTP errors. |

---

## Tech Stack

### Runtime and Framework

| Layer | Technology |
|---|---|
| Runtime | Node.js 22.x |
| Language | TypeScript 5.9 |
| Framework | Express.js 5.x |
| ORM | Prisma 6.19 |
| Database | MongoDB (Atlas) |

### Infrastructure and Services

| Service | Purpose |
|---|---|
| **Stripe** | Payment processing via PaymentIntents, Stripe Connect for performer onboarding, Transfer API for wallet distribution, and Payout API for standard and instant withdrawals |
| **Redis + BullMQ** | Persistent job queue for outbound email delivery with retry logic; also used as the OTP and reset-token store with TTL-based expiry |
| **Socket.IO** | Real-time bidirectional event delivery to connected clients for tips, payouts, and support updates |
| **Firebase Admin SDK (FCM)** | Server-side push notifications to iOS and Android devices using FCM tokens stored per user |
| **Nodemailer** | Transactional email delivery via SMTP (Gmail App Password or any SMTP provider) |
| **AWS S3** | Object storage for user profile photos and support ticket file attachments |

### Security

| Feature | Implementation |
|---|---|
| Authentication | HTTP-only, Secure, SameSite=Lax cookies carrying signed JWT access and refresh tokens — inaccessible to JavaScript, preventing XSS-based token theft |
| OTP | 6-digit numeric code generated server-side, stored in Redis under a namespaced key with a short TTL (5–10 minutes), and deleted immediately after successful verification |
| Rate Limiting | `express-rate-limit` enforces a maximum of 30 requests per minute per IP address; violations return HTTP 429 with a clear error message |
| Security Headers | `helmet` sets strict Content Security Policy, X-Frame-Options, X-Content-Type-Options, and other protective headers on every response |
| CORS | Requests are accepted only from allowlisted origins defined at startup; credentials (cookies) are included only on those origins |
| Password Hashing | All passwords are hashed using `bcrypt` with a salt factor of 12 before being written to the database. Plaintext passwords are never stored or logged. |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Client Apps                         │
│          (Mobile App / Admin Dashboard)                  │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTPS / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                   Express.js Server                      │
│    Rate Limit → Helmet → CORS → Cookie Parser → Routes  │
└──┬───────────────────┬────────────────┬─────────────────┘
   │                   │                │
   ▼                   ▼                ▼
┌──────────┐    ┌─────────────┐   ┌──────────────┐
│  Prisma  │    │  BullMQ     │   │  Socket.IO   │
│ (MongoDB)│    │  (Redis)    │   │  (Real-time) │
└──────────┘    └──────┬──────┘   └──────────────┘
                       │
                ┌──────▼──────┐
                │Email Worker │
                │(Nodemailer) │
                └─────────────┘

┌────────────────────────────────────────────────────────┐
│               Stripe Connect Platform                   │
│   Payment Intent → Transfer → Payout (instant/std)    │
└────────────────────────────────────────────────────────┘
```

---

## Module Breakdown

```
src/
├── app/
│   ├── modules/
│   │   ├── Auth/            # Registration, email OTP verification, login,
│   │   │                    # refresh token, forgot/reset/change password
│   │   ├── User/            # User profile management, Stripe Connect
│   │   │                    # onboarding, admin CRUD and status management
│   │   ├── Tips/            # Send single or split tips via Stripe,
│   │   │                    # tip history, admin tip management
│   │   ├── Withdraw/        # Withdrawal requests (standard/instant),
│   │   │                    # fee calculation, Stripe payout execution
│   │   ├── PaymentMethod/   # Save Stripe cards, Apple/Google Pay,
│   │   │                    # set default, remove payment methods
│   │   ├── Notification/    # In-app notification CRUD,
│   │   │                    # unread count, mark as read
│   │   ├── Support/         # Full support ticket lifecycle —
│   │   │                    # create, message, assign, status, CSAT rating
│   │   ├── Overview/        # Admin dashboard — overview, cards,
│   │   │                    # revenue/growth charts, recent users
│   │   └── PlatformRevenue/ # Platform fee revenue records and summary
│   ├── middlewares/
│   │   ├── auth.ts          # JWT cookie extraction, verification, role guard
│   │   ├── fileUploader.ts  # Multer multipart parser + AWS S3 upload helper
│   │   ├── validateRequest.ts # Zod schema validation on req.body/params/query
│   │   └── globalErrorHandler.ts # Centralized error response formatter
│   └── routes/              # Aggregates all module routers under /api/v1
├── services/
│   └── Email/
│       ├── email.queue.ts   # BullMQ Queue definition with retry config
│       └── email.worker.ts  # BullMQ Worker — processes queued email jobs
├── helpers/
│   ├── jwtHelpers.ts        # generateToken / verifyToken wrappers
│   ├── emailSender.ts       # Nodemailer transporter singleton
│   ├── socket.ts            # Socket.IO server initialization
│   ├── stripe.ts            # Stripe SDK client singleton
│   └── queryBuilder.ts      # Fluent query builder for paginated Prisma queries
├── shared/
│   ├── prisma.ts            # Prisma Client singleton
│   ├── redis.ts             # ioredis client for OTP/token storage
│   └── bullmqRedis.ts       # Separate ioredis connection for BullMQ
├── config/
│   └── env.config.ts        # Typed environment variable loader with validation
└── webhook/
    └── stripe.webhook.ts    # Raw-body Stripe webhook handler for payment events
```

---

## Tip Flow

When a sender submits a tip, the server executes the following steps atomically:

```
Sender ──► POST /tips/send
              │
              ├─ 1. Validate receiverIds array (no duplicates, min 1 receiver)
              ├─ 2. Validate totalAmount (min $1.00)
              ├─ 3. Fetch sender's default payment method (card/wallet)
              ├─ 4. Create a Stripe PaymentIntent for the full totalAmount
              ├─ 5. Confirm the PaymentIntent against the payment method
              ├─ 6. On success:
              │      - Deduct totalAmount from sender's wallet pendingBalance
              │      - Distribute equal shares to each receiver's availableBalance
              │      - Create Tip record with status COMPLETED
              │      - Create TipRecipient records (one per receiver)
              │      - Create Transaction record with Stripe PaymentIntent ID
              ├─ 7. Trigger FCM push notification to each receiver
              └─ 8. Return tip details + transaction summary

On Stripe failure:
  - Tip status set to FAILED
  - Transaction record saved with failureReason from Stripe error
  - If a card is flagged as permanently declined, it is disabled (isActive: false)
  - FCM notification sent to sender with the failure reason
```

**Split tip example:**
```
totalAmount = $30   |   receivers = [A, B, C]
Each receiver credited: $10.00
Sender charged: $30.00 via one Stripe PaymentIntent
```

---

## Withdrawal Flow and Fee Structure

Before a withdrawal can be processed, the performer must have completed Stripe Connect onboarding and have a verified `stripeAccountId`. The system supports two withdrawal types:

```
Performer ──► POST /withdraw
                │
                ├─ STANDARD (FREE)
                │    1. Deduct amount from availableBalance
                │    2. Stripe Transfer → performer's Connected Account
                │    3. Stripe schedules payout on the account's default schedule
                │    Platform fee: $0.00
                │    Speed: 1–2 business days
                │
                └─ INSTANT (3% platform fee)
                     1. Calculate fee: platformFee = amount × 0.03
                     2. Calculate net: netAmount = amount - platformFee
                     3. Deduct full amount from availableBalance
                     4. Transfer netAmount to performer's Connected Account
                     5. Trigger Stripe Instant Payout to bank/debit card
                     6. Record platformFee as PlatformRevenue
                     Speed: within minutes
```

| Payout Type | Platform Fee | Speed |
|---|---|---|
| **Standard** | Free — 0% | 1–2 business days |
| **Instant** | 3% of requested amount | Within minutes |

> Minimum withdrawal amount: **$1.00**

---

## Authentication Flow

Tipora uses **email-based OTP** for all identity verification. There is no dependency on SMS or Twilio for the authentication flows.

```
Registration
────────────
POST /auth/register
  → Checks for existing verified account with same email or phone
  → Creates or updates an unverified user record
  → Hashes password with bcrypt (12 rounds)
  → Generates a 6-digit OTP, stores it in Redis with a 5-minute TTL
  → Queues an OTP email via BullMQ (delivered by Nodemailer)
  → Returns the created user object (unverified)

POST /auth/verify-otp
  → Reads OTP from Redis, compares with submitted value
  → Marks the user's email as verified
  → Creates a Wallet record for the user if one does not exist
  → Deletes the OTP from Redis
  → Issues accessToken + refreshToken as HTTP-only Secure cookies
  → Returns user object + tokens

Login
─────
POST /auth/login
  → Looks up user by phone number
  → Rejects if not found, not verified, or account is BLOCKED
  → Compares submitted password against bcrypt hash
  → Updates lastLoginAt timestamp
  → Updates FCM token if provided
  → Issues accessToken + refreshToken as HTTP-only cookies

Password Reset
──────────────
POST /auth/forgot-password
  → Looks up user by email (generic success message if not found — prevents enumeration)
  → Generates OTP, stores in Redis with 10-minute TTL
  → Queues a password reset OTP email

POST /auth/verify-reset-otp
  → Validates OTP against Redis
  → Deletes OTP from Redis
  → Issues a short-lived, single-use resetToken (JWT, 15 min)
  → Stores a SHA-256 hash of the token in Redis for single-use enforcement

POST /auth/reset-password
  → Verifies resetToken signature and purpose claim
  → Checks the token hash in Redis (fails if already used or expired)
  → Hashes and stores the new password
  → Deletes the token hash from Redis (single-use enforcement)
```

### Token Reference

| Token | Storage | Expiry | Notes |
|---|---|---|---|
| `accessToken` | HTTP-only cookie | 7 days | Configurable via `EXPIRES_IN` |
| `refreshToken` | HTTP-only cookie | 30 days | Configurable via `REFRESH_TOKEN_EXPIRES_IN` |
| `resetToken` | Response body (JWT) | 15 min | Single-use; SHA-256 hash tracked in Redis |
| OTP | Redis | 5 min (register) / 10 min (reset) | Deleted immediately after first use |

---

## Getting Started

### Prerequisites

- Node.js version 22 or higher
- MongoDB Atlas cluster or a locally running MongoDB replica set
- Redis instance (local, Docker, or a managed service such as Upstash)
- Stripe account with Connect enabled and webhook endpoint configured

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/shouravpaul01/tipora-backend-api.git
cd tipora-backend-api

npm install

# 3. Copy the environment file
cp .env.example .env

# 4. Push schema
npm run prisma-push

# 5. Start dev server
npm run dev
```

The server starts at `http://localhost:5000`.

Stripe webhooks require the server to be reachable from the internet. During development, use the Stripe CLI to forward webhook events:

```bash
stripe listen --forward-to http://localhost:5000/webhook
```

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server with hot reload using `ts-node-dev` |
| `npm run build` | Compile TypeScript source to JavaScript in the `dist/` directory |
| `npm start` | Run the compiled production build from `dist/server.js` |
| `npm run prisma-push` | Generate the Prisma client and push schema changes to the database |
| `npm run generate` | Scaffold a new module with boilerplate controller, service, routes, and validation files |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before starting the server.

```bash
NODE_ENV=development          # Use "production" in deployed environments
PORT=5000
FRONTEND_URL=http://localhost:3000
BACKEND_IMAGE_URL=http://localhost:5000

ADMIN_EMAIL=admin@tipora.app
ADMIN_PHONENUMBER=+8801700000000
ADMIN_PASSWORD=supersecurepassword

DATABASE_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/tipora

REDIS_URL=redis://localhost:6379

JWT_SECRET=your-jwt-secret-here
EXPIRES_IN=7d

REFRESH_TOKEN_SECRET=your-refresh-token-secret-here
REFRESH_TOKEN_EXPIRES_IN=30d

RESET_PASS_TOKEN=your-reset-pass-token-secret-here
RESET_PASS_TOKEN_EXPIRES_IN=15m
RESET_PASS_LINK=http://localhost:3000/reset-password

EMAIL=noreply@tipora.app
APP_PASS=your-gmail-app-password

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

AWS_S3_REGION=us-east-1
AWS_S3_ENDPOINT=https://s3.amazonaws.com
AWS_S3_ACCESS_KEY=AKIA...
AWS_S3_SECRET_KEY=your-s3-secret-key
AWS_S3_BUCKET=tipora-uploads

FIREBASE_PROJECT_ID=tipora-app
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@tipora-app.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## API Endpoints

**Base URL:** `http://localhost:5000/api/v1`

> `[Public]` — No authentication required
> `[Auth]` — Requires a valid `accessToken` (cookie or Authorization: Bearer header)
> `[Admin]` — Requires ADMIN role
> `[User]` — Requires USER role

---


### Auth — `/auth`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/register` | Public | Create a new user account. Sends a 6-digit OTP to the provided email. Requires `firstName`, `lastName`, `email`, `phone`, and `password`. |
| `POST` | `/verify-otp` | Public | Verify the email OTP. On success, the account is activated, a wallet is created, and auth cookies are set. |
| `POST` | `/login` | Public | Authenticate using `phone` and `password`. Returns auth cookies on success. |
| `POST` | `/refresh-token` | Public | Exchange a valid `refreshToken` for a new `accessToken`. Accepts the token from cookie or request body. |
| `POST` | `/forgot-password` | Public | Send a password reset OTP to the registered email. Always returns a generic success message to prevent user enumeration. |
| `POST` | `/verify-reset-otp` | Public | Validate the reset OTP and receive a short-lived, single-use `resetToken` in the response. |
| `POST` | `/reset-password` | Public | Set a new password using the `resetToken`. The token is invalidated immediately after use. |
| `PATCH` | `/change-password` | Auth | Change the password for the authenticated user. Requires the `currentPassword` for verification. |
| `POST` | `/logout` | Auth | Clear the `accessToken` and `refreshToken` cookies from the client. |

---

### Users — `/users`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/me` | Auth | Return the full profile of the currently authenticated user, including their default payment method and wallet balance. |
| `PATCH` | `/me` | Auth | Update profile fields (`firstName`, `lastName`, `email`, `phone`) and optionally upload a new profile photo. Accepts `multipart/form-data`. |
| `DELETE` | `/me` | Auth | Soft-delete the authenticated user's account. The record is retained in the database but marked as deleted. |
| `POST` | `/me/onboarding` | Auth | Initiate Stripe Connect Express onboarding. Creates a Stripe account if one does not exist and returns an onboarding URL for the user to complete identity verification and bank details. |
| `PATCH` | `/me/onboarding/status` | Auth | Sync the Stripe Connect verification status from Stripe's API and update `stripeAccountVerified` on the user record. |
| `GET` | `/summary` | Admin | Return aggregated user statistics for the admin dashboard (total users, active users, blocked users, new this week, etc.). |
| `GET` | `/` | Admin | Return a paginated, searchable list of all users. Supports `page`, `limit`, and `search` query parameters. |
| `GET` | `/details/:id` | Auth | Return detailed information about a specific user. Accessible by the user themselves or any admin. |
| `GET` | `/:id` | Admin | Return a specific user record by ID. Admin-only shorthand without the `/details` prefix. |
| `PATCH` | `/:id/status` | Admin | Update a user's account status. Accepted values: `ACTIVE`, `BLOCKED`. |

---

### Tips — `/tips`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/send` | Auth | Send a tip to one or more receivers. The `totalAmount` is charged to the sender's default payment method via Stripe. Each receiver's wallet is credited their proportional share. |
| `GET` | `/my-tips` | Auth | Return a paginated list of tips where the authenticated user is either the sender or one of the recipients. |
| `GET` | `/summary` | Admin | Return aggregated tip statistics broken down by today, this week, this month, this year, and all time. |
| `GET` | `/` | Admin | Return a paginated list of all tips across the platform. Supports optional `fromDate` and `toDate` query parameters for date-range filtering. |
| `GET` | `/:id` | Admin | Return full details of a single tip including the sender, all recipients, and the associated Stripe transaction record. |

**Send Tip Request Body:**
```json
{
  "receiverIds": ["user-id-1", "user-id-2"],
  "totalAmount": 30.00,
  "message": "Great performance!",
  "walletToken": null
}
```

---

### Withdraw — `/withdraw`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/` | User | Submit a withdrawal request. Requires the user to be Stripe Connect onboarded. Specify `amount` and optionally `type` (`STANDARD` or `INSTANT`). Defaults to `STANDARD` if not provided. |
| `GET` | `/history` | User | Return a paginated history of the authenticated user's withdrawal requests, including status and any associated fees. |
| `GET` | `/summary` | Admin | Return aggregated withdrawal statistics for the admin dashboard. |
| `GET` | `/` | Admin | Return a paginated list of all withdrawal requests across the platform. |
| `GET` | `/:id` | Admin | Return the full details of a single withdrawal request including the Stripe payout ID and fee breakdown. |

**Request Withdraw Body:**
```json
{
  "amount": 50.00,
  "type": "STANDARD"
}
```
> `type` options: `"STANDARD"` (free, 1–2 business days) | `"INSTANT"` (3% fee, within minutes)

---

### Payment Methods — `/payment-method`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/stripe-key` | Auth | Return the Stripe publishable key so the client can initialize the Stripe.js SDK for card tokenization. |
| `POST` | `/setup-intent` | Auth | Create a Stripe SetupIntent for saving a card without an immediate charge. The client uses the returned `clientSecret` to collect card details securely via Stripe Elements. |
| `POST` | `/add-card` | Auth | Attach a Stripe card to the user's account using the `stripePaymentMethodId` returned after completing the SetupIntent on the client. |
| `POST` | `/add-wallet` | Auth | Register a digital wallet (Apple Pay or Google Pay) as a payment method. Accepts `type: "APPLE_PAY"` or `"GOOGLE_PAY"`. |
| `GET` | `/` | Auth | Return all saved payment methods for the authenticated user. |
| `PATCH` | `/:id/set-default` | Auth | Set the specified payment method as the user's default. The default method is used automatically when sending tips. |
| `DELETE` | `/:id` | Auth | Remove a saved payment method from the user's account. The method is detached from the Stripe Customer and deleted locally. |

---

### Notifications — `/notifications`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/` | Auth | Return a paginated list of the authenticated user's notifications, ordered by most recent first. |
| `GET` | `/unread-count` | Auth | Return the count of unread notifications for the authenticated user. Used to display a badge in the UI. |
| `PATCH` | `/mark-all-read` | Auth | Mark all of the authenticated user's notifications as read in a single operation. |
| `PATCH` | `/:id/read` | Auth | Mark a single notification as read by its ID. |
| `DELETE` | `/` | Auth | Permanently delete all notifications belonging to the authenticated user. |
| `DELETE` | `/:id` | Auth | Permanently delete a single notification by its ID. |

---

### Support Tickets — `/support`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/` | Public / Auth | Create a new support ticket. Authenticated users have their profile linked automatically. Guest users must provide `guestName` and `guestEmail` or `guestPhone`. Supports file attachments via `multipart/form-data`. |
| `GET` | `/my-tickets` | Auth | Return a paginated list of support tickets raised by the authenticated user. |
| `GET` | `/:ticketId` | Auth | Return the full detail of a single ticket including the complete message thread. Access is enforced — users can only view their own tickets; admins can view all. |
| `POST` | `/:ticketId/messages` | Auth | Add a reply or message to an existing ticket thread. Admins may set `isInternalNote: true` to post a note visible only to other admins. Supports file attachments. |
| `PATCH` | `/:ticketId/reopen` | User | Reopen a ticket that has been resolved or closed, allowing further communication. |
| `POST` | `/:ticketId/rate` | User | Submit a CSAT rating (1–5) and optional comment after a ticket has been resolved. Can only be submitted once per ticket. |
| `GET` | `/` | Admin | Return a paginated list of all tickets across the platform. Supports filtering by `status`, `priority`, and `category`. |
| `PATCH` | `/:ticketId/assign` | Admin | Assign the ticket to an admin or support agent by providing their `assignedToId`. |
| `PATCH` | `/:ticketId/status` | Admin | Update the ticket's lifecycle status. Accepted values: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`. |
| `PATCH` | `/:ticketId/priority` | Admin | Update the ticket's priority level. Accepted values: `LOW`, `MEDIUM`, `HIGH`, `URGENT`. |

**Enumerated values:**
- Ticket Status: `OPEN` | `IN_PROGRESS` | `RESOLVED` | `CLOSED`
- Ticket Priority: `LOW` | `MEDIUM` | `HIGH` | `URGENT`
- Ticket Category: `PAYMENT` | `ACCOUNT` | `TECHNICAL` | `GENERAL`

---

### Dashboard — `/dashboard`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/overview` | Admin | Return all dashboard data in a single response. Designed for the initial page load to minimize round trips. |
| `GET` | `/cards` | Admin | Return the key metric cards: total users, total tips sent, total platform revenue, active users, etc. |
| `GET` | `/revenue-charts` | Admin | Return time-series revenue data suitable for line or bar charts, broken down by configurable intervals. |
| `GET` | `/growth-charts` | Admin | Return user registration and tip volume growth data over time. |
| `GET` | `/comparison` | Admin | Return period-over-period comparison metrics (e.g., this month vs. last month) for key indicators. |
| `GET` | `/recent-users?limit=10` | Admin | Return the most recently registered users. Accepts a `limit` query parameter (default 10). |

---

### Platform Revenue — `/platform-revenue`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/summary` | Admin | Return the total platform revenue earned from instant withdrawal fees, broken down by period. |
| `GET` | `/` | Admin | Return a paginated list of all platform revenue records. Each record corresponds to a fee collected on an instant withdrawal. |
| `GET` | `/:id` | Admin | Return the full detail of a single platform revenue record, including the linked withdrawal and tip. |

---

## Postman Collection

A complete Postman collection is included at `Tipora_API.postman_collection.json` in the project root. It covers all 40+ endpoints across all modules.

**Collection features:**
- All request bodies pre-filled with realistic example data
- Auto token capture: after a successful Login or Verify OTP call, the `accessToken` and `refreshToken` are automatically saved as collection variables and applied to all subsequent protected requests
- Auto ID capture: after creating a tip, ticket, withdrawal, or payment method, the returned ID is saved as a collection variable for use in follow-up requests
- Inline Postman test assertions on key endpoints to validate response structure and status codes

**How to import and use:**

1. Open Postman and click **Import**, then select `Tipora_API.postman_collection.json`
2. In the collection's **Variables** tab, set `baseUrl` to `http://localhost:5000/api/v1`
3. Run the **Register** request followed by **Verify OTP**, or run the **Login** request — your tokens will be captured and stored automatically
4. All protected requests will use the captured token without any manual configuration

---

## Database Schema

The database is MongoDB, accessed through Prisma ORM with a strongly typed client generated from `prisma/schema.prisma`.

| Model | Key Fields | Notes |
|---|---|---|
| `User` | id, firstName, lastName, email, phone, photo, role, status, stripeCustomerId, stripeAccountId, stripeAccountVerified | Central entity. `stripeAccountId` required before withdrawals. |
| `UserAuth` | id, userId, password, passwordChangedAt, lastLoginAt | Separated from User to keep auth credentials isolated. Password is always bcrypt-hashed. |
| `Wallet` | id, userId, availableBalance, pendingBalance, totalEarned | Created automatically after OTP verification. Updated atomically on each tip and withdrawal. |
| `PaymentMethod` | id, userId, type, stripePaymentMethodId, brand, last4, expMonth, expYear, isDefault, isActive | Supports CARD, APPLE_PAY, GOOGLE_PAY. Automatically disabled on permanent Stripe decline codes. |
| `Tip` | id, senderId, totalAmount, status, message | Status values: PENDING, COMPLETED, FAILED. |
| `TipRecipient` | id, tipId, receiverId, amount, status | One record per receiver. Enables N-way splits. |
| `Transaction` | id, tipId, stripePaymentIntentId, amount, currency, status, failureReason | Full Stripe transaction record linked to each tip attempt. |
| `WithdrawTransection` | id, userId, amount, type, platformFee, netAmount, status, stripePayoutId | Records each withdrawal. Fee is $0 for STANDARD, 3% for INSTANT. |
| `Notification` | id, userId, title, body, type, isRead, data | Persisted for notification history. Also delivered via Socket.IO and FCM in real time. |
| `Support` | id, raisedById, assignedToId, subject, description, category, status, priority, rating, ratingComment | Full ticket record. `rating` set on CSAT submission. |
| `TicketMessage` | id, ticketId, senderId, message, isInternalNote, attachments | Message thread entries. Internal notes are hidden from end users. |
| `PlatformRevenue` | id, withdrawId, amount | One record per instant withdrawal fee collected. |

---

## Author

**Shourav Paul**
Full Stack Developer
[GitHub](https://github.com/shouravpaul01)

---

*Built with Node.js, TypeScript, Stripe Connect, MongoDB, Redis, BullMQ, and Socket.IO*

