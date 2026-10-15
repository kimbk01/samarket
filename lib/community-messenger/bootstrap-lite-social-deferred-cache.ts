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

/**
 * 사용자별 social graph 쓰기 세대. invalidate 마다 증가한다.
 * invalidate 이전에 시작된 로더(백그라운드 hydrate·full bootstrap)가 invalidate 이후 stale snapshot 을
 * 다시 store 하지 못하게 한다 (차단/숨김/친구 삭제 직후 재등장 방지).
 */
const generationByUser = new Map<string, number>();

export function peekBootstrapLiteSocialDeferredGeneration(userId: string): number {
  return generationByUser.get(userId.trim()) ?? 0;
}

/**
 * 친구 추가/삭제·차단/해제·숨김 등 social graph 변경 — stale accepted/hidden/blocked 방지.
 * 프로세스(인스턴스) 로컬 캐시만 지운다 — 다른 인스턴스는 TTL 로 수렴.
 */
export function invalidateBootstrapLiteSocialDeferred(userId: string): void {
  const key = userId.trim();
  if (!key) return;
  cache.delete(key);
  generationByUser.set(key, (generationByUser.get(key) ?? 0) + 1);
  if (generationByUser.size > MAX_ENTRIES * 4) {
    const first = generationByUser.keys().next().value;
    if (first && first !== key) generationByUser.delete(first);
  }
}

/** 관계 쓰기는 양쪽 그래프(친구 상호 정리 등)를 바꾸므로 owner·target 모두 무효화한다. */
export function invalidateBootstrapLiteSocialDeferredForPair(
  ownerUserId: string,
  targetUserId: string | null | undefined
): void {
  invalidateBootstrapLiteSocialDeferred(ownerUserId);
  if (targetUserId && targetUserId.trim() && targetUserId.trim() !== ownerUserId.trim()) {
    invalidateBootstrapLiteSocialDeferred(targetUserId);
  }
}

/**
 * `capturedGeneration` 이 주어지면 그 사이 invalidate 가 있었을 때 store 를 건너뛴다(stale write 방지).
 * @returns 실제로 저장했는지
 */
export function storeBootstrapLiteSocialDeferredIfCurrent(
  userId: string,
  snapshot: BootstrapLiteSocialDeferredSnapshot,
  capturedGeneration: number
): boolean {
  if (peekBootstrapLiteSocialDeferredGeneration(userId) !== capturedGeneration) return false;
  storeBootstrapLiteSocialDeferred(userId, snapshot);
  return true;
}

export function scheduleBootstrapLiteSocialGraphBackgroundHydration(
  userId: string,
  loader: () => Promise<BootstrapLiteSocialDeferredSnapshot>
): void {
  if (backgroundInflight.has(userId)) return;
  const capturedGeneration = peekBootstrapLiteSocialDeferredGeneration(userId);
  const run = loader()
    .then((snapshot) => {
      storeBootstrapLiteSocialDeferredIfCurrent(userId, snapshot, capturedGeneration);
    })
    .catch(() => {
      /* 첫 페인트는 이미 [] — 백그라운드 실패는 무시 */
    })
    .finally(() => {
      backgroundInflight.delete(userId);
    });
  backgroundInflight.set(userId, run);
}
