"use client";

import type { AppLanguageCode } from "@/lib/i18n/config";
import { buildStoresBrowseClientQueryString } from "@/lib/stores/build-stores-browse-client-query";
import {
  fetchStoresBrowseDeduped,
  peekStoresBrowseClientCache,
} from "@/lib/stores/store-delivery-api-client";
import type { UserRegion } from "@/lib/regions/types";
import { tryMasterOriginFromAddressDefaults } from "@/lib/stores/browse-list-user-origin-coords";

const PREWARM_MIN_GAP_MS = 10_000;

const lastPrewarmAt = new Map<string, number>();
const idleOnceScheduled = new Set<string>();

export type StoresBrowseListPrewarmOpts = {
  language?: AppLanguageCode;
  /** raw query — `primary`/`sub` 대신 직접 지정 */
  queryString?: string;
  primary?: string;
  sub?: string | null;
  sort?: string | null;
  primaryRegion?: UserRegion | null;
  /** 보이지 않는 카드·백그라운드 — `requestIdleCallback` + 세션 1회 */
  idle?: boolean;
};

function prewarmKey(lang: AppLanguageCode, qs: string): string {
  return `${lang}:${qs}`;
}

function scheduleIdleWork(run: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => run(), { timeout: 2500 });
    return;
  }
  setTimeout(run, 0);
}

function resolveQueryString(opts: StoresBrowseListPrewarmOpts): string {
  const raw = opts.queryString?.trim().replace(/^\?/, "");
  if (raw) return raw;
  if (!opts.primary?.trim()) return "";
  return buildStoresBrowseClientQueryString({
    primary: opts.primary,
    sub: opts.sub,
    sort: opts.sort,
    primaryRegion: opts.primaryRegion ?? null,
    includeGeo: false,
  });
}

/**
 * v4 W3 PERF-05 — browse 마운트와 같은 키로 prewarm.
 * 마운트(`StoresBrowsePrimaryView`)는 회원 MASTER 배송지 좌표(`user_lat`·`user_lng`·`user_address_id`)를 붙여 요청하므로
 * 좌표 없는 prewarm 은 다른 single-flight·캐시 키라 매번 버려졌다. 같은 origin 권한(CUT 4: 회원 = MASTER 만)으로 좌표를 붙인다.
 * - 회원 + MASTER 좌표 → 좌표 포함 키 (마운트와 동일)
 * - 회원 + MASTER 없음 → 좌표 없는 키 (마운트도 좌표 없음)
 * - 게스트·미확인 → 좌표 없는 키 유지(GPS 권한 요청을 prewarm 이 먼저 띄우지 않음 · 마운트 paint 폴백용)
 * 쿼리 파라미터 순서는 마운트(primary·sub·region·city·sort·user_lat·user_lng·user_address_id)와 같다.
 */
export async function withStoresBrowsePrewarmOriginGeo(baseQs: string): Promise<string> {
  try {
    const resolved = await tryMasterOriginFromAddressDefaults();
    const origin = resolved.origin;
    if (!origin) return baseQs;
    const sp = new URLSearchParams(baseQs);
    sp.delete("user_lat");
    sp.delete("user_lng");
    sp.delete("user_address_id");
    sp.set("user_lat", String(origin.lat));
    sp.set("user_lng", String(origin.lng));
    const aid = origin.addressId?.trim();
    if (aid) sp.set("user_address_id", aid);
    return sp.toString();
  } catch {
    return baseQs;
  }
}

/**
 * browse 목록 GET prewarm 단일 진입점 — hero·1차 탭·2차 칩·explore 가 각각 부르지 않도록 합류.
 */
export function scheduleStoresBrowseListPrewarm(opts: StoresBrowseListPrewarmOpts): void {
  if (typeof window === "undefined") return;
  const qs = resolveQueryString(opts);
  if (!qs) return;
  const lang = opts.language ?? "en";
  const key = prewarmKey(lang, qs);

  if (opts.idle && idleOnceScheduled.has(key)) return;

  const now = Date.now();
  const last = lastPrewarmAt.get(key) ?? 0;
  if (now - last < PREWARM_MIN_GAP_MS) return;

  if (peekStoresBrowseClientCache(qs, { language: lang })) {
    lastPrewarmAt.set(key, now);
    if (opts.idle) idleOnceScheduled.add(key);
    return;
  }

  lastPrewarmAt.set(key, now);
  if (opts.idle) idleOnceScheduled.add(key);

  const hasExplicitQuery = Boolean(opts.queryString?.trim());
  const run = () => {
    void (async () => {
      const finalQs = hasExplicitQuery ? qs : await withStoresBrowsePrewarmOriginGeo(qs);
      if (finalQs !== qs && peekStoresBrowseClientCache(finalQs, { language: lang })) return;
      await fetchStoresBrowseDeduped(finalQs, { language: lang });
    })().catch(() => {
      /* 마운트 fetch 가 이어감 */
    });
  };

  if (opts.idle) scheduleIdleWork(run);
  else run();
}

/** @deprecated 직접 호출 대신 `scheduleStoresBrowseListPrewarm` 권장 */
export function prewarmStoresBrowseListClient(
  queryString: string,
  opts?: { language?: AppLanguageCode }
): void {
  scheduleStoresBrowseListPrewarm({
    queryString,
    language: opts?.language,
    idle: false,
  });
}

/** 테스트·HMR */
export function resetStoresBrowsePrewarmCoordinatorForTests(): void {
  lastPrewarmAt.clear();
  idleOnceScheduled.clear();
}
