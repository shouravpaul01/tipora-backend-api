import httpStatus from "http-status";
import ApiError from "../../../errors/ApiErrors";
import prisma from "../../../shared/prisma";
import { Prisma, WithdrawStatus, WithdrawType } from "@prisma/client";
import stripe from "../../../helpers/stripe";
import type Stripe from "stripe";
import { NotificationServices } from "../Notification/notification.service";
import QueryBuilder from "../../../helpers/queryBuilder";

// ── Constants ─────────────────────────────────────────────────────────────────

// Minimum withdrawal amount in USD
const MIN_WITHDRAW_AMOUNT = 1;

// Platform fee charged only on INSTANT withdrawals. STANDARD withdrawals are free.
const INSTANT_WITHDRAW_FEE_PERCENT = 0.03; // 3%

// ── Helpers ───────────────────────────────────────────────────────────────────

const getStripeTransferErrorMessage = (error: any): string => {
  return error?.message || "Stripe transfer failed. Please try again.";
};

// Pulls the ACTUAL fee Stripe charged for an instant payout off its
// balance transaction. Requires the payout to be created with
// `expand: ["balance_transaction"]`. Standard payouts have no fee.
const getPayoutFeeCents = (
  payout: Stripe.Payout | undefined,
): number => {
  if (!payout) return 0;
  const balanceTransaction = payout.balance_transaction;
  if (!balanceTransaction || typeof balanceTransaction === "string") return 0;
  return balanceTransaction.fee ?? 0;
};

// Rounds to the nearest cent to avoid floating point drift on fee math
const roundToCents = (value: number): number => Math.round(value * 100) / 100;

const calculateWithdrawFee = (
  amount: number,
  type: WithdrawType,
): { platformFee: number; netAmount: number } => {
  if (type === WithdrawType.INSTANT) {
    const platformFee = roundToCents(amount * INSTANT_WITHDRAW_FEE_PERCENT);
    return { platformFee, netAmount: roundToCents(amount - platformFee) };
  }
  return { platformFee: 0, netAmount: amount };
};

// ═════════════════════════════════════════════════════════════════════════════
// REQUEST WITHDRAWAL
// Deducts from availableBalance, triggers Stripe Transfer immediately.
// No admin approval required.
//   - INSTANT : 3% platform fee deducted, payout pushed to the bank right away
//   - STANDARD: no fee, payout follows the connected account's normal schedule
// ═════════════════════════════════════════════════════════════════════════════

