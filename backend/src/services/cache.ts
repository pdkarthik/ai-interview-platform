import { createClient } from "redis";

const TTL_SECONDS = 600;
const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

let redisClient: ReturnType<typeof createClient> | null = null;
let redisReady = false;

if (process.env.REDIS_URL) {
  redisClient = createClient({ url: process.env.REDIS_URL });

  redisClient.on("error", (error) => {
    console.error("Redis error:", error.message);
    redisReady = false;
  });

  redisClient
    .connect()
    .then(() => {
      redisReady = true;
      console.log("Redis connected");
    })
    .catch((error) => {
      console.error("Redis unavailable; using memory cache:", error.message);
    });
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (redisReady && redisClient) {
    try {
      const value = await redisClient.get(key);
      if (value) return JSON.parse(value) as T;
    } catch {
      redisReady = false;
    }
  }

  const entry = memoryCache.get(key);

  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value as T;
}

export async function setCache<T>(key: string, value: T): Promise<void> {
  if (redisReady && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), {
        EX: TTL_SECONDS,
      });
      return;
    } catch {
      redisReady = false;
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + TTL_SECONDS * 1000,
  });
}
