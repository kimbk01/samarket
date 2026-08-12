import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  COMMUNITY_FEED_CACHE_FRESH_TTL_MS,
  COMMUNITY_FEED_CACHE_LEGACY_SESSION_KEY,
  COMMUNITY_FEED_CACHE_LEGACY_STORAGE_KEYS,
  COMMUNITY_FEED_CACHE_MAX_ENTRIES,
  COMMUNITY_FEED_CACHE_SCHEMA_VERSION,
  COMMUNITY_FEED_CACHE_STALE_MAX_AGE_MS,
  COMMUNITY_FEED_CACHE_STORAGE_KEY,
  COMMUNITY_FEED_LAST_VIEWER_SIG_KEY,
} from "@/lib/community/community-feed-cache-ssot";

/**
 * Philife feed persistent cache — Cold Boot Cache-First.
 * localStorage so cold start (app kill) 에도 last snapshot 으로 첫 paint.
 * Authority: server neighborhood-feed. schemaVersion cutover drops contaminated v3.
 * DO NOT: sessionStorage only · SSR initial state 에 캐시 주입(하이드레이션 불일치).
 */

const STORAGE_KEY = COMMUNITY_FEED_CACHE_STORAGE_KEY;
const LEGACY_SESSION_KEY = COMMUNITY_FEED_CACHE_LEGACY_SESSION_KEY;
const LAST_VIEWER_SIG_KEY = COMMUNITY_FEED_LAST_VIEWER_SIG_KEY;
const MAX_AGE_MS = COMMUNITY_FEED_CACHE_FRESH_TTL_MS;
const MAX_STALE_AGE_MS = COMMUNITY_FEED_CACHE_STALE_MAX_AGE_MS;
const MAX_CACHE_ENTRIES = COMMUNITY_FEED_CACHE_MAX_ENTRIES;

export type PhilifeFeedCacheSnapshot = {
  savedAt: number;
  posts: NeighborhoodFeedPostDTO[];
  hasMore: boolean;
  nextOffset: number;
};

type StoredShape = Record<string, PhilifeFeedCacheSnapshot>;

type StoredRoot = {
  schemaVersion: number;
  entries: StoredShape;
};

function pruneStoredShape(all: StoredShape, now: number): StoredShape {
  const entries = Object.entries(all).filter(([, snap]) => {
    return (
      typeof snap?.savedAt === "number" &&
      now - snap.savedAt <= MAX_STALE_AGE_MS &&
      Array.isArray(snap.posts) &&
      snap.posts.length > 0
    );
  });
  if (entries.length <= MAX_CACHE_ENTRIES) {
    return Object.fromEntries(entries);
  }
  entries.sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
  return Object.fromEntries(entries.slice(0, MAX_CACHE_ENTRIES));
}

export function philifeFeedViewerSig(): string {
  const id = getCurrentUser()?.id?.trim();
  return id || "_anon";
}

/** Auth 복원 전 cold paint — live sig 우선, 없으면 마지막 로그인 viewer */
export function resolvePhilifeColdBootViewerSig(): string {
  const live = philifeFeedViewerSig();
  if (live !== "_anon") {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(LAST_VIEWER_SIG_KEY, live);
      }
    } catch {
      /* ignore */
    }
    return live;
  }
  if (typeof window === "undefined") return "_anon";
  try {
    const last = localStorage.getItem(LAST_VIEWER_SIG_KEY)?.trim();
    return last || "_anon";
  } catch {
    return "_anon";
  }
}

function removeLegacyFeedStorageKeys(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of COMMUNITY_FEED_CACHE_LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(k);
    }
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** 로그아웃·계정 전환 — feed/topic persistent 전부 제거 (viewer 혼선 방지) */
export function clearAllPhilifeFeedPersistentCaches(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    removeLegacyFeedStorageKeys();
    localStorage.removeItem(LAST_VIEWER_SIG_KEY);
    localStorage.removeItem("philife_neighborhood_topic_options_v1");
    localStorage.removeItem("samarket:mypage-hub:v2_persistent");
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    sessionStorage.removeItem("samarket:mypage-hub:v1");
    sessionStorage.removeItem("samarket:mypage-home:v1");
  } catch {
    /* ignore */
  }
}

