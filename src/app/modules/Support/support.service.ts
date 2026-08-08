// support.service.ts

import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../../helpers/queryBuilder";
import {
  TicketCategory,
  TicketCreatorType,
  TicketPriority,
  TicketStatus,
  UserRole,
} from "@prisma/client";
import { NotificationServices } from "../Notification/notification.service";
import {
  AddTicketMessagePayload,
  CreateSupportTicketPayload,
  RateTicketPayload,
  TicketRequester,
} from "./supoort.intarface";
import { JwtPayload } from "jsonwebtoken";
import { uploadFileToS3 } from "../../../helpers/uploadToS3";

// ═════════════════════════════════════════════════════════════════════════════
// HELPER — generate a human-readable ticket number, e.g. "TKT-000123"
// ═════════════════════════════════════════════════════════════════════════════
const generateTicketNumber = async () => {
  const count = await prisma.support.count();
  const next = (count + 1).toString().padStart(6, "0");
  return `TKT-${next}`;
};

// ═════════════════════════════════════════════════════════════════════════════
// CREATE TICKET
// Raised either by a logged-in user (userId set) or a guest (guestEmail set).
// Notifies all admins so it shows up in the support inbox immediately.
// ═════════════════════════════════════════════════════════════════════════════
const createTicket = async (
  user: JwtPayload | undefined,
  files: Express.Multer.File[],
  payload: CreateSupportTicketPayload,
) => {
  const isLoggedIn = !!user;

  if (!isLoggedIn) {
    if (!payload.guestName?.trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Guest name is required.");
    }

    if (!payload.guestEmail) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Email is required.");
    }
  }
  let attachmentUrls: string[] = [];

  if (files?.length) {
    const uploads = await Promise.all(
      files.map((file) => uploadFileToS3(file)),
    );

    attachmentUrls = uploads.map((item) => item.fileUrl);
  }
  const ticketNumber = await generateTicketNumber();

  const ticket = await prisma.support.create({
    data: {
      ticketNumber,

      creatorType: isLoggedIn
        ? TicketCreatorType.USER
        : TicketCreatorType.GUEST,

      userId: isLoggedIn ? user.id : null,

      guestName: !isLoggedIn ? payload.guestName : null,
      guestEmail: !isLoggedIn ? payload.guestEmail : null,
      guestPhone: !isLoggedIn ? payload.guestPhone : null,

      subject: payload.subject,
      description: payload.description,

      category: payload.category ?? TicketCategory.OTHER,
      priority: payload.priority ?? TicketPriority.MEDIUM,

      relatedTipId: payload.relatedTipId,
      relatedWithdrawId: payload.relatedWithdrawId,
      relatedTransactionId: payload.relatedTransactionId,

      attachments: attachmentUrls ?? [],

      lastMessageAt: new Date(),
      lastMessageById: isLoggedIn ? user.id : null,

      unreadByAgent: true,
      unreadByUser: false,
    },
  });

  await NotificationServices.NotifyAdmins({
    title: "New support ticket 🎫",
    body: `Ticket ${ticket.ticketNumber}: ${ticket.subject}`,
    type: "TICKET_CREATED",
    data: {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
    },
  });

  return ticket;
};

// ═════════════════════════════════════════════════════════════════════════════
// GET MY TICKETS (logged-in user's own tickets)
// ═════════════════════════════════════════════════════════════════════════════
const getMyTickets = async (userId: string, query: Record<string, unknown>) => {
  const queryBuilder = new QueryBuilder(prisma.support, query);

  const tickets = await queryBuilder
    .rawFilter({ userId })
    .search(["subject", "description", "ticketNumber"])
    .filter()
    .sort()
    .paginate()
    .execute();

  const meta = await queryBuilder.countTotal();

  return { data: tickets, meta };
};

