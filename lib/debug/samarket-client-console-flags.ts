/**
 * 브라우저 콘솔 진단 로그 게이트 (기본 꺼짐 — 운영·일반 개발 콘솔 노이즈 억제).
 *
 * | 플래그 | 켜는 방법 |
 * |--------|-----------|
 * | Nav perf (`[nav-perf]`) | `localStorage.setItem("samarket:debug:navPerf","1")` 후 새로고침, 또는 빌드 시 `NEXT_PUBLIC_SAMARKET_NAV_PERF_CONSOLE=1` |
 * | Philife 피드 perf-diag (`[community-feed:perf-diag]`) | `localStorage.setItem("samarket:debug:philifeFeedPerf","1")` 후 새로고침, 또는 `NEXT_PUBLIC_SAMARKET_PHILIFE_FEED_PERF_DIAG=1` |
 * | Startup deferred (`[startup-deferred-trace]`, `[startup-api-deferred]`) | `localStorage.setItem("samarket:debug:startupDeferred","1")` 후 새로고침, 또는 `NEXT_PUBLIC_SAMARKET_STARTUP_DEFERRED_TRACE=1` |
 * | CM Realtime·통화 진단 (`[cm-rt-*]`, `[cm-call-*]`) | `localStorage.setItem("samarket:debug:messenger","1")` 후 새로고침, 또는 `NEXT_PUBLIC_DEBUG_MESSENGER=true` |
 *
 * 런타임 phase (`[samarket-runtime-debug:phase]`)는 `sessionStorage samarket:debug:runtime=1` 과 동일 모듈(`samarket-runtime-debug`)에서 제어.
 */

function readLocalStorageFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** `[nav-perf]` — 하단 탭 전환·API 샘플링 (개발 빌드에서만 의미 있음; 이 함수가 true일 때만 기록). */
export function isSamarketNavPerfConsoleEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SAMARKET_NAV_PERF_CONSOLE === "1") return true;
  return readLocalStorageFlag("samarket:debug:navPerf");
}

/** `[community-feed:perf-diag]` — /philife 피드 미러·페인트 진단. */
export function isSamarketPhilifeFeedPerfDiagEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SAMARKET_PHILIFE_FEED_PERF_DIAG === "1") return true;
  return readLocalStorageFlag("samarket:debug:philifeFeedPerf");
}

/** `[startup-deferred-trace]` / `[startup-api-deferred]` — deferred job schedule dedupe audit. */
export function isSamarketStartupDeferredTraceEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.NEXT_PUBLIC_SAMARKET_STARTUP_DEFERRED_TRACE === "1") return true;
  return readLocalStorageFlag("samarket:debug:startupDeferred");
}
