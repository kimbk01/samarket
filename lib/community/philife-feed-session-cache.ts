import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";

/**
 * Philife feed persistent cache — Cold Boot Cache-First.
 * localStorage so cold start (app kill) 에도 last snapshot 으로 첫 paint.
 * DO NOT: sessionStorage only · SSR initial state 에 캐시 주입(하이드레이션 불일치).
 */
const STORAGE_KEY = "philife_neighborhood_feed_v3_persistent";
/** legacy session key — one-shot migrate */
const LEGACY_SESSION_KEY = "philife_neighborhood_feed_v2";
/** Cold boot — auth restore 전 마지막 viewer (계정 섞임 방지용 힌트) */
const LAST_VIEWER_SIG_KEY = "philife_feed_last_viewer_sig_v1";
const MAX_AGE_MS = 1000 * 60 * 30;
const MAX_STALE_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_CACHE_ENTRIES = 60;

export type PhilifeFeedCacheSnapshot = {
  savedAt: number;
  posts: NeighborhoodFeedPostDTO[];
  hasMore: boolean;
  nextOffset: number;
};

type StoredShape = Record<string, PhilifeFeedCacheSnapshot>;

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

/** 로그아웃·계정 전환 — feed/topic persistent 전부 제거 (viewer 혼선 방지) */
export function clearAllPhilifeFeedPersistentCaches(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_VIEWER_SIG_KEY);
    localStorage.removeItem("philife_neighborhood_topic_options_v1");
    localStorage.removeItem("samarket:mypage-hub:v2_persistent");
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    sessionStorage.removeItem("samarket:mypage-hub:v1");
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

function readStorageRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const persistent = localStorage.getItem(STORAGE_KEY);
    if (persistent) return persistent;
    const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      try {
        localStorage.setItem(STORAGE_KEY, legacy);
        sessionStorage.removeItem(LEGACY_SESSION_KEY);
      } catch {
        /* quota */
      }
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStorageRaw(raw: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, raw);
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
    const all = JSON.parse(raw) as StoredShape;
    const snap = all[cacheId(locationKey, category, neighborOnly, viewerSig, sortKey)];
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
    const raw = readStorageRaw();
    if (!raw) return false;
    const all = JSON.parse(raw) as StoredShape;
    const snap = all[cacheId(locationKey, category, neighborOnly, viewerSig, sortKey)];
    if (!snap?.posts?.length || typeof snap.savedAt !== "number") return false;
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
    const all = JSON.parse(raw) as StoredShape;
    const id = cacheId(locationKey, category, neighborOnly, viewerSig, sortKey);
    if (!(id in all)) return;
    delete all[id];
    writeStorageRaw(JSON.stringify(all));
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
    const all: StoredShape = raw ? pruneStoredShape(JSON.parse(raw) as StoredShape, now) : {};
    all[cacheId(locationKey, category, neighborOnly, viewerSig, sortKey)] = {
      ...snapshot,
      savedAt: now,
    };
    writeStorageRaw(JSON.stringify(pruneStoredShape(all, now)));
  } catch {
    /* quota / private mode */
  }
}