// ═════════════════════════════════════════════════════════════════════════════
// GET ALL TICKETS (admin inbox — filterable by status/category/priority etc.)
// ═════════════════════════════════════════════════════════════════════════════
const getAllTickets = async (query: Record<string, unknown>) => {
  const finalQuery = {
    ...query,
    sort: query.sort || "-lastMessageAt",
  };

  const queryBuilder = new QueryBuilder(
    prisma.support,
    finalQuery
  );

  const tickets = await queryBuilder
    .search([
      "user.fullName",
      "user.phone",
      "user.email",
      "subject",
      "description",
      "ticketNumber",
      "guestEmail",
    ])
    .filter()
    .sort()
    .include({
      user: {
        select: {
          firstName: true,
          lastName: true,
          fullName: true,
          email: true,
          phone: true,
          photo: true,
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
    })
    .paginate()
    .execute();

  const meta = await queryBuilder.countTotal();

  return {
    data: tickets,
    meta,
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// GET SINGLE TICKET (with threaded messages) + access control
// Internal notes are stripped out for non-admin requesters.
// Also flips the relevant unread flag once the viewer opens it.
// ═════════════════════════════════════════════════════════════════════════════
const getTicketById = async (
  ticketId: string,
  requester: TicketRequester,
) => {
  const ticket = await prisma.support.findUnique({
    where: { id: ticketId },

    include: {
      messages: {
        where:
          requester.role === "ADMIN"
            ? {}
            : { isInternalNote: false },

        orderBy: {
          createdAt: "asc",
        },

        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              photo: true,
              role: true,
            },
          },
        },
      },

      user: {
        select: {
          id: true,
          fullName: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          photo: true,
        },
      },

      assignedTo: {
        select: {
          id: true,
          fullName: true,
          firstName: true,
          lastName: true,
          photo: true,
          role: true,
        },
      },
    },
  });

  if (!ticket) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Support ticket not found.",
    );
  }

  // User can only access their own ticket
  if (
    requester.role !== "ADMIN" &&
    ticket.userId !== requester.userId
  ) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Access denied.",
    );
  }

  // Mark messages as read
  if (requester.role === "ADMIN" && ticket.unreadByAgent) {
    await prisma.support.update({
      where: { id: ticketId },
      data: {
        unreadByAgent: false,
      },
    });
  }

  if (requester.role !== "ADMIN" && ticket.unreadByUser) {
    await prisma.support.update({
      where: { id: ticketId },
      data: {
        unreadByUser: false,
      },
    });
  }

  return ticket;
};

// ═════════════════════════════════════════════════════════════════════════════
// ASSIGN TICKET to an admin/agent
// ═════════════════════════════════════════════════════════════════════════════
const assignTicket = async (ticketId: string, assignedToId: string) => {
  const [ticket, agent] = await Promise.all([
    prisma.support.findUnique({ where: { id: ticketId } }),
    prisma.user.findUnique({ where: { id: assignedToId } }),
  ]);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, "Support ticket not found.");
  }
  if (!agent || agent.role !== "ADMIN") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "assignedToId must belong to an admin/agent.",
    );
  }

  const updated = await prisma.support.update({
    where: { id: ticketId },
    data: {
      assignedToId,
      status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
    },
  });

  await NotificationServices.SendNotification({
    userId: assignedToId,
    title: "Ticket assigned to you 🎫",
    body: `Ticket ${ticket.ticketNumber}: ${ticket.subject}`,
    type: "TICKET_ASSIGNED",
    data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
  });

  return updated;
};

// ═════════════════════════════════════════════════════════════════════════════
// ADD MESSAGE / REPLY (by the raiser or an agent)
// isInternalNote is only honored when the sender is an admin, and never
// updates the user-facing unread flag / lastMessage fields.
// ═════════════════════════════════════════════════════════════════════════════
const addMessage = async (payload: AddTicketMessagePayload) => {
  const { ticketId, senderId, message, files, isInternalNote } = payload;

  const [ticket, sender] = await Promise.all([
    prisma.support.findUnique({
      where: { id: ticketId },
    }),
    prisma.user.findUnique({
      where: { id: senderId },
    }),
  ]);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, "Support ticket not found.");
  }

  if (!sender) {
    throw new ApiError(httpStatus.NOT_FOUND, "Sender not found.");
  }

  const isAgent = sender.role === UserRole.ADMIN;

  // Only ticket owner or admin
  if (!isAgent && ticket.userId !== senderId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  }

  // Internal note only admin
  if (!isAgent && isInternalNote) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only admins can add internal notes.",
    );
  }

  // Closed ticket
  if (ticket.status === TicketStatus.CLOSED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Ticket is closed. Please reopen it first.",
    );
  }

  // Upload attachments
  let attachmentUrls: string[] = [];

  if (files?.length) {
    const uploads = await Promise.all(
      files.map((file) => uploadFileToS3(file)),
    );

    attachmentUrls = uploads.map((item) => item.fileUrl);
  }

  const result = await prisma.$transaction(async (tx) => {
    const ticketMessage = await tx.ticketMessage.create({
      data: {
        ticketId,
        senderId,
        message,
        attachments: attachmentUrls,
        isInternalNote: isAgent ? !!isInternalNote : false,
      },
    });

    const isVisibleReply = !ticketMessage.isInternalNote;

    await tx.support.update({
      where: {
        id: ticketId,
      },
      data: {
        lastMessageAt: isVisibleReply
          ? ticketMessage.createdAt
          : ticket.lastMessageAt,

        lastMessageById: isVisibleReply ? senderId : ticket.lastMessageById,

        unreadByUser: isVisibleReply && isAgent,
        unreadByAgent: isVisibleReply && !isAgent,

        status: isVisibleReply
          ? isAgent
            ? TicketStatus.WAITING_ON_USER
            : TicketStatus.IN_PROGRESS
          : ticket.status,
      },
    });

    return ticketMessage;
  });

  // ==========================
  // Notification
  // ==========================

  if (!result.isInternalNote) {
    if (isAgent) {
      if (ticket.userId) {
        await NotificationServices.SendNotification({
          userId: ticket.userId,
          title: "Support Team Replied",
          body: `Support replied to your ticket (${ticket.ticketNumber}).`,
          type: "TICKET_REPLIED",
          data: {
            resource: "support_ticket",
            resourceId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            action: "OPEN_TICKET",
            route: `/support/${ticket.id}`,
          },
        });
      }
    } else {
      if (ticket.assignedToId) {
        await NotificationServices.SendNotification({
          userId: ticket.assignedToId,
          title: "New Ticket Reply",
          body: `Customer replied to ticket ${ticket.ticketNumber}.`,
          type: "TICKET_REPLIED",
          data: {
            resource: "support_ticket",
            resourceId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            action: "OPEN_TICKET",
            route: `/admin/support/${ticket.id}`,
          },
        });
      } else {
        await NotificationServices.NotifyAdmins({
          title: "New Ticket Reply",
          body: `Customer replied to ticket ${ticket.ticketNumber}.`,
          type: "TICKET_REPLIED",
          data: {
            resource: "support_ticket",
            resourceId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            action: "OPEN_TICKET",
            route: `/admin/support/${ticket.id}`,
          },
        });
      }
    }
  }

  return result;
};

