import { Queue } from "bullmq";
import bullmqRedis from "../../shared/bullmqRedis";

export const emailQueue = new Queue("emailQueue", {
  connection: bullmqRedis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
