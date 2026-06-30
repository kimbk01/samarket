/**
 * `?lite=1` 첫 페인트: 친구·요청·팔로우 등은 네트워크 대신 프로세스 캐시 또는 `[]`.
 * full 부트스트랩·백그라운드 hydrate 가 `store` 로 채운다.
 *
 * @see `bootstrap-lite-policy.ts` — MESSENGER_BOOTSTRAP_LITE_SKIP_SOCIAL_GRAPH
 */

import type { CommunityFriendRequestAcceptedRow } from "@/lib/community-messenger/bootstrap-lite-social-types";

export type BootstrapLiteSocialDeferredSnapshot = {
  acceptedFriendRows: CommunityFriendRequestAcceptedRow[];
  favoriteFriendIds: string[];
  followingIds: string[];
  hiddenIds: string[];
  blockedIds: string[];
  requestRows: Array<{
    id: string;
    requester_id: string;
    addressee_id: string;
    status: string;
    created_at: string;
  }>;
};

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 500;

type CacheEntry = {
  snapshot: BootstrapLiteSocialDeferredSnapshot;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const backgroundInflight = new Map<string, Promise<void>>();

function prune(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (!first) break;
    cache.delete(first);
  }
}

export type PeekBootstrapLiteSocialDeferredResult = {
  snapshot: BootstrapLiteSocialDeferredSnapshot | null;
  source: "cache" | "empty";
  peekMs: number;
};

export function peekBootstrapLiteSocialDeferred(userId: string): PeekBootstrapLiteSocialDeferredResult {
  const t0 = performance.now();
  const now = Date.now();
  prune(now);
  const entry = cache.get(userId);
  if (entry && entry.expiresAt > now) {
    return {
      snapshot: entry.snapshot,
      source: "cache",
      peekMs: Math.round(performance.now() - t0),
    };
  }
  return {
    snapshot: null,
    source: "empty",
    peekMs: Math.round(performance.now() - t0),
  };
}

export function storeBootstrapLiteSocialDeferred(
  userId: string,
  snapshot: BootstrapLiteSocialDeferredSnapshot
): void {
  const now = Date.now();
  prune(now);
  cache.set(userId, { snapshot, expiresAt: now + TTL_MS });
}

/** 친구 수락/거절 등 social graph 변경 — stale accepted rows 방지 */
export function invalidateBootstrapLiteSocialDeferred(userId: string): void {
  const key = userId.trim();
  if (!key) return;
  cache.delete(key);
}

export function scheduleBootstrapLiteSocialGraphBackgroundHydration(
  userId: string,
  loader: () => Promise<BootstrapLiteSocialDeferredSnapshot>
): void {
  if (backgroundInflight.has(userId)) return;
  const run = loader()
    .then((snapshot) => {
      storeBootstrapLiteSocialDeferred(userId, snapshot);
    })
    .catch(() => {
      /* 첫 페인트는 이미 [] — 백그라운드 실패는 무시 */
    })
    .finally(() => {
      backgroundInflight.delete(userId);
    });
  backgroundInflight.set(userId, run);
}
