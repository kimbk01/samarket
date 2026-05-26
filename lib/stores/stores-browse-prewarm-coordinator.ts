"use client";

import type { AppLanguageCode } from "@/lib/i18n/config";
import { buildStoresBrowseClientQueryString } from "@/lib/stores/build-stores-browse-client-query";
import {
  fetchStoresBrowseDeduped,
  peekStoresBrowseClientCache,
} from "@/lib/stores/store-delivery-api-client";
import type { UserRegion } from "@/lib/regions/types";

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

  const run = () => {
    void fetchStoresBrowseDeduped(qs, { language: lang }).catch(() => {
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
