"use client";

import { invalidateAdminQueryCache } from "@/lib/admin/admin-query-cache";
import { logAdminApiCall } from "@/lib/admin/admin-perf-logger";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type AdminFetchInit = RequestInit & {
  /** single-flight·TTL 캐시 키. 생략 시 method+url */
  dedupeKey?: string;
  /** GET 응답 TTL(ms). 0이면 캐시 없음 */
  cacheTtlMs?: number;
};

type CachedEntry = {
  expiresAt: number;
  response: Response;
};

const responseCache = new Map<string, CachedEntry>();

function buildDedupeKey(url: string, init?: AdminFetchInit): string {
  if (init?.dedupeKey?.trim()) return init.dedupeKey.trim();
  const method = (init?.method ?? "GET").toUpperCase();
  return `admin-fetch:${method}:${url}`;
}

function cloneForCache(res: Response): Response {
  return res.clone();
}

/**
 * 어드민 클라이언트 fetch — 동시 중복 합류 + 짧은 GET TTL 캐시 + dev perf 로그.
 */
export async function adminFetch(url: string, init?: AdminFetchInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const dedupeKey = buildDedupeKey(url, init);
  const cacheTtlMs = init?.cacheTtlMs ?? 0;
  const now = Date.now();

  if (method === "GET" && cacheTtlMs > 0) {
    const hit = responseCache.get(dedupeKey);
    if (hit && hit.expiresAt > now) {
      logAdminApiCall(dedupeKey, { duplicate: true });
      return hit.response.clone();
    }
  }

  return runSingleFlight(dedupeKey, async () => {
    logAdminApiCall(dedupeKey);
    const res = await fetch(url, init);
    if (method === "GET" && cacheTtlMs > 0 && res.ok) {
      const cachedAt = Date.now();
      responseCache.set(dedupeKey, {
        expiresAt: cachedAt + cacheTtlMs,
        response: cloneForCache(res),
      });
    }
    return res;
  });
}

/** 저장·승인 등 mutation 직후 관련 GET·query 캐시 무효화 */
export function invalidateAdminFetchCache(keyOrPrefix: string): void {
  const needle = keyOrPrefix.trim();
  if (!needle) return;
  for (const k of [...responseCache.keys()]) {
    if (k === needle || k.startsWith(needle)) responseCache.delete(k);
  }
  invalidateAdminQueryCache(needle);
}
