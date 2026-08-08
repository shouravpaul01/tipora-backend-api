// support.route.ts

import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { SupportTicketControllers } from "./support.controller";
import { SupportTicketValidations } from "./support.validation";
import { fileUploader } from "../../middlewares/fileUploader";
import { parseBodyData } from "../../middlewares/parseBodyData";

const router = express.Router();

// ── create ticket — open to guests too (no auth enforced here). ───
// If guest-raised tickets should be disallowed, wrap with auth("USER", "ADMIN").
router.post(
  "/",
  auth({optional:true}),
  fileUploader.array("attachments", { required: false }),
  parseBodyData,
  validateRequest(SupportTicketValidations.createTicket),
  SupportTicketControllers.createTicket,
);

// ── logged-in user's own tickets ───────────────────────────
router.get(
  "/my-tickets",
  auth("USER", "ADMIN"),
  SupportTicketControllers.getMyTickets,
);

// ── admin inbox — all tickets ──────────────────────────────
router.get("/", auth("ADMIN"), SupportTicketControllers.getAllTickets);

// ── single ticket detail (access checked in service layer) ─
router.get(
  "/:ticketId",
  auth("USER", "ADMIN"),
  SupportTicketControllers.getTicketById,
);

// ── assign ticket to an agent ───────────────────────────────
router.patch(
  "/:ticketId/assign",
  auth("ADMIN"),
  validateRequest(SupportTicketValidations.assignTicket),
  SupportTicketControllers.assignTicket,
);

// ── reply / add message (or internal note if admin) ────────
router.post(
  "/:ticketId/messages",
  auth("USER", "ADMIN"),
  fileUploader.array("attachments", { required: false }),
  parseBodyData,
  validateRequest(SupportTicketValidations.addMessage),
  SupportTicketControllers.addMessage,
);

// ── update status (resolve / close / etc.) ──────────────────
router.patch(
  "/:ticketId/status",
  auth("ADMIN"),
  validateRequest(SupportTicketValidations.updateStatus),
  SupportTicketControllers.updateStatus,
);

// ── user reopens a resolved/closed ticket ───────────────────
router.patch(
  "/:ticketId/reopen",
  auth("USER"),
  SupportTicketControllers.reopenTicket,
);

// ── user rates the ticket after resolution (CSAT) ───────────
router.post(
  "/:ticketId/rate",
  auth("USER"),
  validateRequest(SupportTicketValidations.rateTicket),
  SupportTicketControllers.rateTicket,
);

export const SupportTicketRoutes = router;
