import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";

const STORAGE_KEY = "philife_neighborhood_feed_v1";
const MAX_AGE_MS = 1000 * 60 * 30;

export type PhilifeFeedCacheSnapshot = {
  savedAt: number;
  posts: NeighborhoodFeedPostDTO[];
  hasMore: boolean;
  nextOffset: number;
};

type StoredShape = Record<string, PhilifeFeedCacheSnapshot>;

function cacheId(locationKey: string, category: string, neighborOnly: boolean): string {
  return `${locationKey}\u001f${category}\u001f${neighborOnly ? "1" : "0"}`;
}

export function readPhilifeFeedCache(
  locationKey: string,
  category: string,
  neighborOnly: boolean
): PhilifeFeedCacheSnapshot | null {
  if (typeof window === "undefined" || !locationKey) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as StoredShape;
    const snap = all[cacheId(locationKey, category, neighborOnly)];
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
  snapshot: Omit<PhilifeFeedCacheSnapshot, "savedAt">
): void {
  if (typeof window === "undefined" || !locationKey || !snapshot.posts.length) return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const all: StoredShape = raw ? (JSON.parse(raw) as StoredShape) : {};
    all[cacheId(locationKey, category, neighborOnly)] = {
      ...snapshot,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
}
