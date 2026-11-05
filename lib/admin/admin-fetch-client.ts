"use client";

import { clearAllAdminQueryCache, invalidateAdminQueryCache } from "@/lib/admin/admin-query-cache";
import { logAdminApiCall } from "@/lib/admin/admin-perf-logger";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { ENTRY_SHARED_FLIGHT_DEADLINE_MS, runWithSharedFlightDeadline } from "@/lib/http/shared-flight-deadline";

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

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * 공유 GET 은 헤더·본문 읽기를 한 마감으로 묶어 메모리에 받아 둔다 — 멈춘 응답이 목록 키를 붙잡지 않게.
 * 저장·승인 등 GET 외 요청과 호출자 signal 이 있는 요청은 마감을 걸지 않는다(중복 실행 위험).
 */
function fetchBufferedGet(url: string, init?: AdminFetchInit): Promise<Response> {
  return runWithSharedFlightDeadline("admin_fetch_get", ENTRY_SHARED_FLIGHT_DEADLINE_MS, async (signal) => {
    const res = await fetch(url, { ...init, signal });
    const body = NULL_BODY_STATUSES.has(res.status) ? null : await res.arrayBuffer();
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
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

  // Single-flight shares one Promise across waiters. Each waiter must receive its own
  // Response clone — otherwise the first `res.json()` consumes the body and later
  // waiters parse `{}` (empty list) while the network payload was actually fine.
  const shared = runSingleFlight(dedupeKey, async () => {
    logAdminApiCall(dedupeKey);
    const res = method === "GET" && !init?.signal ? await fetchBufferedGet(url, init) : await fetch(url, init);
    if (method === "GET" && cacheTtlMs > 0 && res.ok) {
      const cachedAt = Date.now();
      responseCache.set(dedupeKey, {
        expiresAt: cachedAt + cacheTtlMs,
        response: cloneForCache(res),
      });
    }
    return res;
  });
  return shared.then((res) => res.clone());
}

/** 계정 전환·로그아웃 — 이전 관리자 계정의 GET 응답·query 캐시 전부 삭제 (AD-08). */
export function clearAllAdminFetchCache(): void {
  responseCache.clear();
  clearAllAdminQueryCache();
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
