import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";

/** v2: 캐시 키에 뷰어(로그인) 구분 — 차단 필터·관심이웃과 불일치 방지 */
const STORAGE_KEY = "philife_neighborhood_feed_v2";
const MAX_AGE_MS = 1000 * 60 * 30;

export type PhilifeFeedCacheSnapshot = {
  savedAt: number;
  posts: NeighborhoodFeedPostDTO[];
  hasMore: boolean;
  nextOffset: number;
};

type StoredShape = Record<string, PhilifeFeedCacheSnapshot>;

export function philifeFeedViewerSig(): string {
  const id = getCurrentUser()?.id?.trim();
  return id || "_anon";
}

function cacheId(
  locationKey: string,
  category: string,
  neighborOnly: boolean,
  viewerSig: string,
  /** `recommend*` 탭의 `sort` (그 외는 빈 문자열) */
  sortKey: string
): string {
  return `${locationKey}\u001f${category}\u001f${neighborOnly ? "1" : "0"}\u001f${viewerSig}\u001f${sortKey}`;
}

export function readPhilifeFeedCache(
  locationKey: string,
  category: string,
  neighborOnly: boolean,
  viewerSig: string,
  sortKey = ""
): PhilifeFeedCacheSnapshot | null {
  if (typeof window === "undefined" || !locationKey) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as StoredShape;
    const snap = all[cacheId(locationKey, category, neighborOnly, viewerSig, sortKey)];
    if (!snap?.posts?.length) return null;
    if (typeof snap.savedAt !== "number" || Date.now() - snap.savedAt > MAX_AGE_MS) return null;
    return snap;
  } catch {
    return null;
  }
}

export function writePhilifeFeedCache(
  locationKey: string,
  category: string,
  neighborOnly: boolean,
  viewerSig: string,
  snapshot: Omit<PhilifeFeedCacheSnapshot, "savedAt">,
  sortKey = ""
): void {
  if (typeof window === "undefined" || !locationKey || !snapshot.posts.length) return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const all: StoredShape = raw ? (JSON.parse(raw) as StoredShape) : {};
    all[cacheId(locationKey, category, neighborOnly, viewerSig, sortKey)] = {
      ...snapshot,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
}
