/**
 * B4 / D-3 — cross-isolate member lifecycle snapshot (Upstash Redis).
 * Wall-clock TTL is not used — moderation deletes the key (epoch bump locally).
 * Redis missing → callers keep process-local 5s cache only.
 */

import { getOptionalRateLimitRedis } from "@/lib/http/rate-limit-redis";
import type { MemberAccountProfileLike } from "@/lib/auth/member-account-state";

const KEY_PREFIX = "sm:mla:";

export type MemberLifecycleSharedSnapshot = {
  status: string | null;
  deleted_at: string | null;
  epoch: number;
};

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId.trim()}`;
}

export function memberLifecycleSharedStorageKey(userId: string): string {
  return storageKey(userId);
}

export async function readMemberLifecycleAuthorityShared(
  userId: string
): Promise<MemberLifecycleSharedSnapshot | null> {
  const uid = userId.trim();
  if (!uid) return null;
  const redis = getOptionalRateLimitRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | MemberLifecycleSharedSnapshot>(storageKey(uid));
    if (raw == null) return null;
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as MemberLifecycleSharedSnapshot)
        : raw;
    if (!parsed || typeof parsed !== "object") return null;
    const epoch = Number(parsed.epoch);
    if (!Number.isFinite(epoch)) return null;
    return {
      status: parsed.status ?? null,
      deleted_at: parsed.deleted_at ?? null,
      epoch,
    };
  } catch {
    return null;
  }
}

export async function writeMemberLifecycleAuthorityShared(
  userId: string,
  profile: MemberAccountProfileLike,
  epoch: number
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const redis = getOptionalRateLimitRedis();
  if (!redis) return;
  const payload: MemberLifecycleSharedSnapshot = {
    status: profile.status ?? null,
    deleted_at: profile.deleted_at ?? null,
    epoch,
  };
  try {
    await redis.set(storageKey(uid), JSON.stringify(payload));
  } catch {
    /* best-effort */
  }
}

export async function deleteMemberLifecycleAuthorityShared(userId?: string): Promise<void> {
  const redis = getOptionalRateLimitRedis();
  if (!redis) return;
  try {
    if (!userId?.trim()) return;
    await redis.del(storageKey(userId.trim()));
  } catch {
    /* best-effort */
  }
}
