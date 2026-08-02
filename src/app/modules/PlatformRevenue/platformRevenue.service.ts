import httpStatus from "http-status";
import { Prisma } from "@prisma/client";

import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../../helpers/queryBuilder";

const getAllPlatformRevenues = async (
  query: Record<string, unknown>,
) => {
 const {
    fromDate,
    toDate,
    ...filterQuery
  } = query;

  const filters: Prisma.PlatformRevenueWhereInput = {};

  if (fromDate || toDate) {
    filters.createdAt = {};

    if (fromDate) {
      filters.createdAt.gte = new Date(fromDate as string);
    }

    if (toDate) {
      const endDate = new Date(toDate as string);
      endDate.setHours(23, 59, 59, 999);
      filters.createdAt.lte = endDate;
    }
  }

  const queryBuilder = new QueryBuilder(prisma.platformRevenue, filterQuery)
    .search(["referenceType"])
    .filter()
    .rawFilter(filters)
    .sort()
    .paginate()
    .fields({
      id: true,
      source: true,
      amount: true,
      currency: true,
      referenceId: true,
      referenceType: true,
      createdAt: true,
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

const getSinglePlatformRevenue = async (id: string) => {
  const revenue = await prisma.platformRevenue.findUnique({
    where: {
      id,
    },
  });

  if (!revenue) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Platform revenue not found.",
    );
  }

  return revenue;
};
const getPlatformRevenueSummary = async () => {
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
    todayRevenue,
    weeklyRevenue,
    monthlyRevenue,
    yearlyRevenue,
    totalRevenue,
  ] = await Promise.all([
    prisma.platformRevenue.aggregate({
      where: {
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.platformRevenue.aggregate({
      where: {
        createdAt: {
          gte: weekStart,
        },
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.platformRevenue.aggregate({
      where: {
        createdAt: {
          gte: monthStart,
        },
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.platformRevenue.aggregate({
      where: {
        createdAt: {
          gte: yearStart,
        },
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.platformRevenue.aggregate({
      _sum: {
        amount: true,
      },
    }),
  ]);

  return {
    today: Number(todayRevenue._sum.amount ?? 0),
    weekly: Number(weeklyRevenue._sum.amount ?? 0),
    monthly: Number(monthlyRevenue._sum.amount ?? 0),
    yearly: Number(yearlyRevenue._sum.amount ?? 0),
    total: Number(totalRevenue._sum.amount ?? 0),
  };
};
export const PlatformRevenueServices = {
  getAllPlatformRevenues,
  getSinglePlatformRevenue,
  getPlatformRevenueSummary,
};