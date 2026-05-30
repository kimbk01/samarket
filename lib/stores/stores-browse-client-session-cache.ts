"use client";

import type { AppLanguageCode } from "@/lib/i18n/config";
import { APP_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/config";
import type { StoresBrowseClientCacheSnapshot } from "@/lib/stores/store-delivery-api-client";

/** remount·HMR reload·탭 복귀 직후 browse 목록 즉시 표시 — `/stores` 홈 피드 session 패턴과 동급 */
const STORES_BROWSE_SESSION_TTL_MS = 45_000;
const STORES_BROWSE_SESSION_QS_PREFIX = "samarket:stores-browse:v1:qs:";
const STORES_BROWSE_SESSION_ROUTE_PREFIX = "samarket:stores-browse:v1:route:";

export type StoresBrowseSessionEntry = {
  rows: StoresBrowseClientCacheSnapshot["rows"];
  source: StoresBrowseClientCacheSnapshot["source"];
  expiresAt: number;
};

function normalizeQs(queryString: string): string {
  return queryString.trim().replace(/^\?/, "");
}

function sessionQsKey(language: string, queryString: string): string {
  return `${STORES_BROWSE_SESSION_QS_PREFIX}${language}:${normalizeQs(queryString)}`;
}

function sessionRouteKey(language: string): string {
  if (typeof window === "undefined") return "";
  return `${STORES_BROWSE_SESSION_ROUTE_PREFIX}${language}:${window.location.pathname}${window.location.search}`;
}

function readSessionEntry(raw: string | null): StoresBrowseSessionEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      expiresAt?: number;
      rows?: StoresBrowseSessionEntry["rows"];
      source?: StoresBrowseSessionEntry["source"];
    };
    if (!parsed || typeof parsed.expiresAt !== "number" || !Array.isArray(parsed.rows)) return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return {
      rows: parsed.rows,
      source: parsed.source ?? null,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function writeSessionEntry(storageKey: string, entry: StoresBrowseSessionEntry): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        expiresAt: Date.now() + STORES_BROWSE_SESSION_TTL_MS,
        rows: entry.rows,
        source: entry.source,
      })
    );
  } catch {
    /* quota / private mode */
  }
}

/** 동일 browse URL remount — query 문자열 조립 전에도 복구 */
export function peekStoresBrowseSessionByLocation(
  language: AppLanguageCode | string
): StoresBrowseClientCacheSnapshot | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname ?? "";
  if (!path.startsWith("/stores/browse/")) return null;
  const key = sessionRouteKey(language);
  if (!key) return null;
  const hit = readSessionEntry(sessionStorage.getItem(key));
  if (!hit || hit.rows.length === 0) return null;
  return { rows: hit.rows, source: hit.source };
}

export function peekStoresBrowseSessionCache(
  queryString: string,
  language: AppLanguageCode | string
): StoresBrowseClientCacheSnapshot | null {
  if (typeof window === "undefined") return null;
  const qs = normalizeQs(queryString);
  if (!qs) return peekStoresBrowseSessionByLocation(language);
  const hit = readSessionEntry(sessionStorage.getItem(sessionQsKey(language, qs)));
  if (!hit || hit.rows.length === 0) return peekStoresBrowseSessionByLocation(language);
  return { rows: hit.rows, source: hit.source };
}

export function writeStoresBrowseSessionCache(
  queryString: string,
  language: AppLanguageCode | string,
  snapshot: StoresBrowseClientCacheSnapshot
): void {
  if (typeof window === "undefined") return;
  if (!snapshot.rows.length) return;
  const entry: StoresBrowseSessionEntry = {
    rows: snapshot.rows,
    source: snapshot.source,
    expiresAt: Date.now() + STORES_BROWSE_SESSION_TTL_MS,
  };
  const qs = normalizeQs(queryString);
  if (qs) writeSessionEntry(sessionQsKey(language, qs), entry);
  const routeKey = sessionRouteKey(language);
  if (routeKey) writeSessionEntry(routeKey, entry);
}

export function invalidateStoresBrowseSessionCache(
  queryString: string,
  language: AppLanguageCode | string
): void {
  if (typeof window === "undefined") return;
  try {
    const qs = normalizeQs(queryString);
    if (qs) sessionStorage.removeItem(sessionQsKey(language, qs));
    const routeKey = sessionRouteKey(language);
    if (routeKey) sessionStorage.removeItem(routeKey);
  } catch {
    /* ignore */
  }
}

/** `useState` 초기화·Provider 전 — cookie/localStorage 와 동일 파티션 */
export function resolveBrowseSessionLanguageClient(): AppLanguageCode {
  if (typeof window === "undefined") return "en";
  try {
    const ls = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)?.trim().toLowerCase();
    if (ls === "ko" || ls === "en") return ls;
    const m = document.cookie.match(/(?:^|;\s*)(?:sam_lang|app_lang)=([^;]+)/);
    const ck = m?.[1]?.trim().toLowerCase();
    if (ck === "ko" || ck === "en") return ck;
  } catch {
    /* ignore */
  }
  return "en";
}

export function readInitialBrowseListSessionSnapshot(): StoresBrowseClientCacheSnapshot | null {
  return peekStoresBrowseSessionByLocation(resolveBrowseSessionLanguageClient());
}

/** memory peek + session — browse 목록 paint 전용 */
export function peekStoresBrowseListPaintCache(
  queryString: string,
  language: AppLanguageCode | string,
  peekMemory: (qs: string, lang: AppLanguageCode | string) => StoresBrowseClientCacheSnapshot | null
): StoresBrowseClientCacheSnapshot | null {
  const qs = normalizeQs(queryString);
  if (!qs) return peekStoresBrowseSessionByLocation(language);
  return peekMemory(qs, language) ?? peekStoresBrowseSessionCache(qs, language);
}
