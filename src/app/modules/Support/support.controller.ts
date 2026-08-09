// support.controller.ts

import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { SupportTicketServices } from "./support.service";

// ── create ticket (logged-in user OR guest) ────────────────
const createTicket = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.createTicket(req.user,  req.files as Express.Multer.File[], req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Support ticket created successfully.",
    data: result,
  });
});

// ── my tickets (logged-in user) ────────────────────────────
const getMyTickets = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.getMyTickets(
    req.user!.id,
    req.query,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My support tickets retrieved successfully.",
    meta: result.meta,
    data: result.data,
  });
});

// ── all tickets (admin inbox) ──────────────────────────────
const getAllTickets = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.getAllTickets(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Support tickets retrieved successfully.",
    meta: result.meta,
    data: result.data,
  });
});

// ── single ticket detail (owner or admin) ──────────────────
const getTicketById = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.getTicketById(
    req.params.ticketId as string,
    { userId: req.user!.id, role: req.user!.role },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Support ticket retrieved successfully.",
    data: result,
  });
});

// ── assign ticket to an agent (admin) ──────────────────────
const assignTicket = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.assignTicket(
    req.params.ticketId as string,
    req.body.assignedToId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Support ticket assigned successfully.",
    data: result,
  });
});

// ── add message / reply ────────────────────────────────────
const addMessage = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.addMessage({
    ticketId: req.params.ticketId as string,
    senderId: req.user!.id,
    message: req.body.message,
    files: req.files as Express.Multer.File[],
    isInternalNote: req.body.isInternalNote,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Message sent successfully.",
    data: result,
  });
});

// ── update status (admin) ──────────────────────────────────
const updateStatus = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.updateStatus(
    req.params.ticketId as string,
    req.body.status,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Ticket status updated successfully.",
    data: result,
  });
});
const updateTicketPriority = catchAsync(async (req, res) => {
  const { ticketId } = req.params;
  const { priority } = req.body;

  const result = await SupportTicketServices.updateTicketPriority(
    ticketId as string,
    priority,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Ticket priority updated successfully",
    data: result,
  });
});
// ── reopen ticket (raiser) ─────────────────────────────────
const reopenTicket = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.reopenTicket(
    req.params.ticketId as string,
    req.user!.id,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Ticket reopened successfully.",
    data: result,
  });
});

// ── rate ticket / CSAT (raiser) ────────────────────────────
const rateTicket = catchAsync(async (req, res) => {
  const result = await SupportTicketServices.rateTicket(
    req.params.ticketId as string,
    req.user!.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Thanks for your feedback!",
    data: result,
  });
});

export const SupportTicketControllers = {
  createTicket,
  getMyTickets,
  getAllTickets,
  getTicketById,
  assignTicket,
  addMessage,
  updateStatus,
  updateTicketPriority,
  reopenTicket,
  rateTicket,
};
