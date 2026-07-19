import { PrismaClient, TipStatus, WithdrawStatus } from "@prisma/client";


const prisma = new PrismaClient();

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

const weekdayLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short" }); // "Mon"
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short" }); // "Jan"

const round2 = (n: number) => Number(n.toFixed(2));

const getGrowthPercent = (current: number, previous: number): number => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round2(((current - previous) / previous) * 100);
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10); // "2026-07-19"
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // "2026-07"

type GrowthType = "users" | "tips" | "withdraws";

// ═══════════════════════════════════════════════
// DASHBOARD CARDS
// ═══════════════════════════════════════════════

const getDashboardCards = async () => {
  const [totalUsers, totalTips, totalWithdraws, revenueAgg] = await Promise.all([
    prisma.user.count({ where: { isDeleted: false } }),
    prisma.tip.count({ where: { status: TipStatus.COMPLETED } }),
    prisma.withdrawTransection.count({ where: { status: WithdrawStatus.COMPLETED } }),
    prisma.platformRevenue.aggregate({ _sum: { amount: true } }),
  ]);

  return {
    totalUsers,
    totalTips,
    totalWithdraws,
    totalPlatformRevenue: revenueAgg._sum.amount || 0,
  };
};

// ═══════════════════════════════════════════════
// REVENUE CHARTS — weekly (7d) / monthly (12m) / yearly (5y)
// ═══════════════════════════════════════════════

const getWeeklyRevenue = async () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const records = await prisma.platformRevenue.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { amount: true, createdAt: true },
  });

  const buckets = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    buckets.push({ key: dayKey(day), label: weekdayLabel(day), amount: 0 });
  }

  for (const r of records) {
    const bucket = buckets.find((b) => b.key === dayKey(r.createdAt));
    if (bucket) bucket.amount += r.amount;
  }

  return buckets.map(({ label, amount }) => ({ label, amount: round2(amount) }));
};

const getMonthlyRevenue = async () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const records = await prisma.platformRevenue.findMany({
    where: { createdAt: { gte: start } },
    select: { amount: true, createdAt: true },
  });

  const buckets= [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    buckets.push({ key: monthKey(d), label: monthLabel(d), amount: 0 });
  }

  for (const r of records) {
    const bucket = buckets.find((b) => b.key === monthKey(r.createdAt));
    if (bucket) bucket.amount += r.amount;
  }

  return buckets.map(({ label, amount }) => ({ label, amount: round2(amount) }));
};

const getYearlyRevenue = async () => {
  const now = new Date();
  const startYear = now.getFullYear() - 4;
  const start = new Date(startYear, 0, 1);

  const records = await prisma.platformRevenue.findMany({
    where: { createdAt: { gte: start } },
    select: { amount: true, createdAt: true },
  });

  const buckets = [];
  for (let i = 0; i < 5; i++) {
    buckets.push({ year: startYear + i, label: String(startYear + i), amount: 0 });
  }

  for (const r of records) {
    const bucket = buckets.find((b) => b.year === r.createdAt.getFullYear());
    if (bucket) bucket.amount += r.amount;
  }

  return buckets.map(({ label, amount }) => ({ label, amount: round2(amount) }));
};

const getRevenueCharts = async () => {
  const [weekly, monthly, yearly] = await Promise.all([
    getWeeklyRevenue(),
    getMonthlyRevenue(),
    getYearlyRevenue(),
  ]);

  return { weekly, monthly, yearly };
};

// ═══════════════════════════════════════════════
// GROWTH CHARTS — monthly count trend (last 12 months)
// for Users / Tips / Withdraws
// ═══════════════════════════════════════════════

const fetchGrowthRecords = async (type: GrowthType, start: Date) => {
  if (type === "users") {
    return prisma.user.findMany({
      where: { createdAt: { gte: start }, isDeleted: false },
      select: { createdAt: true },
    });
  }
  if (type === "tips") {
    return prisma.tip.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    });
  }
  return prisma.withdrawTransection.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true },
  });
};

