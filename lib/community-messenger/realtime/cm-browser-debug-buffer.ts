/**
 * 브라우저 전역 디버그 버퍼 — Cursor/터미널로 전달되지 않는 DevTools 로그를
 * 재현 후 `cmDebugDump()` 로 복사하기 위한 용도.
 */

export type CmBrowserDebugEvent = {
  ts: number;
  label: string;
  scope: string | null;
  channelName: string | null;
  reason: string | null;
  status: string | null;
  bodySnippet: string | null;
  payload: unknown;
  stopSourceStack: string | null;
  fingerprint: string | null;
  userIdTail: string | null;
};

const CM_DEBUG_CAP = 200;

const rtLoopLifetimeByChannel = new Map<string, { create: number; stop: number }>();
let summaryTimer: ReturnType<typeof setInterval> | null = null;
/**
 * 「루프 의심」판정 — `subscribe-with-retry` 와 동일 기준.
 * `1 create / 0 stop`(정상 마운트)·`1 create / 1 stop`(정상 unmount) 은 버퍼에 요약을 남기지 않는다.
 */
const SUMMARY_IDLE_TICKS_TO_STOP = 6;
let summaryIdleTickCount = 0;

function isCmRtLoopSuspect(create: number, stop: number): boolean {
  return create >= 2 || stop >= 2;
}

declare global {
  interface Window {
    __CM_DEBUG_EVENTS?: CmBrowserDebugEvent[];
    cmDebugDump?: () => string;
    cmDebugClear?: () => void;
  }
}

export function cmDebugTailUserId(userId: string | null | undefined): string | null {
  if (userId == null || typeof userId !== "string") return null;
  const t = userId.trim();
  if (!t) return null;
  if (t.length <= 6) return t;
  return t.slice(-6);
}

/** `community-messenger-home:meta:<uuid>` / `community-messenger-home:rooms-in:<uuid>:…` */
export function cmDebugUserIdTailFromChannelName(channelName: string | null | undefined): string | null {
  if (!channelName) return null;
  const parts = channelName.split(":");
  if (parts[0] !== "community-messenger-home") return null;
  if (parts[1] === "meta" && parts[2]) return cmDebugTailUserId(parts[2]);
  if (parts[1] === "rooms-in" && parts[2]) return cmDebugTailUserId(parts[2]);
  return null;
}

function ensureWindowHelpers(): void {
  if (typeof window === "undefined") return;
  if (!window.__CM_DEBUG_EVENTS) window.__CM_DEBUG_EVENTS = [];
  if (!window.cmDebugDump) {
    window.cmDebugDump = () => JSON.stringify(window.__CM_DEBUG_EVENTS ?? [], null, 2);
  }
  if (!window.cmDebugClear) {
    window.cmDebugClear = () => {
      window.__CM_DEBUG_EVENTS = [];
    };
  }
}

function stopSummaryTimer(): void {
  if (summaryTimer == null) return;
  clearInterval(summaryTimer);
  summaryTimer = null;
  summaryIdleTickCount = 0;
}

function flushSummaryTick(): void {
  if (typeof window === "undefined") return;
  const list = [...rtLoopLifetimeByChannel.entries()]
    .map(([name, v]) => ({ name, create: v.create, stop: v.stop }))
    .filter((x) => isCmRtLoopSuspect(x.create, x.stop))
    .sort((a, b) => b.stop - a.stop || b.create - a.create)
    .slice(0, 6);
  if (list.length === 0) {
    summaryIdleTickCount += 1;
    if (summaryIdleTickCount >= SUMMARY_IDLE_TICKS_TO_STOP) {
      stopSummaryTimer();
    }
    return;
  }
  summaryIdleTickCount = 0;
  const topText = list.map((x) => `${x.stop} stop / ${x.create} create — ${x.name}`).join(" | ");
  pushCmBrowserDebugEvent({
    label: "cm-rt-loop-summary",
    scope: null,
    channelName: null,
    reason: null,
    status: null,
    bodySnippet: topText,
    payload: { top: list, note: "counts since last reload; focus on highest stop/create" },
    stopSourceStack: null,
    fingerprint: null,
    userIdTail: null,
  });
}

function ensureSummaryTimer(): void {
  if (typeof window === "undefined" || summaryTimer != null) return;
  summaryIdleTickCount = 0;
  summaryTimer = setInterval(() => flushSummaryTick(), 5000);
}

/** subscribeWithRetry 채널 생성 시 호출 — 카운터·요약 타이머 유지 */
export function recordCmRtLoopCreateForBuffer(channelName: string): { create: number; stop: number } {
  const row = rtLoopLifetimeByChannel.get(channelName) ?? { create: 0, stop: 0 };
  row.create += 1;
  rtLoopLifetimeByChannel.set(channelName, row);
  summaryIdleTickCount = 0;
  ensureSummaryTimer();
  return { create: row.create, stop: row.stop };
}

/** subscribeWithRetry stop 시 호출 */
export function recordCmRtLoopStopForBuffer(channelName: string): { create: number; stop: number } {
  const row = rtLoopLifetimeByChannel.get(channelName) ?? { create: 0, stop: 0 };
  row.stop += 1;
  rtLoopLifetimeByChannel.set(channelName, row);
  summaryIdleTickCount = 0;
  ensureSummaryTimer();
  return { create: row.create, stop: row.stop };
}

export function pushCmBrowserDebugEvent(partial: {
  label: string;
  scope?: string | null;
  channelName?: string | null;
  reason?: string | null;
  status?: string | null;
  bodySnippet?: string | null;
  payload?: unknown;
  stopSourceStack?: string | null;
  fingerprint?: string | null;
  userIdTail?: string | null;
}): void {
  try {
    if (typeof window === "undefined") return;
    ensureWindowHelpers();
    const ev: CmBrowserDebugEvent = {
      ts: Date.now(),
      label: partial.label,
      scope: partial.scope ?? null,
      channelName: partial.channelName ?? null,
      reason: partial.reason ?? null,
      status: partial.status ?? null,
      bodySnippet: partial.bodySnippet ?? null,
      payload: partial.payload ?? null,
      stopSourceStack: partial.stopSourceStack ?? null,
      fingerprint: partial.fingerprint ?? null,
      userIdTail: partial.userIdTail ?? null,
    };
    window.__CM_DEBUG_EVENTS!.push(ev);
    while (window.__CM_DEBUG_EVENTS!.length > CM_DEBUG_CAP) {
      window.__CM_DEBUG_EVENTS!.shift();
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  ensureWindowHelpers();
}