// ═════════════════════════════════════════════════════════════════════════════
// UPDATE STATUS (admin) — sets resolvedAt / closedAt / reopenedAt as needed
// and notifies the raiser.
// ═════════════════════════════════════════════════════════════════════════════
const updateStatus = async (ticketId: string, status: TicketStatus) => {
  const ticket = await prisma.support.findUnique({
    where: { id: ticketId },
  });
  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, "Support ticket not found.");
  }

  const data: Record<string, unknown> = { status };
  if (status === "RESOLVED") data.resolvedAt = new Date();
  if (status === "CLOSED") data.closedAt = new Date();
  if (status === "REOPENED") data.reopenedAt = new Date();

  const updated = await prisma.support.update({
    where: { id: ticketId },
    data,
  });

  const notifTypeMap: Partial<Record<TicketStatus, string>> = {
    RESOLVED: "TICKET_RESOLVED",
    CLOSED: "TICKET_CLOSED",
    REOPENED: "TICKET_REOPENED",
  };
  const notifType: any = notifTypeMap[status];

  if (ticket.userId && notifType) {
    await NotificationServices.SendNotification({
      userId: ticket.userId,
      title: `Ticket ${status.toLowerCase().replace("_", " ")}`,
      body: `Ticket ${ticket.ticketNumber} is now ${status
        .replace("_", " ")
        .toLowerCase()}.`,
      type: notifType,
      data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
    });
  }

  return updated;
};

// ═════════════════════════════════════════════════════════════════════════════
// REOPEN TICKET (by the raiser) — only from RESOLVED / CLOSED
// ═════════════════════════════════════════════════════════════════════════════
const reopenTicket = async (ticketId: string, userId: string) => {
  const ticket = await prisma.support.findUnique({
    where: { id: ticketId },
  });
  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, "Support ticket not found.");
  }
  if (ticket.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  }
  if (!["RESOLVED", "CLOSED"].includes(ticket.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only resolved or closed tickets can be reopened.",
    );
  }

  return updateStatus(ticketId, "REOPENED");
};

// ═════════════════════════════════════════════════════════════════════════════
// RATE TICKET (CSAT) — only the raiser, only after resolution
// ═════════════════════════════════════════════════════════════════════════════
const rateTicket = async (
  ticketId: string,
  userId: string,
  payload: RateTicketPayload,
) => {
  const ticket = await prisma.support.findUnique({
    where: { id: ticketId },
  });
  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, "Support ticket not found.");
  }
  if (ticket.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  }
  if (!["RESOLVED", "CLOSED"].includes(ticket.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You can only rate a resolved or closed ticket.",
    );
  }

  return prisma.support.update({
    where: { id: ticketId },
    data: {
      rating: payload.rating,
      ratingComment: payload.ratingComment,
    },
  });
};

export const SupportTicketServices = {
  createTicket,
  getMyTickets,
  getAllTickets,
  getTicketById,
  assignTicket,
  addMessage,
  updateStatus,
  reopenTicket,
  rateTicket,
};
