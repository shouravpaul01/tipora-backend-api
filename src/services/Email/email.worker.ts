import { Worker, Job } from "bullmq";
import bullmqRedis from "../../shared/bullmqRedis";
import emailSender from "../../helpers/emailSender";

export const emailWorker = new Worker(
  "emailQueue",
  async (job: Job) => {
    const { to, subject, html } = job.data;
    console.log(`[BullMQ Worker] Processing email job ${job.id} for ${to}`);
    await emailSender({ to, subject, html });
    console.log(`[BullMQ Worker] Successfully sent email for job ${job.id}`);
  },
  {
    connection: bullmqRedis as any,
    concurrency: 5,
  }
);

emailWorker.on("failed", (job, err) => {
  console.error(`[BullMQ Worker] Email job ${job?.id} failed:`, err);
});

emailWorker.on("error", (err) => {
  console.error(`[BullMQ Worker] Error:`, err);
});
