import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";

/**
 * `/community-messenger` APP-SHELL-FAST-PATH — 콘솔 타이밍(운영 관측).
 * `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` 또는 `SAMARKET_MESSENGER_TRACE_LOG`(서버 주입 시) 일 때만 출력.
 * `performance.now()` 기준 상대 ms (첫 `markMessengerShellVisible` 시각).
 */

const PREFIX = "[app-shell-fast-path]";

let shellT0: number | null = null;

export function resetMessengerAppShellFastPathClock(): void {
  shellT0 = null;
}

function ensureShellT0(): number {
  if (typeof performance === "undefined") return 0;
  if (shellT0 == null) shellT0 = performance.now();
  return shellT0;
}

/** 메신저 셸(헤더·탭·프레임)이 레이아웃에 붙은 시점 — 보통 0ms 로그 */
export function markMessengerShellVisible(): void {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  if (typeof performance === "undefined") return;
  ensureShellT0();
  // eslint-disable-next-line no-console -- gated shell timing
  console.debug(`${PREFIX} messenger_shell_visible_ms=0`);
}

export function logMessengerCriticalDone(): void {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  if (typeof performance === "undefined") return;
  const t0 = ensureShellT0();
  // eslint-disable-next-line no-console -- gated shell timing
  console.debug(`${PREFIX} messenger_critical_done_ms=${Math.round(performance.now() - t0)}`);
}

export function logMessengerDeferredStart(): void {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  if (typeof performance === "undefined") return;
  const t0 = ensureShellT0();
  // eslint-disable-next-line no-console -- gated shell timing
  console.debug(`${PREFIX} messenger_deferred_start_ms=${Math.round(performance.now() - t0)}`);
}

export function logMessengerDeferredDone(): void {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  if (typeof performance === "undefined") return;
  if (shellT0 == null) return;
  // eslint-disable-next-line no-console -- gated shell timing
  console.debug(`${PREFIX} messenger_deferred_done_ms=${Math.round(performance.now() - shellT0)}`);
}
