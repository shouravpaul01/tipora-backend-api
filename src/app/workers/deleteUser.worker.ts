import { Worker, Job } from "bullmq";

import prisma from "../../shared/prisma";
import { redisOptions } from "../../shared/redis";

interface DeleteUserJobData {
  userId: string;
}

const processDeleteUser = async (job: Job<DeleteUserJobData>) => {
  const { userId } = job.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) return { skipped: true, userId };

  // Tips this user sent (needed to clean up their recipient rows + platform revenue refs)
  const sentTips = await prisma.tip.findMany({
    where: { senderId: userId },
    select: { id: true },
  });
  const sentTipIds = sentTips.map((t) => t.id);

  const withdrawTransections = await prisma.withdrawTransection.findMany({
    where: { userId },
    select: { id: true },
  });
  const withdrawIds = withdrawTransections.map((w) => w.id);

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId } }),

    // Platform revenue rows referencing this user's withdraws (loose reference, not a real FK)
    prisma.platformRevenue.deleteMany({
      where: { referenceId: { in: withdrawIds } },
    }),

    prisma.withdrawTransection.deleteMany({ where: { userId } }),
    prisma.wallet.deleteMany({ where: { userId } }),

    // Tip recipient rows where this user was a RECEIVER of someone else's tip
    prisma.tipRecipient.deleteMany({ where: { receiverId: userId } }),

    // Tip recipient rows belonging to tips THIS user sent (must go before deleting the Tip)
    prisma.tipRecipient.deleteMany({
      where: { tipId: { in: sentTipIds } },
    }),

    prisma.transaction.deleteMany({
      where: { tip: { senderId: userId } },
    }),
    prisma.tip.deleteMany({ where: { senderId: userId } }),

    prisma.paymentMethod.deleteMany({ where: { userId } }),
    prisma.userAuth.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return { deleted: true, userId };
};

export const deleteUserWorker = new Worker<DeleteUserJobData>(
  "delete-user",
  processDeleteUser,
  {
    connection: redisOptions,
    concurrency: 2,
  },
);

deleteUserWorker.on("completed", (job) => {
  console.log(`[DeleteWorker] Job ${job.id} completed:`, job.returnvalue);
});

deleteUserWorker.on("failed", (job, error) => {
  console.error(`[DeleteWorker] Job ${job?.id} failed:`, error.message);
});