/**
 * NAV-PERF-3: 브라우저 전용 하단 탭 전환 진단 — 서버 터미널 미출력.
 * 기본 꺼짐 — `lib/debug/samarket-client-console-flags.ts` (`samarket:debug:navPerf` 등).
 * `window.__navPerfDump()` / `window.__navPerfClear()` 로 수동 확인(플래그 on 시에만 의미 있음).
 */

import { isSamarketNavPerfConsoleEnabled } from "@/lib/debug/samarket-client-console-flags";

export type NavPerfEventRecord = {
  id: string;
  fromPath: string;
  toPath: string;
  /** 직전 route settle(또는 초기 hydrate) 이후 클릭까지 대기 ms */
  idleBeforeClickMs: number | null;
  /** 클릭 시각 → beginMenuNavigation 진입까지 */
  clickToIntentMs: number | null;
  /** 클릭 시각 → beginMenuNavigation 동기 블록 끝(intent 커밋) */
  intentSyncMs: number | null;
  /** 클릭 시각 → onNavigationIntent(낙관 active)까지 — BottomNav 가 설정 */
  optimisticActiveSetMs: number | null;
  /** 클릭 시각 → pathname 인텐트 일치 */
  routeSettledMs: number | null;
  /** 더블 rAF 근사 첫 페인트 — 클릭 기준 */
  firstShellVisibleMs: number | null;
  /** 클릭 → 첫 페인트 근사까지 총 ms */
  totalClickToVisibleMs: number | null;
  /** 클릭 시각 기준 1500ms 안에 관측된 `/api/` 리소스 타이밍 개수 */
  apiCountWithin1500ms: number | null;
  slowestApiName: string | null;
  slowestApiMs: number | null;
  /** Next prefetch 히트는 브라우저에서 확정 불가 시 null */
  wasRoutePrefetched: boolean | null;
  wasDevCompileLikely: boolean;
};

declare global {
  interface Window {
    __NAV_PERF_EVENTS?: NavPerfEventRecord[];
    __navPerfDump?: () => void;
    __navPerfClear?: () => void;
    /** performance.now() — 마지막 클릭(탭 이동 시도) */
    __navPerfLastClickStart?: number;
    /** performance.now() — 마지막 route_settled(하단 탭) 또는 초기 hydrate */
    __navPerfLastRouteSettledPerfNow?: number;
    /** 클릭 시각 기준 ms — 낙관 탭 활성까지 */
    __navPerfOptimisticTotalMs?: number;
    __navPerfHydrated?: boolean;
  }
}

let navPerfSeq = 0;

function ensureGlobals(): void {
  if (typeof window === "undefined") return;
  if (!window.__NAV_PERF_EVENTS) window.__NAV_PERF_EVENTS = [];
  if (!window.__navPerfDump) {
    window.__navPerfDump = () => {
      if (!isSamarketNavPerfConsoleEnabled()) {
        console.info("[nav-perf]", "비활성 — localStorage samarket:debug:navPerf=1 또는 NEXT_PUBLIC_SAMARKET_NAV_PERF_CONSOLE=1");
        return;
      }
      console.table(window.__NAV_PERF_EVENTS ?? []);
      console.debug("[nav-perf]", "dump rows:", (window.__NAV_PERF_EVENTS ?? []).length);
    };
  }
  if (!window.__navPerfClear) {
    window.__navPerfClear = () => {
      window.__NAV_PERF_EVENTS = [];
      if (isSamarketNavPerfConsoleEnabled()) {
        console.debug("[nav-perf]", "cleared __NAV_PERF_EVENTS");
      }
    };
  }
}

function navPerfDevActive(): boolean {
  return process.env.NODE_ENV === "development" && isSamarketNavPerfConsoleEnabled();
}

/** Provider 마운트 시 1회 — idle 기준 시작점 */
export function navPerfMarkInitialHydrated(): void {
  if (typeof window === "undefined" || !navPerfDevActive()) return;
  ensureGlobals();
  if (window.__navPerfHydrated) return;
  window.__navPerfHydrated = true;
  window.__navPerfLastRouteSettledPerfNow = performance.now();
}

export function navPerfMarkBottomNavClickStart(ts?: number): void {
  if (typeof window === "undefined" || !navPerfDevActive()) return;
  ensureGlobals();
  window.__navPerfLastClickStart = ts ?? performance.now();
}

export function navPerfSetOptimisticTotalMs(ms: number): void {
  if (typeof window === "undefined" || !navPerfDevActive()) return;
  window.__navPerfOptimisticTotalMs = ms;
}

