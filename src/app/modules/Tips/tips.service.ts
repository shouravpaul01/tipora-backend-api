// tip.service.ts

import Stripe from "stripe";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { env } from "../../../config/env.config";
import { PaymentType, Prisma, TipStatus, TransactionStatus } from "@prisma/client";
import { NotificationServices } from "../Notification/notification.service";
import QueryBuilder from "../../../helpers/queryBuilder";
import { getStripeErrorMessage } from "./tips.utils";
import { CARD_DISABLE_CODES } from "./tips.constant";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// ── Types ──────────────────────────────────────────────

type TipRecipientInput = {
  receiverId: string;
  amount: number;
};

type SendTipPayload = {
  receiverIds: string[];
  totalAmount: number;
  message?: string;
  walletToken?: string;
};

// ── Split a total amount equally among receivers ──────
// Works in cents so the shares always sum back up to
// exactly totalAmount (no floating point drift). If the
// amount doesn't divide evenly, the leftover cents are
// handed out one-by-one to the first few receivers.
const splitEqually = (
  receiverIds: string[],
  totalAmount: number,
): TipRecipientInput[] => {
  const totalCents = Math.round(totalAmount * 100);
  const n = receiverIds.length;
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents % n;

  return receiverIds.map((receiverId, index) => ({
    receiverId,
    amount: (baseCents + (index < remainderCents ? 1 : 0)) / 100,
  }));
};

// ── Split an actual Stripe fee proportionally across recipients ──
// Works in cents using the largest-remainder method so the
// per-recipient fee shares always sum back up to exactly the
// real fee Stripe charged (no floating point drift).
const distributeFeeProportionally = (
  recipientAmounts: number[],
  totalFeeCents: number,
): number[] => {
  if (totalFeeCents <= 0) return recipientAmounts.map(() => 0);

  const amountsInCents = recipientAmounts.map((a) => Math.round(a * 100));
  const totalAmountCents = amountsInCents.reduce((s, a) => s + a, 0);

  const rawShares = amountsInCents.map(
    (cents) => (totalFeeCents * cents) / totalAmountCents,
  );
  const floors = rawShares.map((s) => Math.floor(s));
  const allocated = floors.reduce((s, f) => s + f, 0);
  let remainder = totalFeeCents - allocated;

  // Give the leftover cents to whichever recipients had the largest
  // fractional remainder, so the total matches exactly.
  const order = rawShares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[order[k % order.length].i] += 1;
  }
  return result;
};

// ── Pull the real Stripe processing fee off an expanded charge ──
// Requires the PaymentIntent to have been created with
// `expand: ["latest_charge.balance_transaction"]`.
const getBalanceTransactionFeeCents = (
  charge: Stripe.Charge | null | undefined,
): number => {
  if (!charge) return 0;
  const balanceTransaction = charge.balance_transaction;
  if (!balanceTransaction || typeof balanceTransaction === "string") return 0;
  return balanceTransaction.fee ?? 0;
};

// ── Send tip (single or equally split across multiple receivers) ──

