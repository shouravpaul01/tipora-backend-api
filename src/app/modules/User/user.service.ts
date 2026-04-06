import httpStatus from "http-status";
import prisma from "../../../shared/prisma";

import { uploadFileToS3 } from "../../../helpers/uploadToS3";
import stripe from "../../../helpers/stripe";
import Stripe from "stripe";
import ApiError from "../../../errors/ApiErrors";

// ── get my profile ────────────────────────────────────

const getMe = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      phone: true,
      photo: true,
      bio: true,
      role: true,
      status: true,
      stripeAccountId: true,
      stripeAccountVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  let stripeAccountDetails: any = null;

  if (user.stripeAccountId) {
    try {
      const account = await stripe.accounts.retrieve(user.stripeAccountId);

      // Fetch external accounts (bank + cards)
      const externalAccounts = await stripe.accounts.listExternalAccounts(
        user.stripeAccountId,
        { object: "bank_account", limit: 10 },
      );

      const cards = await stripe.accounts.listExternalAccounts(
        user.stripeAccountId,
        { object: "card", limit: 10 },
      );

      stripeAccountDetails = {
        id: account.id,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        businessType: account.business_type,
        country: account.country,
        email: account.email,
        bankAccounts: externalAccounts.data.map((b:any) => ({
          id: b.id,
          bankName: b.bank_name,
          last4: b.last4,
          currency: b.currency,
          country: b.country,
          defaultForCurrency: b.default_for_currency,
        })),
        cards: cards.data.map((c:any) => ({
          id: c.id,
          brand: c.brand,
          last4: c.last4,
          expMonth: c.exp_month,
          expYear: c.exp_year,
          currency: c.currency,
          country: c.country,
        })),
      };
    } catch (err) {
      console.error("Stripe fetch error:", err);
    }
  }

  return {
    ...user,
    stripeAccount: stripeAccountDetails,
  };
};


// ── update my profile ─────────────────────────────────

const updateMe = async (
  userId: string,
  file: Express.Multer.File | undefined,
  payload: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    bio?: string;
  },
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  // ── photo upload ──────────────────────────────────
  let photoUrl: string | undefined;
  if (file) {
    const { fileUrl } = await uploadFileToS3(file);
    photoUrl = fileUrl;
  }

  const firstName = payload.firstName ?? user.firstName;
  const lastName = payload.lastName ?? user.lastName;
  const fullName = `${firstName} ${lastName}`;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...payload,
      fullName,
      ...(photoUrl && { photo: photoUrl }),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      phone: true,
      photo: true,
      bio: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updated;
};
// ── delete my account ─────────────────────────────────

const deleteMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  // soft delete 
  await prisma.user.update({
    where: { id: userId },
    data: {
      isDeleted: true,
      status: "BLOCKED",
      fcmToken: null,
    },
  });

  return { message: "Account deleted successfully." };
};
const createOnboardingLink = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  let accountId = user.stripeAccountId;

  // ── create stripe account if not exists ────────────
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
    });

    accountId = account.id;

    await prisma.user.update({
      where: { id: userId },
      data: {
        stripeAccountId: accountId,
      },
    });
  }

  // ── create onboarding link ─────────────────────────
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.FRONTEND_URL}/onboarding/refresh`,
    return_url: `${process.env.FRONTEND_URL}/onboarding/success`,
    type: "account_onboarding",
  });

  return {
    url: accountLink.url,
  };
};

// ── check onboarding status ─────────────────────────

const updateOnboardingStatus =  async (account: Stripe.Account) => {
  console.log("account",account)
  const isVerified =
    account.details_submitted &&
    account.charges_enabled &&
    account.payouts_enabled;

  await prisma.user.updateMany({
    where: {
      stripeAccountId: account.id,
    },
    data: {
      stripeAccountVerified: isVerified,
    },
  });
   return {
    isVerified,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };
};
 

export const UserServices = {
  getMe,
  updateMe,
  deleteMe,
  createOnboardingLink,
  updateOnboardingStatus
};