import express from "express";
import { UserRole } from "@prisma/client";

import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { fileUploader } from "../../middlewares/fileUploader";
import { parseBodyData } from "../../middlewares/parseBodyData";

import { SupportTicketControllers } from "./support.controller";
import { SupportTicketValidations } from "./support.validation";

const router = express.Router();

/**
 * ============================================================
 * Public / Guest Routes
 * ============================================================
 */

// Create a new support ticket
// Supports both authenticated users and guests.
router.post(
  "/",
  auth({ optional: true }),
  fileUploader.array("attachments", { required: false }),
  parseBodyData,
  validateRequest(SupportTicketValidations.createTicket),
  SupportTicketControllers.createTicket,
);

/**
 * ============================================================
 * User Routes
 * ============================================================
 */

// Get logged-in user's tickets
router.get(
  "/my-tickets",
  auth(UserRole.USER, UserRole.ADMIN),
  SupportTicketControllers.getMyTickets,
);

// Reopen a resolved/closed ticket
router.patch(
  "/:ticketId/reopen",
  auth(UserRole.USER),
  SupportTicketControllers.reopenTicket,
);

// Rate a resolved ticket
router.post(
  "/:ticketId/rate",
  auth(UserRole.USER),
  validateRequest(SupportTicketValidations.rateTicket),
  SupportTicketControllers.rateTicket,
);

/**
 * ============================================================
 * Admin Routes
 * ============================================================
 */

// Get all support tickets
router.get(
  "/",
  auth(UserRole.ADMIN),
  SupportTicketControllers.getAllTickets,
);

// Assign ticket to an admin/agent
router.patch(
  "/:ticketId/assign",
  auth(UserRole.ADMIN),
  validateRequest(SupportTicketValidations.assignTicket),
  SupportTicketControllers.assignTicket,
);

// Update ticket status
router.patch(
  "/:ticketId/status",
  auth(UserRole.ADMIN),
  validateRequest(SupportTicketValidations.updateStatus),
  SupportTicketControllers.updateStatus,
);

/**
 * ============================================================
 * Shared Ticket Routes
 * ============================================================
 */

// Add a message / reply
// Admin can also create an internal note depending on validation.
router.post(
  "/:ticketId/messages",
  auth(UserRole.USER, UserRole.ADMIN),
  fileUploader.array("attachments", { required: false }),
  parseBodyData,
  validateRequest(SupportTicketValidations.addMessage),
  SupportTicketControllers.addMessage,
);

// Get single ticket details
// Access control should be handled inside the service/controller
// so users can only access their own tickets.
router.get(
  "/:ticketId",
  auth(UserRole.USER, UserRole.ADMIN),
  SupportTicketControllers.getTicketById,
);

export const SupportTicketRoutes = router;