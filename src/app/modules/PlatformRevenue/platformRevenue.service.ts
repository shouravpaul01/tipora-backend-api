import httpStatus from "http-status";
import { Prisma } from "@prisma/client";

import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../../helpers/queryBuilder";

const getAllPlatformRevenues = async (
  query: Record<string, unknown>,
) => {
  const { from, to } = query;

  const filters: Prisma.PlatformRevenueWhereInput = {};

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

  const queryBuilder = new QueryBuilder(prisma.platformRevenue, query)
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

export const PlatformRevenueServices = {
  getAllPlatformRevenues,
  getSinglePlatformRevenue,
};