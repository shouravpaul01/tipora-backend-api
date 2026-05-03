import { Queue } from "bullmq";
import  { redisOptions } from "../../../shared/redis";


export const deleteUserQueue = new Queue("delete-user", {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 24 * 60 * 60 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
});