const sendTip = async (senderId: string, payload: SendTipPayload) => {
  const { receiverIds, totalAmount, message, walletToken } = payload;

  if (!receiverIds || receiverIds.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "At least one receiver is required.",
    );
  }
  if (!totalAmount || totalAmount <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "A valid total amount is required.",
    );
  }

  // ── Validate receivers ─────────────────────────────
  const uniqueReceiverIds = new Set(receiverIds);
  if (uniqueReceiverIds.size !== receiverIds.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Duplicate receivers are not allowed.",
    );
  }
  if (receiverIds.includes(senderId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You cannot tip yourself.");
  }

  // Split the total equally — remainder cents (if any) go to the first receivers
  const recipients = splitEqually(receiverIds, totalAmount);

  const receivers = await prisma.user.findMany({
    where: { id: { in: receiverIds }, isDeleted: false, status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (receivers.length !== receiverIds.length) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "One or more receivers not found.",
    );
  }
  const receiverMap = new Map(receivers.map((r) => [r.id, r]));

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { stripeCustomerId: true, firstName: true, lastName: true },
  });
  if (!sender) {
    throw new ApiError(httpStatus.NOT_FOUND, "Sender not found.");
  }

  const paymentMethod = await prisma.paymentMethod.findFirst({
    where: { userId: senderId, isDefault: true, isActive: true },
  });
  if (!paymentMethod) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No default payment method found. Please add one.",
    );
  }

  const currency = "usd";

  // No platform fee on tips — sender is charged exactly totalAmount,
  // and each receiver's wallet is credited with exactly their equal share.
  const amountInCents = Math.round(totalAmount * 100);

  const tip = await prisma.tip.create({
    data: {
      senderId,
      totalAmount,
      currency,
      message,
      status: TipStatus.PENDING,
      recipients: {
        create: recipients.map((r) => ({
          receiverId: r.receiverId,
          amount: r.amount,
          status: TipStatus.PENDING,
        })),
      },
    },
    include: { recipients: true },
  });

  let stripePaymentIntentId: string | undefined;
  let stripeChargeId: string | undefined;
  let applePayTransactionId: string | undefined;
  let stripeFeeCents = 0; // actual fee Stripe took, pulled from the balance transaction

  const receiverNames = recipients
    .map((r) => receiverMap.get(r.receiverId)?.firstName)
    .filter(Boolean)
    .join(", ");

  try {
    if (paymentMethod.type === PaymentType.CARD) {
      if (!paymentMethod.stripePaymentMethodId || !sender.stripeCustomerId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Card payment method not properly configured.",
        );
      }

      // Funds land directly in the platform account.
      // No transfer_data or application_fee_amount needed —
      // there is no platform fee on tips.
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        customer: sender.stripeCustomerId,
        payment_method: paymentMethod.stripePaymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        description: `Tip from ${sender.firstName} to ${receiverNames}`,
        metadata: {
          tipId: tip.id,
          senderId,
          receiverIds: receiverIds.join(","),
        },
        expand: ["latest_charge.balance_transaction"],
      });

      stripePaymentIntentId = paymentIntent.id;
      const latestCharge =
        typeof paymentIntent.latest_charge === "string"
          ? undefined
          : paymentIntent.latest_charge;
      stripeChargeId =
        latestCharge?.id ?? (paymentIntent.latest_charge as string | undefined);
      stripeFeeCents = getBalanceTransactionFeeCents(latestCharge);

      if (paymentIntent.status !== "succeeded") {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Payment failed. Please try again.",
        );
      }
    } else {
      // ── Apple Pay / Google Pay ────────────────────
      if (!walletToken) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Wallet token is required for wallet payments.",
        );
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        payment_method: walletToken,
        confirm: true,
        automatic_payment_methods: { enabled: true },
        description: `Tip from ${sender.firstName} ${sender.lastName} to ${receiverNames}`,
        metadata: {
          tipId: tip.id,
          senderId,
          receiverIds: receiverIds.join(","),
          paymentType: paymentMethod.type,
        },
        expand: ["latest_charge.balance_transaction"],
      });

      stripePaymentIntentId = paymentIntent.id;
      applePayTransactionId = paymentIntent.id;
      const latestCharge =
        typeof paymentIntent.latest_charge === "string"
          ? undefined
          : paymentIntent.latest_charge;
      stripeChargeId =
        latestCharge?.id ?? (paymentIntent.latest_charge as string | undefined);
      stripeFeeCents = getBalanceTransactionFeeCents(latestCharge);

      if (paymentIntent.status !== "succeeded") {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Payment failed. Please try again.",
        );
      }
    }

    // ── Payment succeeded ─────────────────────────
    // Split the ACTUAL Stripe fee (pulled from the balance transaction)
    // proportionally across recipients based on their gross share.
    const stripeFee = stripeFeeCents / 100;
    const netAmount = totalAmount - stripeFee;

    const feeSharesCents = distributeFeeProportionally(
      recipients.map((r) => r.amount),
      stripeFeeCents,
    );
    const recipientsWithNet = recipients.map((r, i) => ({
      ...r,
      netAmount: r.amount - feeSharesCents[i] / 100,
    }));

    const [updatedTip, transaction] = await prisma.$transaction(async (tx) => {
      const updatedTip = await tx.tip.update({
        where: { id: tip.id },
        data: { status: TipStatus.COMPLETED },
      });

      const transaction = await tx.transaction.create({
        data: {
          tipId: tip.id,
          paymentMethodId: paymentMethod.id,
          stripePaymentIntentId,
          stripeChargeId,
          applePayTransactionId,
          amount: totalAmount,
          stripeFee,
          netAmount,
          currency,
          status: TransactionStatus.COMPLETED,
        },
      });

      // Credit each receiver's wallet with their net share
      // (gross equal share minus their proportional cut of the real Stripe fee)
      for (const r of recipientsWithNet) {
        await tx.tipRecipient.updateMany({
          where: { tipId: tip.id, receiverId: r.receiverId },
          data: { status: TipStatus.COMPLETED, netAmount: r.netAmount },
        });

        await tx.wallet.upsert({
          where: { userId: r.receiverId },
          create: {
            userId: r.receiverId,
            currency,
            totalEarned: r.netAmount,
            availableBalance: r.netAmount,
            totalWithdrawn: 0,
          },
          update: {
            totalEarned: { increment: r.netAmount },
            availableBalance: { increment: r.netAmount },
          },
        });
      }

      return [updatedTip, transaction];
    });

    // ── Notifications ──────────────────────────────
    // Recipients are told their net (post-Stripe-fee) credited amount,
    // since that's what actually landed in their wallet.
    const notifications = recipientsWithNet.map((r) => {
      const receiver = receiverMap.get(r.receiverId)!;
      const formattedShare = `$${r.netAmount.toFixed(2)}`;
      return NotificationServices.SendNotification({
        userId: r.receiverId,
        title: "You received a tip! 🎉",
        body: `${sender.firstName} ${sender.lastName} sent you ${formattedShare}${message ? ` — "${message}"` : ""}`,
        type: "TIP_RECEIVED",
        data: { tipId: tip.id, senderId, amount: r.netAmount.toString() },
      });
    });

    const formattedTotal = `$${totalAmount.toFixed(2)}`;
    notifications.push(
      NotificationServices.SendNotification({
        userId: senderId,
        title: "Tip sent successfully!",
        body:
          recipients.length > 1
            ? `Your ${formattedTotal} tip was split between ${receiverNames}.`
            : `Your ${formattedTotal} tip to ${receiverNames} was sent.`,
        type: "TIP_SENT",
        data: {
          tipId: tip.id,
          receiverIds: receiverIds.join(","),
          amount: totalAmount.toString(),
        },
      }),
    );

    await Promise.allSettled(notifications);

    return { tip: updatedTip, transaction };
  } catch (error: any) {
    const isStripeError = error?.type?.startsWith("Stripe") || !!error?.raw;

    const stripeRaw = error?.raw || error;
    const failureReason = isStripeError
      ? getStripeErrorMessage(stripeRaw)
      : error?.message || "Unknown error";

    if (
      isStripeError &&
      paymentMethod.type === PaymentType.CARD &&
      (CARD_DISABLE_CODES.has(stripeRaw?.code) ||
        CARD_DISABLE_CODES.has(stripeRaw?.decline_code))
    ) {
      await prisma.paymentMethod
        .update({
          where: { id: paymentMethod.id },
          data: { isActive: false },
        })
        .catch(console.error);
    }

    await prisma.$transaction([
      prisma.tip.update({
        where: { id: tip.id },
        data: { status: TipStatus.FAILED },
      }),
      prisma.tipRecipient.updateMany({
        where: { tipId: tip.id },
        data: { status: TipStatus.FAILED },
      }),
      prisma.transaction.create({
        data: {
          tipId: tip.id,
          paymentMethodId: paymentMethod.id,
          stripePaymentIntentId,
          amount: totalAmount,
          currency,
          status: TransactionStatus.FAILED,
          failureReason,
        },
      }),
    ]);

    await NotificationServices.SendNotification({
      userId: senderId,
      title: "Tip failed",
      body: failureReason,
      type: "TIP_FAILED",
      data: {
        tipId: tip.id,
        reason: failureReason,
        cardDisabled:
          isStripeError &&
          paymentMethod.type === PaymentType.CARD &&
          (CARD_DISABLE_CODES.has(stripeRaw?.code) ||
            CARD_DISABLE_CODES.has(stripeRaw?.decline_code)),
      },
    }).catch(console.error);

    if (error instanceof ApiError) throw error;

    throw new ApiError(httpStatus.BAD_REQUEST, failureReason);
  }
};

