import Redis, { RedisOptions } from 'ioredis';

export const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  retryStrategy: (times: number) =>
    times > 5 ? undefined : Math.min(times * 100, 3000),
  connectTimeout: 10000,
  keepAlive: 30000,
  maxRetriesPerRequest: null,
};

const redis = new Redis(redisOptions);
redis.on('connect', () =>
  console.log('✅ Redis Push connected successfully from notification'),
);
redis.on('error', err => console.error('❌ Redis Push error:', err));
export default redis;