function collectApiStatsSinceClick(clickPerfNow: number, windowMs: number): Pick<
  NavPerfEventRecord,
  "apiCountWithin1500ms" | "slowestApiName" | "slowestApiMs"
> {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const winEnd = clickPerfNow + windowMs;
    let slowestMs = 0;
    let slowestName: string | null = null;
    let count = 0;
    for (const e of entries) {
      const fs = e.fetchStart;
      if (fs < clickPerfNow || fs > winEnd) continue;
      const name = e.name;
      try {
        const u = new URL(name, window.location.origin);
        if (!u.pathname.startsWith("/api/")) continue;
      } catch {
        continue;
      }
      count += 1;
      const dur = Math.round(e.responseEnd - e.fetchStart);
      if (dur > slowestMs) {
        slowestMs = dur;
        slowestName = name.replace(window.location.origin, "") || name;
      }
    }
    return {
      apiCountWithin1500ms: count,
      slowestApiName: slowestName,
      slowestApiMs: slowestMs > 0 ? slowestMs : null,
    };
  } catch {
    return { apiCountWithin1500ms: null, slowestApiName: null, slowestApiMs: null };
  }
}

export type BottomNavPerfPendingSlice = {
  intentId: number;
  wallTs: number;
  clickStart: number;
  perfIntentEnter: number;
  fromPath: string;
  toPath: string;
  intentCommitMs: number;
  /** pathname 인텐트 일치 시각(performance.now) — route settled 구간 */
  routeSettledPerfNow?: number;
  firstShellPaintApproxMs?: number;
};

/** intent_sync 직후 — 더블 rAF 로 첫 페인트(ms, 클릭 기준) */
export function navPerfScheduleFirstPaintTracking(
  pending: BottomNavPerfPendingSlice,
  intentId: number
): void {
  if (typeof window === "undefined" || !navPerfDevActive()) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (pending.intentId !== intentId) return;
      pending.firstShellPaintApproxMs = Math.round(performance.now() - pending.clickStart);
    });
  });
}

/** route_settled 시 호출 — 이벤트 1건을 배열에 넣고 API 통계는 지연 채움 */
export function navPerfFinalizeBottomNavNavigation(pending: BottomNavPerfPendingSlice): void {
  if (typeof window === "undefined" || !navPerfDevActive()) return;
  ensureGlobals();

  const clickStart = pending.clickStart;
  const lastSettled = window.__navPerfLastRouteSettledPerfNow;
  const idleBeforeClickMs =
    lastSettled != null ? Math.round(clickStart - lastSettled) : null;

  const clickToIntentMs = Math.round(pending.perfIntentEnter - clickStart);
  const routeSettledMs =
    pending.routeSettledPerfNow != null
      ? Math.round(pending.routeSettledPerfNow - clickStart)
      : Math.round(performance.now() - clickStart);
  const optimisticActiveSetMs =
    window.__navPerfOptimisticTotalMs != null
      ? Math.round(window.__navPerfOptimisticTotalMs)
      : null;

  const firstShell = pending.firstShellPaintApproxMs ?? null;
  const totalClickToVisibleMs = firstShell != null ? firstShell : null;

  navPerfSeq += 1;
  const id = `nav-${navPerfSeq}-${pending.intentId}`;

  const row: NavPerfEventRecord = {
    id,
    fromPath: pending.fromPath,
    toPath: pending.toPath,
    idleBeforeClickMs,
    clickToIntentMs,
    intentSyncMs: pending.intentCommitMs,
    optimisticActiveSetMs,
    routeSettledMs,
    firstShellVisibleMs: firstShell,
    totalClickToVisibleMs,
    apiCountWithin1500ms: null,
    slowestApiName: null,
    slowestApiMs: null,
    wasRoutePrefetched: null,
    wasDevCompileLikely: process.env.NODE_ENV === "development",
  };

  window.__NAV_PERF_EVENTS!.push(row);

  console.debug("[nav-perf]", "route_settled", row);

  window.setTimeout(() => {
    const api = collectApiStatsSinceClick(clickStart, 1500);
    row.apiCountWithin1500ms = api.apiCountWithin1500ms;
    row.slowestApiName = api.slowestApiName;
    row.slowestApiMs = api.slowestApiMs;
    console.debug("[nav-perf]", "apis_sampled_1500ms", { id: row.id, ...api });
  }, 1550);

  window.__navPerfLastRouteSettledPerfNow = performance.now();
}
