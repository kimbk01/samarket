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

function relationKey(targetUserId: string) {
  return `community-user-relation:${targetUserId.trim()}`;
}

export function invalidateCommunityUserRelationSnapshot(targetUserId: string): void {
  const key = relationKey(targetUserId);
  relationCache.delete(key);
  relationGeneration.set(key, (relationGeneration.get(key) ?? 0) + 1);
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
      const [resFollow, resBlock] = await Promise.all([
        fetch(`/api/community/neighbor-relations?targetUserId=${encodeURIComponent(targetUserId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/community/block-relations?targetUserId=${encodeURIComponent(targetUserId)}`, {
          cache: "no-store",
        }),
      ]);

      const jf = (await resFollow.json().catch(() => ({}))) as {
        ok?: boolean;
        following?: boolean;
      };
      const jb = (await resBlock.json().catch(() => ({}))) as {
        ok?: boolean;
        blocked?: boolean;
      };

      const next = {
        following:
          resFollow.ok && jf.ok && typeof jf.following === "boolean" ? jf.following : null,
        blocked:
          resBlock.ok && jb.ok && typeof jb.blocked === "boolean" ? jb.blocked : null,
      };
      if ((relationGeneration.get(key) ?? 0) === gen) relationCache.set(key, { at: Date.now(), value: next });
      return next;
    } catch {
      return { following: null, blocked: null };
    }
  });
}
