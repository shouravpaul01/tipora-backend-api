// support.interface.ts

import { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";

// ── create ticket (by logged-in user OR guest) ─────────────
export type CreateSupportTicketPayload = {
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;

  subject: string;
  description: string;

  category?: TicketCategory;
  priority?: TicketPriority;

  relatedTipId?: string;
  relatedWithdrawId?: string;
  relatedTransactionId?: string;

  attachments?: string[];
};

// ── add a reply / internal note to a ticket ────────────────
export type AddTicketMessagePayload = {
  ticketId: string;
  senderId: string;
  message: string;
  files?: Express.Multer.File[];
  isInternalNote?: boolean;
};

// ── update ticket status (admin) ───────────────────────────
export type UpdateTicketStatusPayload = {
  status: TicketStatus;
};

// ── CSAT rating given by the ticket raiser ─────────────────
export type RateTicketPayload = {
  rating: number; // 1-5
  ratingComment?: string;
};

// ── used for access-control checks in the service layer ───
export type TicketRequester = {
  userId: string;
  role: "USER" | "ADMIN";
};