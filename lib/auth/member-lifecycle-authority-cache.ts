/**
 * P0-R2 — MEMBER LIFECYCLE AUTHORITY cache (not identity / not session-validity).
 *
 * Identity/session performance caches must not authorize product access
 * from a stale lifecycle snapshot after block/suspend/withdraw.
 *
 * Invalidation is mandatory on moderation transitions (see invalidateAllUserSessions
 * + invalidateMemberLifecycleAuthorityCaches).
 */

import type { MemberAccountProfileLike } from "@/lib/auth/member-account-state";

const TTL_MS = 5_000;

type Row = {
  status: string | null;
  deleted_at: string | null;
  expiresAt: number;
  /** Monotonic per-user bump on invalidate — readers may detect stale. */
  epoch: number;
};

type GlobalStore = {
  __samarketMemberLifecycleAuthorityCache?: Map<string, Row>;
  __samarketMemberLifecycleEpoch?: Map<string, number>;
};

function cacheMap(): Map<string, Row> {
  const g = globalThis as GlobalStore;
  if (!g.__samarketMemberLifecycleAuthorityCache) {
    g.__samarketMemberLifecycleAuthorityCache = new Map();
  }
  return g.__samarketMemberLifecycleAuthorityCache;
}

function epochMap(): Map<string, number> {
  const g = globalThis as GlobalStore;
  if (!g.__samarketMemberLifecycleEpoch) {
    g.__samarketMemberLifecycleEpoch = new Map();
  }
  return g.__samarketMemberLifecycleEpoch;
}

export function getMemberLifecycleEpoch(userId: string): number {
  return epochMap().get(userId.trim()) ?? 0;
}

export function peekMemberLifecycleAuthority(
  userId: string
): { hit: true; profile: MemberAccountProfileLike; epoch: number; ttlRemainingMs: number } | { hit: false } {
  const uid = userId.trim();
  if (!uid) return { hit: false };
  const row = cacheMap().get(uid);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cacheMap().delete(uid);
    return { hit: false };
  }
  const epoch = getMemberLifecycleEpoch(uid);
  if (row.epoch !== epoch) {
    cacheMap().delete(uid);
    return { hit: false };
  }
  return {
    hit: true,
    profile: { status: row.status, deleted_at: row.deleted_at },
    epoch: row.epoch,
    ttlRemainingMs: Math.max(0, row.expiresAt - Date.now()),
  };
}

export function setMemberLifecycleAuthority(
  userId: string,
  profile: MemberAccountProfileLike
): void {
  const uid = userId.trim();
  if (!uid) return;
  const epoch = getMemberLifecycleEpoch(uid);
  cacheMap().set(uid, {
    status: profile.status ?? null,
    deleted_at: profile.deleted_at ?? null,
    expiresAt: Date.now() + TTL_MS,
    epoch,
  });
  if (cacheMap().size > 4000) {
    const now = Date.now();
    for (const [k, v] of cacheMap()) {
      if (v.expiresAt <= now || v.epoch !== getMemberLifecycleEpoch(k)) cacheMap().delete(k);
    }
  }
}

/** Targeted invalidation — block/suspend/withdraw/restore must call this. */
export function invalidateMemberLifecycleAuthority(userId?: string): void {
  if (!userId?.trim()) {
    cacheMap().clear();
    epochMap().clear();
    return;
  }
  const uid = userId.trim();
  cacheMap().delete(uid);
  epochMap().set(uid, getMemberLifecycleEpoch(uid) + 1);
}

export const MEMBER_LIFECYCLE_AUTHORITY_CACHE_TTL_MS = TTL_MS;
