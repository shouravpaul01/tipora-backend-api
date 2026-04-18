// tip.service.ts

import Stripe from "stripe";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { env } from "../../../config/env.config";
import { PaymentType, TipStatus, TransactionStatus } from "@prisma/client";
import { NotificationServices } from "../Notification/notification.service";
import QueryBuilder from "../../../helpers/queryBuilder";
import { getStripeErrorMessage } from "./tips.utils";
import { CARD_DISABLE_CODES } from "./tips.constant";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const PLATFORM_FEE_PERCENT = 3;

// ── Calculate platform fee and net amount ─────────────

const calculateFees = (amount: number) => {
  const platformFee = parseFloat(
    ((amount * PLATFORM_FEE_PERCENT) / 100).toFixed(2),
  );
  const netAmount = parseFloat((amount - platformFee).toFixed(2));
  return { platformFee, netAmount };
};

// ── Send tip ──────────────────────────────────────────





const sendTip = async (
  senderId: string,
  payload: {
    receiverId: string;
    amount: number;
    message?: string;
    walletToken?: string;
  },
) => {
  const { receiverId, amount, message, walletToken } = payload;

  if (senderId === receiverId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You cannot tip yourself.");
  }

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId, isDeleted: false, status: "ACTIVE" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      stripeAccountId: true,
      stripeAccountVerified: true,
    },
  });
  if (!receiver) {
    throw new ApiError(httpStatus.NOT_FOUND, "Receiver not found.");
  }
  if (!receiver.stripeAccountId || !receiver.stripeAccountVerified) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Receiver has not set up their payout account yet.",
    );
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: {
      stripeCustomerId: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!sender) {
    throw new ApiError(httpStatus.NOT_FOUND, "Sender not found.");
  }

  // ── Default payment method auto-resolve ──────────
  const paymentMethod = await prisma.paymentMethod.findFirst({
    where: {
      userId: senderId,
      isDefault: true,
      isActive: true,
    },
  });
  if (!paymentMethod) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No default payment method found. Please add one.",
    );
  }

  const currency = "usd";

  const { platformFee, netAmount } = calculateFees(amount);
  const amountInCents = Math.round(amount * 100);
  const platformFeeInCents = Math.round(platformFee * 100);

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
  let stripeTransferId: string | undefined;
  let applePayTransactionId: string | undefined;

  try {
    if (paymentMethod.type === PaymentType.CARD) {
      if (!paymentMethod.stripePaymentMethodId || !sender.stripeCustomerId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Card payment method not properly configured.",
        );
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        customer: sender.stripeCustomerId,
        payment_method: paymentMethod.stripePaymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        application_fee_amount: platformFeeInCents,
        transfer_data: { destination: receiver.stripeAccountId },
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
      stripeChargeId =
        typeof paymentIntent.latest_charge === "string"
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id;
      stripeTransferId = paymentIntent.transfer_data?.destination as string;

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
        application_fee_amount: platformFeeInCents,
        transfer_data: { destination: receiver.stripeAccountId },
        description: `Tip from ${sender.firstName} ${sender.lastName} to ${receiver.firstName}`,
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
      stripeChargeId =
        typeof paymentIntent.latest_charge === "string"
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id;
      stripeTransferId = paymentIntent.transfer_data?.destination as string;

      if (paymentIntent.status !== "succeeded") {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Payment failed. Please try again.",
        );
      }
    }

    // ── Payment succeeded ─────────────────────────
    const [updatedTip, transaction] = await prisma.$transaction([
      prisma.tip.update({
        where: { id: tip.id },
        data: { status: TipStatus.COMPLETED },
      }),
      prisma.transaction.create({
        data: {
          tipId: tip.id,
          paymentMethodId: paymentMethod.id,
          stripePaymentIntentId,
          stripeChargeId,
          stripeTransferId,
          applePayTransactionId,
          applicationFeeAmount: platformFee,
          amount,
          platformFee,
          netAmount,
          currency,
          status: TransactionStatus.COMPLETED,
        },
      }),
    ]);

    const formattedAmount = `$${amount.toFixed(2)}`;
    await Promise.allSettled([
      NotificationServices.SendNotification({
        userId: receiverId,
        title: "You received a tip! 🎉",
        body: `${sender.firstName} ${sender.lastName} sent you ${formattedAmount}${message ? ` — "${message}"` : ""}`,
        type: "TIP_RECEIVED",
        data: { tipId: tip.id, senderId, amount: amount.toString() },
      }),
      NotificationServices.SendNotification({
        userId: senderId,
        title: "Tip sent successfully!",
        body: `Your ${formattedAmount} tip to ${receiver.firstName} ${receiver.lastName} was sent.`,
        type: "TIP_SENT",
        data: { tipId: tip.id, receiverId, amount: amount.toString() },
      }),
    ]);

    return { tip: updatedTip, transaction };
  } catch (error: any) {
    // ── Stripe error কিনা check করো ──────────────
    const isStripeError =
      error?.type?.startsWith("Stripe") || !!error?.raw;

    const stripeRaw = error?.raw || error;
    const failureReason = isStripeError
      ? getStripeErrorMessage(stripeRaw)
      : error?.message || "Unknown error";

    // ── Card disable করো যদি দরকার হয় ───────────
    if (
      isStripeError &&
      paymentMethod.type === PaymentType.CARD &&
      (CARD_DISABLE_CODES.has(stripeRaw?.code) ||
        CARD_DISABLE_CODES.has(stripeRaw?.decline_code))
    ) {
      await prisma.paymentMethod.update({
        where: { id: paymentMethod.id },
        data: { isActive: false },
      }).catch(console.error);
    }

    // ── Tip + Transaction FAILED record ───────────
    await prisma.$transaction([
      prisma.tip.update({
        where: { id: tip.id },
        data: { status: TipStatus.FAILED },
      }),
      prisma.transaction.create({
        data: {
          tipId: tip.id,
          paymentMethodId: paymentMethod.id,
          stripePaymentIntentId,
          amount,
          platformFee,
          netAmount,
          currency,
          status: TransactionStatus.FAILED,
          failureReason,
        },
      }),
    ]);

    // ── Sender কে notify করো ─────────────────────
    await NotificationServices.SendNotification({
      userId: senderId,
      title: "Tip failed",
      body: failureReason,
      type: "TIP_FAILED",
      data: {
        tipId: tip.id,
        reason: failureReason,
        // card disable হলে frontend জানাবে নতুন card add করতে
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

// ── Get my sent tips (paginated) ──────────────────────

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
