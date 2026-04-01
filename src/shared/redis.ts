import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 3) {
      throw new Error("Redis connection failed after 3 retries");
    }
    return Math.min(times * 200, 1000);
  },
});

redis.on("connect", () => console.log("Redis successfully  connected"));
redis.on("error", (err) => console.error("Redis error:", err));

export default redis;