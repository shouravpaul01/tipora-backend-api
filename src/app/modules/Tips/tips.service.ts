// tip.service.ts

import Stripe from "stripe";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { env } from "../../../config/env.config";
import { PaymentType, TipStatus, TransactionStatus } from "@prisma/client";
import { sendNotification } from "../notification/notification.helper";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const PLATFORM_FEE_PERCENT = 3;

// ── calculate platform fee ────────────────────────────

const calculateFees = (amount: number) => {
  const platformFee = parseFloat(((amount * PLATFORM_FEE_PERCENT) / 100).toFixed(2));
  const netAmount = parseFloat((amount - platformFee).toFixed(2));
  return { platformFee, netAmount };
};

// ── send tip ──────────────────────────────────────────

const sendTip = async (
  senderId: string,
  payload: {
    receiverId: string;
    amount: number;
    currency: string;
    message?: string;
    paymentMethodId: string;
    walletToken?: string;
  },
) => {
  const { receiverId, amount, currency, message, paymentMethodId, walletToken } = payload;

  // Cannot tip yourself
  if (senderId === receiverId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You cannot tip yourself.");
  }

  // Validate receiver exists and is active
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId, isDeleted: false, status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true, fullName: true },
  });
  if (!receiver) {
    throw new ApiError(httpStatus.NOT_FOUND, "Receiver not found.");
  }

  // Validate sender's payment method
  const paymentMethod = await prisma.paymentMethod.findUnique({
    where: { id: paymentMethodId },
  });
  if (!paymentMethod || paymentMethod.userId !== senderId || !paymentMethod.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid payment method.");
  }

  // Get sender info for Stripe
  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { stripeCustomerId: true, firstName: true, lastName: true },
  });
  if (!sender) {
    throw new ApiError(httpStatus.NOT_FOUND, "Sender not found.");
  }

  const { platformFee, netAmount } = calculateFees(amount);
  const amountInCents = Math.round(amount * 100);

  // Create tip record first (PENDING)
  const tip = await prisma.tip.create({
    data: {
      senderId,
      receiverId,
      amount,
      currency,
      message,
      status: TipStatus.PENDING,
    },
  });

  let stripePaymentIntentId: string | undefined;
  let stripeChargeId: string | undefined;
  let applePayTransactionId: string | undefined;

  try {
    if (paymentMethod.type === PaymentType.CARD) {
      // ── Card payment via Stripe ────────────────────
      if (!paymentMethod.stripePaymentMethodId || !sender.stripeCustomerId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Card payment method not properly configured.");
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        customer: sender.stripeCustomerId,
        payment_method: paymentMethod.stripePaymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        description: `Tip from ${sender.firstName} to ${receiver.firstName}`,
        metadata: {
          tipId: tip.id,
          senderId,
          receiverId,
          platformFee: platformFee.toString(),
          netAmount: netAmount.toString(),
        },
      });

      stripePaymentIntentId = paymentIntent.id;
      stripeChargeId = typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;

      if (paymentIntent.status !== "succeeded") {
        throw new ApiError(httpStatus.BAD_REQUEST, "Payment failed. Please try again.");
      }
    } else {
      // ── Apple Pay / Google Pay ─────────────────────
      if (!walletToken) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Wallet token is required for wallet payments.");
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        payment_method_data: {
          type: "card",
          card: { token: walletToken },
        },
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        description: `Tip from ${sender.firstName} to ${receiver.firstName}`,
        metadata: {
          tipId: tip.id,
          senderId,
          receiverId,
          platformFee: platformFee.toString(),
          netAmount: netAmount.toString(),
          paymentType: paymentMethod.type,
        },
      });

      stripePaymentIntentId = paymentIntent.id;
      applePayTransactionId = paymentIntent.id;
      stripeChargeId = typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;

      if (paymentIntent.status !== "succeeded") {
        throw new ApiError(httpStatus.BAD_REQUEST, "Payment failed. Please try again.");
      }
    }

    // ── Payment succeeded — update tip & create transaction ──
    const [updatedTip, transaction] = await prisma.$transaction([
      prisma.tip.update({
        where: { id: tip.id },
        data: { status: TipStatus.COMPLETED },
      }),
      prisma.transaction.create({
        data: {
          tipId: tip.id,
          paymentMethodId,
          stripePaymentIntentId,
          stripeChargeId,
          applePayTransactionId,
          amount,
          platformFee,
          netAmount,
          currency,
          status: TransactionStatus.COMPLETED,
        },
      }),
    ]);

    // ── Send notifications ─────────────────────────
    const senderName = `${sender.firstName}`;
    const formattedAmount = `$${amount.toFixed(2)}`;

    await Promise.allSettled([
      // Notify receiver
      sendNotification({
        userId: receiverId,
        title: "You received a tip! 🎉",
        body: `${senderName} sent you ${formattedAmount}${message ? ` — "${message}"` : ""}`,
        type: "TIP_RECEIVED",
        data: { tipId: tip.id, senderId, amount: amount.toString() },
      }),
      // Notify sender
      sendNotification({
        userId: senderId,
        title: "Tip sent successfully!",
        body: `Your ${formattedAmount} tip to ${receiver.firstName} was sent.`,
        type: "TIP_SENT",
        data: { tipId: tip.id, receiverId, amount: amount.toString() },
      }),
    ]);

    return {
      tip: updatedTip,
      transaction,
    };
  } catch (error: any) {
    // ── Payment failed — update tip status ─────────
    await prisma.$transaction([
      prisma.tip.update({
        where: { id: tip.id },
        data: { status: TipStatus.FAILED },
      }),
      prisma.transaction.create({
        data: {
          tipId: tip.id,
          paymentMethodId,
          stripePaymentIntentId,
          amount,
          platformFee,
          netAmount,
          currency,
          status: TransactionStatus.FAILED,
          failureReason: error?.message || "Unknown error",
        },
      }),
    ]);

    // Notify sender of failure
    await sendNotification({
      userId: senderId,
      title: "Tip failed",
      body: `Your tip of $${amount.toFixed(2)} could not be processed.`,
      type: "TIP_FAILED",
      data: { tipId: tip.id },
    }).catch(console.error);

    throw new ApiError(
      httpStatus.BAD_REQUEST,
      error?.message || "Payment failed. Please try again.",
    );
  }
};

// ── get my sent tips ──────────────────────────────────

const getMySentTips = async (
  senderId: string,
  query: Record<string, unknown>,
) => {
  const queryBuilder = new QueryBuilder(prisma.tip, query);

  const tips = await queryBuilder
    .rawFilter({ senderId })
    .sort()
    .paginate()
    .execute();

  const meta = await queryBuilder.countTotal();

  return { data: tips, meta };
};

export const TipServices = {
  sendTip,
  getMySentTips,
};