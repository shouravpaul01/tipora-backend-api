import httpStatus from "http-status";
import ApiError from "../../../errors/ApiErrors";
import prisma from "../../../shared/prisma";
import { WithdrawStatus } from "@prisma/client";
import stripe from "../../../helpers/stripe";
import { NotificationServices } from "../Notification/notification.service";
import QueryBuilder from "../../../helpers/queryBuilder";


// ── Constants ─────────────────────────────────────────────────────────────────

// Minimum withdrawal amount in USD
const MIN_WITHDRAW_AMOUNT = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────

const getStripeTransferErrorMessage = (error: any): string => {
  return error?.message || "Stripe transfer failed. Please try again.";
};

// ═════════════════════════════════════════════════════════════════════════════
// REQUEST WITHDRAWAL
// Deducts from availableBalance, triggers Stripe Transfer immediately.
// No admin approval required.
// ═════════════════════════════════════════════════════════════════════════════

const requestWithdraw = async (
  userId: string,
  payload: { amount: number },
) => {
  const { amount } = payload;

  if (amount < MIN_WITHDRAW_AMOUNT) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Minimum withdrawal amount is $${MIN_WITHDRAW_AMOUNT}.`,
    );
  }

  // Fetch user with Stripe Connect account details
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false, status: "ACTIVE" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      stripeAccountId: true,
      stripeAccountVerified: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  // Stripe Connect account must be set up and verified before withdrawing
  if (!user.stripeAccountId || !user.stripeAccountVerified) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You must connect and verify your payout account before withdrawing.",
    );
  }

  // Fetch the user's wallet
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
  });

  if (!wallet) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Wallet not found.");
  }

  if (wallet.availableBalance < amount) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient balance. Available: $${wallet.availableBalance.toFixed(2)}.`,
    );
  }

  const currency = wallet.currency || "usd";
  const amountInCents = Math.round(amount * 100);

  // Move funds from available → pending atomically before calling Stripe
  const [withdrawRequest] = await prisma.$transaction([
    prisma.withdrawRequest.create({
      data: {
        userId,
        walletId: wallet.id,
        amount,
        currency,
        status: WithdrawStatus.PROCESSING,
      },
    }),
    prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: { decrement: amount },
        pendingBalance: { increment: amount },
      },
    }),
  ]);

  let stripeTransferId: string | undefined;

  try {
    // Transfer funds from the platform Stripe account to the user's Connect account
    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency,
      destination: user.stripeAccountId,
      description: `Withdrawal for ${user.firstName} ${user.lastName}`,
      metadata: {
        withdrawRequestId: withdrawRequest.id,
        userId,
      },
    });

    stripeTransferId = transfer.id;

    // Mark as completed and move funds out of pending
    const [completedRequest] = await prisma.$transaction([
      prisma.withdrawRequest.update({
        where: { id: withdrawRequest.id },
        data: {
          status: WithdrawStatus.COMPLETED,
          stripeTransferId,
        },
      }),
      prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingBalance: { decrement: amount },
          totalWithdrawn: { increment: amount },
        },
      }),
    ]);

    // Notify user of successful withdrawal
    await NotificationServices.SendNotification({
      userId,
      title: "Withdrawal successful!",
      body: `$${amount.toFixed(2)} has been transferred to your payout account.`,
      type: "WITHDRAW_COMPLETED",
      data: {
        withdrawRequestId: withdrawRequest.id,
        amount: amount.toString(),
      },
    }).catch(console.error);

    return completedRequest;
  } catch (error: any) {
    const failureReason = getStripeTransferErrorMessage(error);

    // Revert pending balance back to available on failure
    await prisma.$transaction([
      prisma.withdrawRequest.update({
        where: { id: withdrawRequest.id },
        data: {
          status: WithdrawStatus.FAILED,
          failureReason,
        },
      }),
      prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingBalance: { decrement: amount },
          availableBalance: { increment: amount },
        },
      }),
    ]);

    // Notify user of failed withdrawal
    await NotificationServices.SendNotification({
      userId,
      title: "Withdrawal failed",
      body: failureReason,
      type: "WITHDRAW_FAILED",
      data: {
        withdrawRequestId: withdrawRequest.id,
        reason: failureReason,
      },
    }).catch(console.error);

    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Withdrawal failed: ${failureReason}`,
    );
  }
};




// ═════════════════════════════════════════════════════════════════════════════
// GET MY WITHDRAW HISTORY
// Returns a paginated, sorted list of the current user's withdraw requests.
// ═════════════════════════════════════════════════════════════════════════════

const getMyWithdrawHistory = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const queryBuilder = new QueryBuilder(prisma.withdrawRequest, query);

  const withdrawals = await queryBuilder
    .rawFilter({ userId })
    .sort()
    .paginate()
    .include({
      wallet: {
        select: {
          id: true,
          availableBalance: true,
          currency: true,
        },
      },
    })
    .execute();

  const meta = await queryBuilder.countTotal();

  return { data: withdrawals, meta };
};

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — GET ALL WITHDRAW REQUESTS
// Returns a paginated, sorted list of all withdraw requests across all users.
// ═════════════════════════════════════════════════════════════════════════════

const getAllWithdrawRequests = async (query: Record<string, unknown>) => {
  const queryBuilder = new QueryBuilder(prisma.withdrawRequest, query);

  const withdrawals = await queryBuilder
    .sort()
    .paginate()
    .include({
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          photo: true,
          stripeAccountId: true,
          stripeAccountVerified: true,
        },
      },
      wallet: {
        select: {
          id: true,
          availableBalance: true,
          totalEarned: true,
          totalWithdrawn: true,
          currency: true,
        },
      },
    })
    .execute();

  const meta = await queryBuilder.countTotal();

  return { data: withdrawals, meta };
};

export const WithdrawServices = {
  requestWithdraw,

  getMyWithdrawHistory,
  getAllWithdrawRequests,
};

