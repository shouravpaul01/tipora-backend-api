import httpStatus from "http-status";
import prisma from "../../../shared/prisma";

import { uploadFileToS3 } from "../../../helpers/uploadToS3";
import stripe from "../../../helpers/stripe";
import Stripe from "stripe";
import ApiError from "../../../errors/ApiErrors";
import { deleteUserQueue } from "./user.queue";

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
      auth: {
        select: {
          passwordChangedAt: true,
        },
      },
      paymentMethods: {
        where: {
          isDefault: true,
        },
        select: {
          id: true,
          type: true,
          brand: true,
          walletType: true,
          displayName: true,
        },
      },
      wallet: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  // ── Current month date range ───────────────────────────────────
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  // ── All tip stats in parallel ──────────────────────────────────
  const [
    totalSentStats,
    totalReceivedStats,
    currentMonthSentStats,
    currentMonthReceivedStats,
  ] = await Promise.all([
    // Overall sent — count + amount
    prisma.tip.aggregate({
      where: { senderId: userId, status: "COMPLETED" },
      _count: { id: true },
      _sum: { amount: true },
    }),
    // Overall received — count + amount
    prisma.tip.aggregate({
      where: { receiverId: userId, status: "COMPLETED" },
      _count: { id: true },
      _sum: { amount: true },
    }),
    // Current month sent — count + amount
    prisma.tip.aggregate({
      where: {
        senderId: userId,
        status: "COMPLETED",
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _count: { id: true },
      _sum: { amount: true },
    }),
    // Current month received — count + amount
    prisma.tip.aggregate({
      where: {
        receiverId: userId,
        status: "COMPLETED",
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _count: { id: true },
      _sum: { amount: true },
    }),
  ]);

  let stripeAccountDetails: any = null;

  if (user.stripeAccountId) {
    try {
      const [account, externalAccounts, cards, balance] = await Promise.all([
        stripe.accounts.retrieve(user.stripeAccountId),
        stripe.accounts.listExternalAccounts(user.stripeAccountId, {
          object: "bank_account",
          limit: 10,
        }),
        stripe.accounts.listExternalAccounts(user.stripeAccountId, {
          object: "card",
          limit: 10,
        }),
        stripe.balance.retrieve({
          stripeAccount: user.stripeAccountId,
        }),
      ]);

      const availableBalance = balance.available.map((b) => ({
        amount: b.amount / 100,
        currency: b.currency,
      }));

      const pendingBalance = balance.pending.map((b) => ({
        amount: b.amount / 100,
        currency: b.currency,
      }));

      stripeAccountDetails = {
        id: account.id,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        businessType: account.business_type,
        country: account.country,
        email: account.email,
        balance: {
          available: availableBalance,
          pending: pendingBalance,
        },
        bankAccounts: externalAccounts.data.map((b: any) => ({
          id: b.id,
          bankName: b.bank_name,
          last4: b.last4,
          currency: b.currency,
          country: b.country,
          defaultForCurrency: b.default_for_currency,
        })),
        cards: cards.data.map((c: any) => ({
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
    tipStats: {
      sent: {
        total: {
          count: totalSentStats._count.id,
          amount: totalSentStats._sum.amount ?? 0,
        },
        currentMonth: {
          count: currentMonthSentStats._count.id,
          amount: currentMonthSentStats._sum.amount ?? 0,
        },
      },
      received: {
        total: {
          count: totalReceivedStats._count.id,
          amount: totalReceivedStats._sum.amount ?? 0,
        },
        currentMonth: {
          count: currentMonthReceivedStats._count.id,
          amount: currentMonthReceivedStats._sum.amount ?? 0,
        },
      },
    },
    stripeAccount: stripeAccountDetails,
  };
};
const getSingleUserDetails = async (userId: string) => {
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

  return user;
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

const deleteMe = async (userId: string, res: any) => {
  const timestamp = Date.now();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      isDeleted: true,
      status: "BLOCKED",
      email: `deleted_${timestamp}_${userId}@deleted.com`,
      phone: `deleted_${timestamp}_${userId}`,

      fcmToken: null,
    },
  });
  // Clear session immediately
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  // Push permanent deletion to background — no delay, runs immediately
  // jobId prevents duplicate jobs if called twice
  await deleteUserQueue.add(
    "permanent-delete",
    { userId },
    { jobId: `delete-user-${userId}` },
  );

  return { message: "Account deleted successfully." };
};
const createOnboardingLink = async (userId: string) => {
  const user = await prisma.user.findUnique({
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

const updateOnboardingStatus = async (account: Stripe.Account) => {
  console.log("account", account);
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
  getSingleUserDetails,
  updateMe,
  deleteMe,
  createOnboardingLink,
  updateOnboardingStatus,
};