/**
 * Nickname / Member Identity mutation — drop feed snapshots so list cannot keep stale author_name.
 * Does not clear UI prefs / drafts.
 */
export function invalidatePhilifeFeedCachesForMemberIdentityChange(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    removeLegacyFeedStorageKeys();
  } catch {
    /* ignore */
  }
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

function parseStoredRoot(raw: string): StoredRoot | null {
  try {
    const parsed = JSON.parse(raw) as StoredRoot | StoredShape;
    if (
      parsed &&
      typeof parsed === "object" &&
      "schemaVersion" in parsed &&
      "entries" in parsed &&
      typeof (parsed as StoredRoot).schemaVersion === "number" &&
      (parsed as StoredRoot).entries &&
      typeof (parsed as StoredRoot).entries === "object"
    ) {
      if ((parsed as StoredRoot).schemaVersion !== COMMUNITY_FEED_CACHE_SCHEMA_VERSION) {
        return null;
      }
      return parsed as StoredRoot;
    }
    /** Raw v3-shaped map under v4 key (should not happen) — reject */
    return null;
  } catch {
    return null;
  }
}

function readStorageRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    removeLegacyFeedStorageKeys();
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorageRoot(root: StoredRoot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    /* quota / private mode */
  }
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
    const raw = readStorageRaw();
    if (!raw) return null;
    const root = parseStoredRoot(raw);
    if (!root) return null;
    const snap = root.entries[cacheId(locationKey, category, neighborOnly, viewerSig, sortKey)];
    if (!snap?.posts?.length) return null;
    if (typeof snap.savedAt !== "number") return null;
    return snap;
  } catch {
    return null;
  }
}

export function isPhilifeFeedCacheFresh(
  locationKey: string,
  category: string,
  neighborOnly: boolean,
  viewerSig: string,
  sortKey = ""
): boolean {
  if (typeof window === "undefined" || !locationKey) return false;
  try {
    const snap = readPhilifeFeedCache(locationKey, category, neighborOnly, viewerSig, sortKey);
    if (!snap) return false;
    return Date.now() - snap.savedAt <= MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** PTR·강제 새로고침 — 현재 쿼리 캐시 제거 */
export function clearPhilifeFeedCacheEntry(
  locationKey: string,
  category: string,
  neighborOnly: boolean,
  viewerSig: string,
  sortKey = ""
): void {
  if (typeof window === "undefined" || !locationKey) return;
  try {
    const raw = readStorageRaw();
    if (!raw) return;
    const root = parseStoredRoot(raw);
    if (!root) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const id = cacheId(locationKey, category, neighborOnly, viewerSig, sortKey);
    if (!(id in root.entries)) return;
    delete root.entries[id];
    writeStorageRoot({
      schemaVersion: COMMUNITY_FEED_CACHE_SCHEMA_VERSION,
      entries: pruneStoredShape(root.entries, Date.now()),
    });
  } catch {
    /* quota / private mode */
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
    if (viewerSig && viewerSig !== "_anon") {
      localStorage.setItem(LAST_VIEWER_SIG_KEY, viewerSig);
    }
    const raw = readStorageRaw();
    const now = Date.now();
    const prev = raw ? parseStoredRoot(raw) : null;
    const entries: StoredShape = prev
      ? pruneStoredShape(prev.entries, now)
      : {};
    entries[cacheId(locationKey, category, neighborOnly, viewerSig, sortKey)] = {
      ...snapshot,
      savedAt: now,
    };
    writeStorageRoot({
      schemaVersion: COMMUNITY_FEED_CACHE_SCHEMA_VERSION,
      entries: pruneStoredShape(entries, now),
    });
    removeLegacyFeedStorageKeys();
  } catch {
    /* quota / private mode */
  }
}
