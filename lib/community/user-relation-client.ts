import { getCurrentUser } from "@/lib/auth/get-current-user";
import { pruneByAtMaxAgeAndMaxSize } from "@/lib/http/memory-map-prune";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type CommunityUserRelationSnapshot = {
  following: boolean | null;
  blocked: boolean | null;
};

const MIN_FETCH_GAP_MS = 5_000;
const RELATION_CACHE_MAX_AGE_MS = 10 * 60_000;
const RELATION_CACHE_MAX_KEYS = 200;
const relationCache = new Map<string, { at: number; value: CommunityUserRelationSnapshot }>();
/** 무효화 세대 — 무효화 뒤에 끝난 이전 읽기는 캐시에 쓰지 않는다(관심이웃 재감사 2) */
const relationGeneration = new Map<string, number>();

/**
 * 캐시·세대 키 = 지금 회원 + 대상 — 계정이 바뀐 뒤 이전 계정의 관계 값을 돌려주지 않는다(감사 D6, 설계 v2 §5-2).
 * 회원을 모르면 `guest` 로 구분.
 */
function relationKey(targetUserId: string) {
  const viewer = getCurrentUser()?.id?.trim() || "guest";
  return `community-user-relation:${viewer}:${targetUserId.trim()}`;
}

export function invalidateCommunityUserRelationSnapshot(targetUserId: string): void {
  const key = relationKey(targetUserId);
  relationCache.delete(key);
  const nextGen = (relationGeneration.get(key) ?? 0) + 1;
  /** 지웠다 다시 넣어 최근 순서로 — 아래 정리는 가장 오래 안 쓴 키부터 */
  relationGeneration.delete(key);
  relationGeneration.set(key, nextGen);
  /** 세대 표도 캐시와 같은 개수로 정리(감사 L1: 무한 증가) — 지워진 키는 세대 0 부터 다시 */
  while (relationGeneration.size > RELATION_CACHE_MAX_KEYS) {
    const oldest = relationGeneration.keys().next().value;
    if (oldest === undefined) break;
    relationGeneration.delete(oldest);
  }
}

export async function fetchCommunityUserRelationSnapshot(
  targetUserId: string
): Promise<CommunityUserRelationSnapshot> {
  const key = relationKey(targetUserId);
  const now = Date.now();
  pruneByAtMaxAgeAndMaxSize(relationCache, now, RELATION_CACHE_MAX_AGE_MS, RELATION_CACHE_MAX_KEYS);
  const cached = relationCache.get(key);
  if (cached && now - cached.at < MIN_FETCH_GAP_MS) {
    return cached.value;
  }

  const gen = relationGeneration.get(key) ?? 0;
  return runSingleFlight(`${key}:${gen}`, async () => {
    try {
      /** 관심이웃·차단을 한 요청으로(설계 v2 §5-2 · B3: 예전 두 요청) */
      const res = await fetch(`/api/community/user-relation?targetUserId=${encodeURIComponent(targetUserId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; following?: boolean; blocked?: boolean };
      const next = {
        following: res.ok && j.ok && typeof j.following === "boolean" ? j.following : null,
        blocked: res.ok && j.ok && typeof j.blocked === "boolean" ? j.blocked : null,
      };
      if ((relationGeneration.get(key) ?? 0) === gen) relationCache.set(key, { at: Date.now(), value: next });
      return next;
    } catch {
      return { following: null, blocked: null };
    }
  });
}