const requestWithdraw = async (
  userId: string,
  payload: { amount: number; type?: WithdrawType },
) => {
  const { amount, type = WithdrawType.STANDARD } = payload;

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
  const { platformFee, netAmount } = calculateWithdrawFee(amount, type);
  const netAmountInCents = Math.round(netAmount * 100);

  // Deduct the full requested amount from availableBalance right away.
  // Fees (our platformFee + Stripe's real fee) are carved out of this
  // same amount when it's sent to Stripe — the user doesn't pay anything
  // beyond what they asked to withdraw.
  const [withdrawTransection] = await prisma.$transaction([
    prisma.withdrawTransection.create({
      data: {
        userId,
        walletId: wallet.id,
        type,
        amount,
        platformFee,
        netAmount,
        currency,
        status: WithdrawStatus.PROCESSING,
      },
    }),
    prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: { decrement: amount },
      },
    }),
  ]);

  let stripeTransferId: string | undefined;
  let stripePayoutId: string | undefined;

  try {
    // Transfer the NET amount (after platform fee) from the platform Stripe
    // account to the user's Connect account. The fee stays in the platform balance.
    const transfer = await stripe.transfers.create({
      amount: netAmountInCents,
      currency,
      destination: user.stripeAccountId,
      description: `Withdrawal for ${user.firstName} ${user.lastName}`,
      metadata: {
        withdrawTransectionId: withdrawTransection.id,
        userId,
        type,
      },
    });

    stripeTransferId = transfer.id;

    // STANDARD: the transfer landing in the connected account IS the outcome we
    // can promise — Stripe pays it out to the bank on its own normal schedule,
    // so we finalize right here.
    if (type === WithdrawType.STANDARD) {
      const [completedTransection] = await prisma.$transaction([
        prisma.withdrawTransection.update({
          where: { id: withdrawTransection.id },
          data: { status: WithdrawStatus.COMPLETED, stripeTransferId },
        }),
        prisma.wallet.update({
          where: { id: wallet.id },
          data: { totalWithdrawn: { increment: amount } },
        }),
      ]);

      await NotificationServices.SendNotification({
        userId,
        title: "Withdrawal successful!",
        body: `$${amount.toFixed(2)} has been transferred to your payout account.`,
        type: "WITHDRAW_COMPLETED",
        data: { withdrawTransectionId: withdrawTransection.id, amount: amount.toString() },
      }).catch(console.error);

      return completedTransection;
    }

    // INSTANT: kick off the actual instant payout, but do NOT mark this
    // COMPLETED yet. `payouts.create` returns as soon as Stripe accepts the
    // request — the real outcome (money actually landing, or bouncing) only
    // arrives later via the `payout.paid` / `payout.failed` webhook. We just
    // record the payout id here so the webhook can find this record again.
    const payout = await stripe.payouts.create(
      {
        amount: netAmountInCents,
        currency,
        method: "instant",
        metadata: {
          withdrawTransectionId: withdrawTransection.id,
          userId,
        },
      },
      { stripeAccount: user.stripeAccountId },
    );
    stripePayoutId = payout.id;

    const processingTransection = await prisma.withdrawTransection.update({
      where: { id: withdrawTransection.id },
      data: { stripeTransferId, stripePayoutId }, // status stays PROCESSING
    });

    await NotificationServices.SendNotification({
      userId,
      title: "Withdrawal processing",
      body: `Your $${amount.toFixed(2)} instant withdrawal is on its way — you'll be notified once it lands.`,
      type: "WITHDRAW_REQUESTED",
      data: { withdrawTransectionId: withdrawTransection.id, amount: amount.toString() },
    }).catch(console.error);

    return processingTransection;
  } catch (error: any) {
    const failureReason = getStripeTransferErrorMessage(error);

    // Revert the deducted amount back to availableBalance on failure
    await prisma.$transaction([
      prisma.withdrawTransection.update({
        where: { id: withdrawTransection.id },
        data: {
          status: WithdrawStatus.FAILED,
          failureReason,
        },
      }),
      prisma.wallet.update({
        where: { id: wallet.id },
        data: {
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
        withdrawTransectionId: withdrawTransection.id,
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
// CONFIRM INSTANT WITHDRAW (called from the Stripe webhook on payout.paid)
// This is the ONLY place an INSTANT withdrawal gets marked COMPLETED — money
// actually landing is confirmed async by Stripe, never assumed at request time.
// ═════════════════════════════════════════════════════════════════════════════

const confirmInstantWithdraw = async (
  payout: Stripe.Payout,
  connectedAccountId: string,
) => {
  console.log("confirmInstantWithdraw called");
console.log("Payout ID:", payout.id);
console.log("Connected Account:", connectedAccountId);
  const withdrawTransection = await prisma.withdrawTransection.findFirst({
    where: { stripePayoutId: payout.id, status: WithdrawStatus.PROCESSING },
  });

  // Not found, or already finalized by an earlier/duplicate webhook delivery — ignore.
  if (!withdrawTransection) return;

  // Re-fetch the payout with the balance transaction expanded so we get the
  // REAL Stripe fee — webhook payloads aren't expanded by default.
  const fullPayout = await stripe.payouts.retrieve(
    payout.id,
    { expand: ["balance_transaction"] },
    { stripeAccount: connectedAccountId },
  );
  const stripeFee = roundToCents(getPayoutFeeCents(fullPayout) / 100);
  const netPlatformRevenue = roundToCents(
    withdrawTransection.platformFee - stripeFee,
  );

  await prisma.$transaction([
    prisma.withdrawTransection.update({
      where: { id: withdrawTransection.id },
      data: { status: WithdrawStatus.COMPLETED, stripeFee },
    }),
    prisma.wallet.update({
      where: { id: withdrawTransection.walletId },
      data: { totalWithdrawn: { increment: withdrawTransection.amount } },
    }),
    ...(withdrawTransection.platformFee > 0
      ? [
          prisma.platformRevenue.create({
            data: {
              source: "WITHDRAW_FEE",
              amount: netPlatformRevenue,
              currency: withdrawTransection.currency,
              referenceId: withdrawTransection.id,
              referenceType: "WithdrawTransection",
            },
          }),
        ]
      : []),
  ]);

  if (withdrawTransection.platformFee > 0) {
    await NotificationServices.NotifyPlatformFeeEarned({
      amount: netPlatformRevenue,
      currency: withdrawTransection.currency,
      source: "WITHDRAW_FEE",
      referenceId: withdrawTransection.id,
    }).catch(console.error);
  }

  const totalFees = roundToCents(withdrawTransection.platformFee + stripeFee);
  const actuallyReceived = roundToCents(withdrawTransection.amount - totalFees);

  await NotificationServices.SendNotification({
    userId: withdrawTransection.userId,
    title: "Withdrawal successful!",
    body:
      totalFees > 0
        ? `You withdrew $${withdrawTransection.amount.toFixed(2)}. After a $${withdrawTransection.platformFee.toFixed(2)} platform fee and $${stripeFee.toFixed(2)} processing fee, $${actuallyReceived.toFixed(2)} landed in your payout account.`
        : `$${withdrawTransection.amount.toFixed(2)} has landed in your payout account.`,
    type: "WITHDRAW_COMPLETED",
    data: {
      withdrawTransectionId: withdrawTransection.id,
      amount: withdrawTransection.amount.toString(),
      platformFee: withdrawTransection.platformFee.toString(),
      stripeFee: stripeFee.toString(),
      actuallyReceived: actuallyReceived.toString(),
    },
  }).catch(console.error);
};

// ═════════════════════════════════════════════════════════════════════════════
// FAIL INSTANT WITHDRAW (called from the Stripe webhook on payout.failed / payout.canceled)
// The money never made it — refund the full requested amount back to
// availableBalance and let the user know.
// ═════════════════════════════════════════════════════════════════════════════

const failInstantWithdraw = async (
  payout: Stripe.Payout,
  failureReason?: string,
) => {
  const withdrawTransection = await prisma.withdrawTransection.findFirst({
    where: { stripePayoutId: payout.id, status: WithdrawStatus.PROCESSING },
  });

  if (!withdrawTransection) return; // already finalized / duplicate delivery

  const reason =
    failureReason ||
    payout.failure_message ||
    "The instant payout failed on Stripe's side.";

  await prisma.$transaction([
    prisma.withdrawTransection.update({
      where: { id: withdrawTransection.id },
      data: { status: WithdrawStatus.FAILED, failureReason: reason },
    }),
    prisma.wallet.update({
      where: { id: withdrawTransection.walletId },
      data: { availableBalance: { increment: withdrawTransection.amount } },
    }),
  ]);

  await NotificationServices.SendNotification({
    userId: withdrawTransection.userId,
    title: "Withdrawal failed",
    body: `Your $${withdrawTransection.amount.toFixed(2)} instant withdrawal didn't go through: ${reason}. The amount has been returned to your wallet.`,
    type: "WITHDRAW_FAILED",
    data: { withdrawTransectionId: withdrawTransection.id, reason },
  }).catch(console.error);
};

// ═════════════════════════════════════════════════════════════════════════════
// HANDLE TRANSFER REVERSED (called from the Stripe webhook on transfer.reversed)
// A Transfer can bounce back to the platform balance AFTER we've already
// marked the withdrawal COMPLETED (this is how STANDARD withdrawals finalize —
// right after the transfer, before Stripe's own bank payout even happens).
// If that transfer later reverses, the money never really left — so we have
// to undo everything we already credited: give availableBalance back,
// undo totalWithdrawn, and flip the record to FAILED.
// ═════════════════════════════════════════════════════════════════════════════

const handleTransferReversed = async (transfer: Stripe.Transfer) => {
  const withdrawTransection = await prisma.withdrawTransection.findFirst({
    where: {
      stripeTransferId: transfer.id,
      status: { in: [WithdrawStatus.COMPLETED, WithdrawStatus.PROCESSING] },
    },
  });

  // Not one of ours, or already reverted by an earlier/duplicate delivery.
  if (!withdrawTransection) return;

  const failureReason =
    "The transfer was reversed by Stripe — funds never reached your payout account.";

  await prisma.$transaction([
    prisma.withdrawTransection.update({
      where: { id: withdrawTransection.id },
      data: { status: WithdrawStatus.FAILED, failureReason },
    }),
    prisma.wallet.update({
      where: { id: withdrawTransection.walletId },
      data: {
        availableBalance: { increment: withdrawTransection.amount },
        // Only undo totalWithdrawn if it was actually counted already
        // (i.e. this withdrawal had reached COMPLETED).
        ...(withdrawTransection.status === WithdrawStatus.COMPLETED
          ? { totalWithdrawn: { decrement: withdrawTransection.amount } }
          : {}),
      },
    }),
  ]);

  await NotificationServices.SendNotification({
    userId: withdrawTransection.userId,
    title: "Withdrawal reversed",
    body: `Your $${withdrawTransection.amount.toFixed(2)} withdrawal was reversed and the amount has been returned to your wallet.`,
    type: "WITHDRAW_FAILED",
    data: { withdrawTransectionId: withdrawTransection.id, reason: failureReason },
  }).catch(console.error);
};

// ═════════════════════════════════════════════════════════════════════════════
// GET MY WITHDRAW HISTORY
// Returns a paginated, sorted list of the current user's withdraw transactions.
// ═════════════════════════════════════════════════════════════════════════════

const getMyWithdrawHistory = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const queryBuilder = new QueryBuilder(prisma.withdrawTransection, query);

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
const getAllWithdraws = async (query: Record<string, unknown>) => {
  const { from, to } = query;

  const filters: Prisma.WithdrawTransectionWhereInput = {};

  if (from || to) {
    filters.createdAt = {};

    if (from) {
      filters.createdAt.gte = new Date(from as string);
    }

    if (to) {
      const endDate = new Date(to as string);
      endDate.setHours(23, 59, 59, 999);

      filters.createdAt.lte = endDate;
    }
  }

  const queryBuilder = new QueryBuilder(prisma.withdrawTransection, query);

  const withdraws = await queryBuilder
    .search([
      "user.firstName",
      "user.lastName",
      "user.fullName",
      "user.email",
      "user.phone",
    ])
    .filter()
    .rawFilter(filters)
    .sort()
    .paginate()
    .include({
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          email: true,
          phone: true,
          photo: true,
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

  return {
    meta,
    data: withdraws,
  };
};
const getSingleWithdraw = async (id: string) => {
  const withdraw = await prisma.withdrawTransection.findUnique({
    where: {
      id,
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          email: true,
          phone: true,
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
    },
  });

  if (!withdraw) {
    throw new ApiError(httpStatus.NOT_FOUND, "Withdraw request not found");
  }

  return withdraw;
};
export const WithdrawServices = {
  requestWithdraw,
  confirmInstantWithdraw,
  failInstantWithdraw,
  handleTransferReversed,
  getMyWithdrawHistory,
    getAllWithdraws,
  getSingleWithdraw,
};