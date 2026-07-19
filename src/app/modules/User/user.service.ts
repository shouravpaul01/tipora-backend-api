import httpStatus from "http-status";
import prisma from "../../../shared/prisma";

import { uploadFileToS3 } from "../../../helpers/uploadToS3";
import stripe from "../../../helpers/stripe";
import Stripe from "stripe";
import ApiError from "../../../errors/ApiErrors";
import { deleteUserQueue } from "./user.queue";
import { env } from "../../../config/env.config";
import QueryBuilder from "../../../helpers/queryBuilder";
import { UserRole, UserStatus } from "@prisma/client";

// ── get my profile ────────────────────────────────────

const getMe = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      isDeleted: false,
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
          last4: true,
          expMonth: true,
          expYear: true,
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

  // Current Month
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

  const [
    totalSentStats,
    totalReceivedStats,
    currentMonthSentStats,
    currentMonthReceivedStats,
  ] = await Promise.all([
    // Total Sent
    prisma.tip.aggregate({
      where: {
        senderId: userId,
        status: "COMPLETED",
      },
      _count: {
        id: true,
      },
      _sum: {
        totalAmount: true,
      },
    }),

    // Total Received
    prisma.tipRecipient.aggregate({
      where: {
        receiverId: userId,
        status: "COMPLETED",
      },
      _count: {
        id: true,
      },
      _sum: {
        amount: true,
        netAmount: true,
      },
    }),

    // Current Month Sent
    prisma.tip.aggregate({
      where: {
        senderId: userId,
        status: "COMPLETED",
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        totalAmount: true,
      },
    }),

    // Current Month Received
    prisma.tipRecipient.aggregate({
      where: {
        receiverId: userId,
        status: "COMPLETED",
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        amount: true,
        netAmount: true,
      },
    }),
  ]);

  let stripeAccount: any = null;

  if (user.stripeAccountId) {
    try {
      const [account, bankAccounts, cards, balance] = await Promise.all([
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

      stripeAccount = {
        id: account.id,
        email: account.email,
        country: account.country,
        businessType: account.business_type,

        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,

        balance: {
          available: balance.available.map((item) => ({
            amount: item.amount / 100,
            currency: item.currency,
          })),

          pending: balance.pending.map((item) => ({
            amount: item.amount / 100,
            currency: item.currency,
          })),
        },

        bankAccounts: bankAccounts.data.map((bank: any) => ({
          id: bank.id,
          bankName: bank.bank_name,
          last4: bank.last4,
          country: bank.country,
          currency: bank.currency,
          defaultForCurrency: bank.default_for_currency,
        })),

        cards: cards.data.map((card: any) => ({
          id: card.id,
          brand: card.brand,
          last4: card.last4,
          expMonth: card.exp_month,
          expYear: card.exp_year,
          country: card.country,
          currency: card.currency,
        })),
      };
    } catch (error) {
      console.error("Stripe fetch error:", error);
    }
  }

  return {
    ...user,

    tipStats: {
      sent: {
        total: {
          count: totalSentStats._count.id,
          amount: totalSentStats._sum.totalAmount ?? 0,
        },

        currentMonth: {
          count: currentMonthSentStats._count.id,
          amount: currentMonthSentStats._sum.totalAmount ?? 0,
        },
      },

      received: {
        total: {
          count: totalReceivedStats._count.id,
          grossAmount: totalReceivedStats._sum.amount ?? 0,
          netAmount: totalReceivedStats._sum.netAmount ?? 0,
        },

        currentMonth: {
          count: currentMonthReceivedStats._count.id,
          grossAmount: currentMonthReceivedStats._sum.amount ?? 0,
          netAmount: currentMonthReceivedStats._sum.netAmount ?? 0,
        },
      },
    },

    stripeAccount,
  };
};
const getAllUsers = async (query: Record<string, unknown>) => {
  const queryBuilder = new QueryBuilder(prisma.user, query)
    .search(["firstName", "lastName", "fullName", "email", "phone"])
    .rawFilter({
      role: UserRole.USER,
    })
    .filter()
    .sort()
    .paginate()
    .fields({
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      phone: true,
      photo: true,
      status: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      createdAt: true,
    })
    .include({
      auth: {
        select: {
          lastLoginAt: true,
        },
      },
      wallet: true,
    });

  const [data, meta] = await Promise.all([
    queryBuilder.execute(),
    queryBuilder.countTotal(),
  ]);

  return {
    meta,
    data,
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
const updateStatus = async (id: string, status: UserStatus) => {
  return prisma.user.update({
    where: {
      id,
    },
    data: {
      status,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      phone: true,
      status: true,
    },
  });
};
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
    refresh_url: `${env.FRONTEND_URL}/onboarding/refresh`,
    return_url: `${env.FRONTEND_URL}/onboarding/success`,
    type: "account_onboarding",
  });

  return {
    url: accountLink.url,
  };
};

// ── check onboarding status ─────────────────────────

const updateOnboardingStatus = async (
  userId: string | null,
  account: Stripe.Account | null,
) => {
  console.log("account", account);

  let stripeAccount = account;

  if (userId) {
    // userId আছে → DB থেকে stripeAccountId বের করো → Stripe থেকে fresh check
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeAccountId: true },
    });

    if (!user?.stripeAccountId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Stripe account not found for this user.",
      );
    }

    // Stripe থেকে live account data আনো
    stripeAccount = await stripe.accounts.retrieve(user.stripeAccountId);
  }

  const isVerified =
    stripeAccount?.details_submitted &&
    stripeAccount?.charges_enabled &&
    stripeAccount?.payouts_enabled;

  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { stripeAccountVerified: isVerified },
    });
  } else {
    await prisma.user.updateMany({
      where: { stripeAccountId: stripeAccount?.id },
      data: { stripeAccountVerified: isVerified },
    });
  }

  return {
    isVerified,
    detailsSubmitted: stripeAccount?.details_submitted,
    chargesEnabled: stripeAccount?.charges_enabled,
    payoutsEnabled: stripeAccount?.payouts_enabled,
  };
};

export const UserServices = {
  getMe,
  getAllUsers,

  getSingleUserDetails,
  updateMe,
  updateStatus,
  deleteMe,
  createOnboardingLink,
  updateOnboardingStatus,
};
