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

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.withdrawRequest.deleteMany({ where: { userId } }),
    prisma.wallet.deleteMany({ where: { userId } }),
    prisma.transaction.deleteMany({
      where: { tip: { senderId: userId } },
    }),
    prisma.tip.deleteMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    }),
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