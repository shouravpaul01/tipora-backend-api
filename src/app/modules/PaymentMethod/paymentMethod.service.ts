import Stripe from "stripe";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { env } from "../../../config/env.config";
import { PaymentType } from "@prisma/client";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// ── get or create stripe customer ─────────────────────

const getOrCreateStripeCustomer = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      stripeCustomerId: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    metadata: { userId },
  });

  // Save customer ID to user record
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
};

// ── create setup intent → return clientSecret ─────────

const createSetupIntent = async (userId: string) => {
  const stripeCustomerId = await getOrCreateStripeCustomer(userId);

  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
  });

  return { clientSecret: setupIntent.client_secret };
};

// ── add card ──────────────────────────────────────────

const addCard = async (
  userId: string,
  stripePaymentMethodId: string,
  makeDefault: boolean = false,
) => {
  const stripeCustomerId = await getOrCreateStripeCustomer(userId);

  // Check if card is already added
  const existingPm = await prisma.paymentMethod.findFirst({
    where: { userId, stripePaymentMethodId, isActive: true },
  });
  if (existingPm) {
    throw new ApiError(httpStatus.CONFLICT, "This card is already added.");
  }

  // Attach card to Stripe customer
  await stripe.paymentMethods.attach(stripePaymentMethodId, {
    customer: stripeCustomerId,
  });

  const activeCount = await prisma.paymentMethod.count({
    where: { userId, isActive: true },
  });

  // First card is always default, otherwise respect makeDefault flag
  const isDefault = activeCount === 0 || makeDefault;

  if (isDefault) {
    // Update default payment method on Stripe customer
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: stripePaymentMethodId },
    });

    // Set all other payment methods as non-default in DB
    await prisma.paymentMethod.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      userId,
      type: PaymentType.CARD,
      stripePaymentMethodId,
      isDefault,
    },
  });

  // Fetch card details from Stripe for response
  const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId);

  return {
    id: paymentMethod.id,
    type: paymentMethod.type,
    stripePaymentMethodId,
    brand: pm.card?.brand,
    last4: pm.card?.last4,
    expiryMonth: pm.card?.exp_month,
    expiryYear: pm.card?.exp_year,
    country: pm.card?.country,
    isDefault,
  };
};

// ── add Apple Pay / Google Pay ────────────────────────

const addWallet = async (
  userId: string,
  payload: { type: "APPLE_PAY" | "GOOGLE_PAY" },
) => {
  // Check if wallet type already exists
  const duplicate = await prisma.paymentMethod.findFirst({
    where: { userId, type: payload.type as PaymentType, isActive: true },
  });
  if (duplicate) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `${payload.type === "APPLE_PAY" ? "Apple Pay" : "Google Pay"} is already added.`,
    );
  }

  // First payment method is always default
  const activeCount = await prisma.paymentMethod.count({
    where: { userId, isActive: true },
  });
  const isDefault = activeCount === 0;

  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      userId,
      type: payload.type as PaymentType,
      isDefault,
    },
  });

  return paymentMethod;
};

// ── get all my payment methods ────────────────────────

const getMyPaymentMethods = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });

  // Fetch all active payment methods from DB for reference
  const dbPaymentMethods = await prisma.paymentMethod.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      type: true,
      stripePaymentMethodId: true,
      isDefault: true,
      createdAt: true,
    },
  });

  // Get the default stripe payment method ID
  const defaultPmId = dbPaymentMethods.find((pm) => pm.isDefault)
    ?.stripePaymentMethodId;

  // Wallets are not stored in Stripe — return from DB only
  const wallets = dbPaymentMethods
    .filter((pm) => pm.type !== PaymentType.CARD)
    .map((pm) => ({
      id: pm.id,
      type: pm.type,
      isDefault: pm.isDefault,
      createdAt: pm.createdAt,
    }));

  // Fetch card details from Stripe
  let cards: any[] = [];
  if (user?.stripeCustomerId) {
    const stripePms = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
    });

    // Merge Stripe card data with DB reference data
    cards = stripePms.data.map((pm) => ({
      id: dbPaymentMethods.find((d) => d.stripePaymentMethodId === pm.id)?.id,
      type: "CARD",
      stripePaymentMethodId: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expiryMonth: pm.card?.exp_month,
      expiryYear: pm.card?.exp_year,
      country: pm.card?.country,
      isDefault: pm.id === defaultPmId,
      createdAt: dbPaymentMethods.find((d) => d.stripePaymentMethodId === pm.id)
        ?.createdAt,
    }));
  }

  // Sort so default appears first
  return [...cards, ...wallets].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault),
  );
};

// ── set default payment method ────────────────────────

const setDefault = async (userId: string, paymentMethodId: string) => {
  const paymentMethod = await prisma.paymentMethod.findUnique({
    where: { id: paymentMethodId },
  });

  if (!paymentMethod) {
    throw new ApiError(httpStatus.NOT_FOUND, "Payment method not found.");
  }
  if (paymentMethod.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  }
  if (!paymentMethod.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Payment method is not active.");
  }
  if (paymentMethod.isDefault) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This is already your default payment method.",
    );
  }

  // Update Stripe customer default only for card type
  if (
    paymentMethod.type === PaymentType.CARD &&
    paymentMethod.stripePaymentMethodId
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (user?.stripeCustomerId) {
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethod.stripePaymentMethodId,
        },
      });
    }
  }

  // Unset previous default and set new one in a single transaction
  await prisma.$transaction([
    prisma.paymentMethod.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isDefault: true },
    }),
  ]);

  return { message: "Default payment method updated." };
};

// ── remove payment method ─────────────────────────────

const removePaymentMethod = async (
  userId: string,
  paymentMethodId: string,
) => {
  const paymentMethod = await prisma.paymentMethod.findUnique({
    where: { id: paymentMethodId },
  });

  if (!paymentMethod) {
    throw new ApiError(httpStatus.NOT_FOUND, "Payment method not found.");
  }
  if (paymentMethod.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  }
  if (!paymentMethod.isActive) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Payment method already removed.",
    );
  }

  // Detach card from Stripe customer
  if (
    paymentMethod.type === PaymentType.CARD &&
    paymentMethod.stripePaymentMethodId
  ) {
    try {
      await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
    } catch (err) {
      console.error("Stripe detach error:", err);
    }
  }

  // Soft delete — mark as inactive
  await prisma.paymentMethod.update({
    where: { id: paymentMethodId },
    data: { isActive: false, isDefault: false },
  });

  // If removed method was default, promote the next oldest to default
  if (paymentMethod.isDefault) {
    const nextDefault = await prisma.paymentMethod.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    if (nextDefault) {
      // Update Stripe customer default if next default is a card
      if (
        nextDefault.type === PaymentType.CARD &&
        nextDefault.stripePaymentMethodId
      ) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { stripeCustomerId: true },
        });

        if (user?.stripeCustomerId) {
          await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: {
              default_payment_method: nextDefault.stripePaymentMethodId,
            },
          });
        }
      }

      await prisma.paymentMethod.update({
        where: { id: nextDefault.id },
        data: { isDefault: true },
      });
    }
  }

  return { message: "Payment method removed." };
};

export const PaymentMethodServices = {
  createSetupIntent,
  addCard,
  addWallet,
  getMyPaymentMethods,
  setDefault,
  removePaymentMethod,
};