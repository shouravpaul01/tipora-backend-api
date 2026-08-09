// support.validation.ts

import { z } from "zod";
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";

// ═══════════════════════════════════════════════
// CREATE TICKET
// ═══════════════════════════════════════════════
const createTicket = z.object({
  body: z
    .object({
      guestName: z.string().optional(),
      guestEmail: z.email().optional(),
      guestPhone: z.string().optional(),

      subject: z
        .string()
        .min(3, { error: "Subject must be at least 3 characters" })
        .max(200, { error: "Subject must be under 200 characters" }),

      description: z
        .string()
        .min(10, { error: "Description must be at least 10 characters" }),

      category: z.enum(TicketCategory).optional(),
      priority: z.enum(TicketPriority).optional(),

      relatedTipId: z.string().optional(),
      relatedWithdrawId: z.string().optional(),
      relatedTransactionId: z.string().optional(),

      attachments: z.array(z.string()).optional(),
    })
    // .superRefine((data, ctx) => {
    //   // guest endpoint-এর জন্য validation
    //   if (!data.guestName?.trim()) {
    //     ctx.addIssue({
    //       code: "custom",
    //       path: ["guestName"],
    //       message: "Guest name is required.",
    //     });
    //   }

    //   if (!data.guestEmail && !data.guestPhone) {
    //     ctx.addIssue({
    //       code: "custom",
    //       path: ["guestEmail"],
    //       message: "Guest email or phone is required.",
    //     });
    //   }
    // }),
});

// ═══════════════════════════════════════════════
// ADD MESSAGE / REPLY
// ═══════════════════════════════════════════════
const addMessage = z.object({
  body: z.object({
    message: z
      .string()
      .min(1, { error: "Message cannot be empty" }),

    attachments: z.array(z.string()).optional(),

    isInternalNote: z.boolean().optional(),
  }),
});

// ═══════════════════════════════════════════════
// ASSIGN TICKET (ADMIN)
// ═══════════════════════════════════════════════
const assignTicket = z.object({
  body: z.object({
    assignedToId: z
      .string()
      .min(1, { error: "assignedToId is required" }),
  }),
});

// ═══════════════════════════════════════════════
// UPDATE STATUS (ADMIN)
// ═══════════════════════════════════════════════
const updateStatus = z.object({
  body: z.object({
    status: z.enum(TicketStatus),
  }),
});

// ═══════════════════════════════════════════════
// RATE TICKET (CSAT)
// ═══════════════════════════════════════════════
const rateTicket = z.object({
  body: z.object({
    rating: z
      .number()
      .int()
      .min(1, { error: "Rating must be between 1 and 5" })
      .max(5, { error: "Rating must be between 1 and 5" }),

    ratingComment: z
      .string()
      .max(1000, { error: "Comment cannot exceed 1000 characters" })
      .optional(),
  }),
});
const updatePriority = z.object({
  body: z.object({
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  }),
});
export const SupportTicketValidations = {
  createTicket,
  addMessage,
  assignTicket,
  updateStatus,
  rateTicket,
  updatePriority
};