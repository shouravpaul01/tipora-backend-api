import Stripe from "stripe";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { env } from "../../../config/env.config";
import { PaymentType } from "@prisma/client";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// ── Helper: get or create Stripe Customer ─────────────
const getOrCreateStripeCustomer = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true, stripeCustomerId: true },
  });
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found.");

  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    
    name: `${user.firstName} ${user.lastName}`,
    metadata: { userId },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
};

// ── Setup Intent for front-end ───────────────────────
const createSetupIntent = async (userId: string) => {
  const stripeCustomerId = await getOrCreateStripeCustomer(userId);
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
  });
  return { clientSecret: setupIntent.client_secret };
};

// ── Add Card ─────────────────────────────────────────
const addCard = async (userId: string, stripePaymentMethodId: string) => {
  const stripeCustomerId = await getOrCreateStripeCustomer(userId);

  // Prevent duplicates
  const existingPm = await prisma.paymentMethod.findFirst({
    where: { userId, stripePaymentMethodId, isActive: true },
  });
  if (existingPm) throw new ApiError(httpStatus.CONFLICT, "This card is already added.");

  // Attach to Stripe
  await stripe.paymentMethods.attach(stripePaymentMethodId, { customer: stripeCustomerId });

  // Update Stripe: set this new card as default
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: stripePaymentMethodId },
  });

  // Unset previous default cards in DB
  await prisma.paymentMethod.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false },
  });

  const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId);

  // Create new payment method in DB
  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      userId,
      type: PaymentType.CARD,
      stripePaymentMethodId,
      isDefault: true,  // Always default
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      displayName: `${pm.card?.brand} •••• ${pm.card?.last4}`,
     
    },
  });

  return {
    id: paymentMethod.id,
    type: paymentMethod.type,
    stripePaymentMethodId,
    brand: paymentMethod.brand,
    last4: paymentMethod.last4,
    expMonth: paymentMethod.expMonth,
    expYear: paymentMethod.expYear,
    isDefault: paymentMethod.isDefault,
    displayName: paymentMethod.displayName,
  };
};
// ── Add Wallet (Apple Pay / Google Pay) ─────────────
const addWallet = async (
  userId: string,
  payload: { type: "APPLE_PAY" | "GOOGLE_PAY" }
) => {
  // Check if wallet type already exists
  const duplicate = await prisma.paymentMethod.findFirst({
    where: { userId, type: payload.type as PaymentType, isActive: true },
  });
  if (duplicate) throw new ApiError(httpStatus.CONFLICT, `${payload.type} already added.`);

  // Unset previous default wallets
  await prisma.paymentMethod.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false },
  });

  // Create new wallet as default
  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      userId,
      type: payload.type as PaymentType,
      walletType: payload.type.toLowerCase(),
      isDefault: true,
      displayName: payload.type === "APPLE_PAY" ? "Apple Pay" : "Google Pay",
    },
  });

  return paymentMethod;
};

// ── Get My Payment Methods ───────────────────────────
const getMyPaymentMethods = async (userId: string) => {
  const dbMethods = await prisma.paymentMethod.findMany({ where: { userId, isActive: true }, orderBy: { isDefault: "desc" } });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });

  const cards: any[] = [];
  if (user?.stripeCustomerId) {
    const stripePms = await stripe.paymentMethods.list({ customer: user.stripeCustomerId, type: "card" });
    for (const pm of stripePms.data) {
      const dbPm = dbMethods.find((d) => d.stripePaymentMethodId === pm.id);
      if (!dbPm) continue;
      cards.push({
        id: dbPm.id,
        type: "CARD",
        stripePaymentMethodId: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
        isDefault: dbPm.isDefault,
        displayName: dbPm.displayName,
      });
    }
  }

  const wallets = dbMethods.filter((d) => d.type !== PaymentType.CARD);
  return [...cards, ...wallets].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
};

// ── Set Default Payment Method ───────────────────────
const setDefault = async (userId: string, paymentMethodId: string) => {
  const paymentMethod = await prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
  if (!paymentMethod) throw new ApiError(httpStatus.NOT_FOUND, "Payment method not found.");
  if (paymentMethod.userId !== userId) throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  if (!paymentMethod.isActive) throw new ApiError(httpStatus.BAD_REQUEST, "Payment method is inactive.");
  if (paymentMethod.isDefault) throw new ApiError(httpStatus.BAD_REQUEST, "Already default.");

  if (paymentMethod.type === PaymentType.CARD && paymentMethod.stripePaymentMethodId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
    if (user?.stripeCustomerId) {
      await stripe.customers.update(user.stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethod.stripePaymentMethodId } });
    }
  }

  await prisma.$transaction([
    prisma.paymentMethod.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
    prisma.paymentMethod.update({ where: { id: paymentMethodId }, data: { isDefault: true } }),
  ]);

  return { message: "Default payment method updated." };
};

// ── Remove Payment Method ───────────────────────────
const removePaymentMethod = async (userId: string, paymentMethodId: string) => {
  const paymentMethod = await prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
  if (!paymentMethod) throw new ApiError(httpStatus.NOT_FOUND, "Payment method not found.");
  if (paymentMethod.userId !== userId) throw new ApiError(httpStatus.FORBIDDEN, "Access denied.");
  if (!paymentMethod.isActive) throw new ApiError(httpStatus.BAD_REQUEST, "Already removed.");

  if (paymentMethod.type === PaymentType.CARD && paymentMethod.stripePaymentMethodId) {
    try { await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId); } catch (err) { console.error("Stripe detach error:", err); }
  }

  await prisma.paymentMethod.update({ where: { id: paymentMethodId }, data: { isActive: false, isDefault: false } });

  if (paymentMethod.isDefault) {
    const nextDefault = await prisma.paymentMethod.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: "asc" } });
    if (nextDefault) {
      if (nextDefault.type === PaymentType.CARD && nextDefault.stripePaymentMethodId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
        if (user?.stripeCustomerId) await stripe.customers.update(user.stripeCustomerId, { invoice_settings: { default_payment_method: nextDefault.stripePaymentMethodId } });
      }
      await prisma.paymentMethod.update({ where: { id: nextDefault.id }, data: { isDefault: true } });
    }
  }

  return { message: "Payment method removed." };
};
const getStripeKey=()=>{
return {
  stripeSecretKey:env.STRIPE_SECRET_KEY
}
}
export const PaymentMethodServices = {
  createSetupIntent,
  addCard,
  addWallet,
  getMyPaymentMethods,
  setDefault,
  removePaymentMethod,
  getStripeKey
};