const getMonthlyGrowth = async (type: GrowthType) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const records = await fetchGrowthRecords(type, start);

  const buckets = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    buckets.push({ key: monthKey(d), label: monthLabel(d), count: 0 });
  }

  for (const r of records) {
    const bucket = buckets.find((b) => b.key === monthKey(r.createdAt));
    if (bucket) bucket.count += 1;
  }

  return buckets.map(({ label, count }) => ({ label, count }));
};

const getGrowthCharts = async () => {
  const [users, tips, withdraws] = await Promise.all([
    getMonthlyGrowth("users"),
    getMonthlyGrowth("tips"),
    getMonthlyGrowth("withdraws"),
  ]);

  return { users, tips, withdraws };
};

// ═══════════════════════════════════════════════
// COMPARISON — current vs previous calendar month
// ═══════════════════════════════════════════════

const buildMetric = (current: number, previous: number) => ({
  current: round2(current),
  previous: round2(previous),
  growth: getGrowthPercent(current, previous),
});

const getComparison = async () => {
  const now = new Date();
  const currentStart = startOfMonth(now);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousEnd = currentStart;

  const [
    currentUsers,
    previousUsers,
    currentTips,
    previousTips,
    currentWithdraws,
    previousWithdraws,
    currentRevenueAgg,
    previousRevenueAgg,
  ] = await Promise.all([
    prisma.user.count({ where: { isDeleted: false, createdAt: { gte: currentStart } } }),
    prisma.user.count({ where: { isDeleted: false, createdAt: { gte: previousStart, lt: previousEnd } } }),

    prisma.tip.count({ where: { createdAt: { gte: currentStart } } }),
    prisma.tip.count({ where: { createdAt: { gte: previousStart, lt: previousEnd } } }),

    prisma.withdrawTransection.count({ where: { createdAt: { gte: currentStart } } }),
    prisma.withdrawTransection.count({ where: { createdAt: { gte: previousStart, lt: previousEnd } } }),

    prisma.platformRevenue.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: currentStart } },
    }),
    prisma.platformRevenue.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: previousStart, lt: previousEnd } },
    }),
  ]);

  return {
    users: buildMetric(currentUsers, previousUsers),
    tips: buildMetric(currentTips, previousTips),
    withdraws: buildMetric(currentWithdraws, previousWithdraws),
    revenue: buildMetric(currentRevenueAgg._sum.amount || 0, previousRevenueAgg._sum.amount || 0),
  };
};

// ═══════════════════════════════════════════════
// RECENT USERS — joined with wallet + last login
// ═══════════════════════════════════════════════

const getRecentUsers = async (limit = 10) => {
  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      photo: true,
      status: true,
      createdAt: true,
      wallet: { select: { totalEarned: true, availableBalance: true } },
      auth: { select: { lastLoginAt: true } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName || `${u.firstName} ${u.lastName}`,
    email: u.email,
    photo: u.photo,
    status: u.status,
    totalEarned: u.wallet?.totalEarned || 0,
    availableBalance: u.wallet?.availableBalance || 0,
    lastLoginAt: u.auth?.lastLoginAt || null,
    createdAt: u.createdAt,
  }));
};

// ═══════════════════════════════════════════════
// FULL OVERVIEW — single call, exact shape the
// frontend dashboard page consumes
// ═══════════════════════════════════════════════

const getDashboardOverview = async () => {
  const [cards, revenueCharts, growthCharts, comparison, recentUsers] = await Promise.all([
    getDashboardCards(),
    getRevenueCharts(),
    getGrowthCharts(),
    getComparison(),
    getRecentUsers(10),
  ]);

  return {
    cards,
    revenueCharts,
    growthCharts,
    comparison,
    recentUsers,
  };
};

export const DashboardService = {
  getDashboardCards,
  getRevenueCharts,
  getGrowthCharts,
  getComparison,
  getRecentUsers,
  getDashboardOverview,
};