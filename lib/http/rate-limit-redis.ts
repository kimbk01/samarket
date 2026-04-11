import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

let redisSingleton: Redis | null | undefined;

/** `Redis.fromEnv()` 호출 전에 검사 — 비어 있으면 클라이언트를 만들지 않아 터미널 스팸 로그를 막는다 */
function hasRateLimitRedisEnv(): boolean {
  const upstash =
    Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const vercelKv =
    Boolean(process.env.KV_REST_API_URL?.trim()) && Boolean(process.env.KV_REST_API_TOKEN?.trim());
  return upstash || vercelKv;
}

/**
 * Upstash REST (`UPSTASH_REDIS_REST_*` 또는 Vercel KV `KV_REST_API_*`)가 있으면 공유 카운터.
 * 없거나 `Redis.fromEnv()` 실패 시 null → `enforceRateLimit`은 인메모리로 폴백.
 */
export function getOptionalRateLimitRedis(): Redis | null {
  if (redisSingleton !== undefined) return redisSingleton;
  if (!hasRateLimitRedisEnv()) {
    redisSingleton = null;
    return null;
  }
  try {
    redisSingleton = Redis.fromEnv();
  } catch {
    redisSingleton = null;
  }
  return redisSingleton;
}

const KEY_PREFIX = "sm:rl:";

export function rateLimitRedisStorageKey(logicalKey: string): string {
  if (logicalKey.length <= 220) return `${KEY_PREFIX}${logicalKey}`;
  const h = createHash("sha256").update(logicalKey, "utf8").digest("hex");
  return `${KEY_PREFIX}h:${h}`;
}

/** INCR 후 첫 카운트일 때만 PEXPIRE — 윈도당 limit회까지 허용(INCR 값이 limit 초과 시 거부) */
export async function rateLimitIncrCount(redis: Redis, storageKey: string, windowMs: number): Promise<number> {
  const count = await redis.incr(storageKey);
  if (count === 1) {
    await redis.pexpire(storageKey, windowMs);
  }
  return count;
}

export async function rateLimitPttlMs(redis: Redis, storageKey: string): Promise<number> {
  return redis.pttl(storageKey);
}