// ── Get my tips (sent + received, paginated) ──────────

const getMySentTips = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const queryBuilder = new QueryBuilder(prisma.tip, query);

  const tips = await queryBuilder
    .rawFilter({
      OR: [
        { senderId: userId },
        { recipients: { some: { receiverId: userId } } },
      ],
    })
    .sort()
    .paginate()
    .include({
      sender: {
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
      recipients: {
        include: {
          receiver: {
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
        },
      },
      transaction: true,
    })
    .execute();

  const meta = await queryBuilder.countTotal();

  return { data: tips, meta };
};
const getAllTips = async (query: Record<string, unknown>) => {
  const { from, to } = query;

  const filters: Prisma.TipWhereInput = {};

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

  const queryBuilder = new QueryBuilder(prisma.tip, query);

  const tips = await queryBuilder
    .search(["message"])
    .rawFilter(filters)
    .sort()
    .paginate()
    .include({
      sender: {
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
      recipients: {
        include: {
          receiver: {
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
        },
      },
      transaction: true,
    })
    .execute();

  const meta = await queryBuilder.countTotal();

  return {
    meta,
    data: tips,
  };
};
const getSingleTip = async (id: string) => {
  const tip = await prisma.tip.findUnique({
    where: {
      id,
    },
    include: {
      sender: {
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
      recipients: {
        include: {
          receiver: {
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
        },
      },
      transaction: true,
    },
  });

  if (!tip) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tip not found");
  }

  return tip;
};
const getTipSummary = async () => {
  const now = new Date();

  // Today
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // Week
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  // Month
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );

  // Year
  const yearStart = new Date(
    now.getFullYear(),
    0,
    1,
  );

  const [
    today,
    weekly,
    monthly,
    yearly,
    total,
  ] = await Promise.all([
    prisma.tip.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      _count: true,
      _sum: {
        totalAmount: true,
      },
    }),

    prisma.tip.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: weekStart,
        },
      },
      _count: true,
      _sum: {
        totalAmount: true,
      },
    }),

    prisma.tip.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: monthStart,
        },
      },
      _count: true,
      _sum: {
        totalAmount: true,
      },
    }),

    prisma.tip.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: yearStart,
        },
      },
      _count: true,
      _sum: {
        totalAmount: true,
      },
    }),

    prisma.tip.aggregate({
      where: {
        status: "COMPLETED",
      },
      _count: true,
      _sum: {
        totalAmount: true,
      },
    }),
  ]);

  return {
    today: {
      totalTips: today._count,
      totalAmount: Number(today._sum.totalAmount ?? 0),
    },

    weekly: {
      totalTips: weekly._count,
      totalAmount: Number(weekly._sum.totalAmount ?? 0),
    },

    monthly: {
      totalTips: monthly._count,
      totalAmount: Number(monthly._sum.totalAmount ?? 0),
    },

    yearly: {
      totalTips: yearly._count,
      totalAmount: Number(yearly._sum.totalAmount ?? 0),
    },

    total: {
      totalTips: total._count,
      totalAmount: Number(total._sum.totalAmount ?? 0),
    },
  };
};
export const TipServices = {
  sendTip,
  getMySentTips,
  getAllTips,
  getSingleTip,
  getTipSummary
};
