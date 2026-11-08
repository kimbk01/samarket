/**
 * C8 — 앱 진입·복귀 계측 송신 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4).
 *
 * 계약:
 * - **관측 전용.** 시작 화면 해제·화면 표시·네트워크 순서를 바꾸지 않는다. 모든 진입점은 예외를 삼킨다.
 * - 동적 import 금지 (청크 실패 상황에서도 보내야 한다). 네이티브 정보는 `window.Capacitor` 전역만 읽는다.
 * - 송신은 `sendBeacon` (없으면 `fetch keepalive`) 1회 · 문서당 최대 `ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN`.
 * - 토큰·사용자 ID·URL 쿼리 미수집. 실행 ID 는 문서마다 새 무작위 값.
 * - `no_release` 관측 한도(20초)는 **기록용**이다 — 시작 화면을 풀지 않는다 (D1: 표시 타이머 금지 유지).
 */

import {
  ENTRY_FAILURE_CLASSES,
  ENTRY_TELEMETRY_ENDPOINT,
  ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN,
  ENTRY_TELEMETRY_SCHEMA_VERSION,
  type EntryEventKind,
  type EntryEventType,
  type EntryFailureClass,
  type EntryPlatform,
  type EntryStages,
  type EntryTelemetryEvent,
} from "@/lib/telemetry/entry-telemetry-contract";

/** 해제 신호 없이 이 시간이 지나면 `no_release` 1건 기록 (관측만). */
export const ENTRY_NO_RELEASE_OBSERVE_MS = 20_000;
/** 이보다 짧게 숨겨졌다 돌아온 것은 복귀로 기록하지 않는다. */
export const ENTRY_RESUME_MIN_HIDDEN_MS = 5 * 60_000;
/** 복귀 기록 최소 간격. */
export const ENTRY_RESUME_MIN_GAP_MS = 15 * 60_000;

const RECOVERY_KEY = "dibay:entry-telemetry:pending-recovery";
const RELOADS_KEY = "dibay:entry-telemetry:chunk-reloads";

type BootMetricsLike = Partial<Record<string, number | string | null>>;

type CapacitorLike = {
  getPlatform?: () => string;
  Plugins?: { App?: { getInfo?: () => Promise<{ version?: string; build?: string }> } };
};

type RuntimeWindow = Window & {
  __DIBAY_NATIVE_RESTORE_HINT__?: string;
  Capacitor?: CapacitorLike;
};

type State = {
  run: string;
  seq: number;
  started: boolean;
  released: boolean;
  releaseReason: string | null;
  releaseAt: number | null;
  noReleaseSent: boolean;
  hiddenAt: number | null;
  lastResumeSentAt: number | null;
  appInfo: { version: string | null; build: string | null } | null;
  appInfoPromise: Promise<void> | null;
};

let state: State = freshState();

function freshState(): State {
  return {
    run: newRunId(),
    seq: 0,
    started: false,
    released: false,
    releaseReason: null,
    releaseAt: null,
    noReleaseSent: false,
    hiddenAt: null,
    lastResumeSentAt: null,
    appInfo: null,
    appInfoPromise: null,
  };
}

function newRunId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    /* fallback below */
  }
  let s = "";
  for (let i = 0; i < 32; i += 1) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function win(): RuntimeWindow | null {
  return typeof window === "undefined" ? null : (window as RuntimeWindow);
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
}

function readPlatform(w: RuntimeWindow): EntryPlatform {
  try {
    const p = w.Capacitor?.getPlatform?.();
    if (p === "android" || p === "ios") return p;
  } catch {
    /* web */
  }
  return "web";
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string | null): void {
  try {
    if (value == null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function readReloadCount(): number {
  const n = Number(readSession(RELOADS_KEY) ?? "0");
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
}

function readStages(w: RuntimeWindow): EntryStages {
  // startup-metrics 가 전역 타입을 선언한다 — 여기서는 읽기 전용 느슨한 형태로만 본다.
  const m: BootMetricsLike =
    (w as unknown as { __dibayBootMetrics?: BootMetricsLike }).__dibayBootMetrics ?? {};
  const t: EntryStages = {
    nativeStart: num(m.nativeStart),
    webviewReady: num(m.webviewReady),
    firstHtml: num(m.firstHtml),
    reactMounted: num(m.reactMounted),
    firstPaint: num(m.firstPaint),
    shellReady: num(m.shellReady),
    visualReady: num(m.initialDestinationVisualReady),
    release: state.releaseAt != null ? Math.round(state.releaseAt) : undefined,
  };
  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      t.responseStart = num(nav.responseStart);
      t.domInteractive = num(nav.domInteractive);
    }
  } catch {
    /* no navigation timing */
  }
  for (const k of Object.keys(t) as (keyof EntryStages)[]) if (t[k] === undefined) delete t[k];
  return t;
}

/**
 * AppEntryKind 는 lifecycle 모듈(`getAppEntryDecision`)이 문서당 1회 판정해 window 에 캐시한다.
 * 판정에 부수 효과(복원 정보 폐기)가 있으므로 여기서는 판정을 일으키지 않고 캐시만 읽는다.
 */
const APP_ENTRY_DECISION_KEY = "__dibayAppEntryDecision";

function readEntryKind(w: RuntimeWindow): string | null {
  try {
    const d = (w as unknown as Record<string, { kind?: unknown } | undefined>)[APP_ENTRY_DECISION_KEY];
    return typeof d?.kind === "string" ? d.kind : null;
  } catch {
    return null;
  }
}

function ensureAppInfo(w: RuntimeWindow): Promise<void> {
  if (state.appInfo) return Promise.resolve();
  if (state.appInfoPromise) return state.appInfoPromise;
  const getInfo = w.Capacitor?.Plugins?.App?.getInfo;
  if (typeof getInfo !== "function") {
    state.appInfo = { version: null, build: null };
    return Promise.resolve();
  }
  state.appInfoPromise = new Promise<void>((resolve) => {
    let done = false;
    const finish = (info: { version?: string; build?: string } | null) => {
      if (done) return;
      done = true;
      state.appInfo = {
        version: typeof info?.version === "string" ? info.version : null,
        build: typeof info?.build === "string" ? info.build : null,
      };
      resolve();
    };
    try {
      getInfo
        .call(w.Capacitor?.Plugins?.App)
        .then((info) => finish(info ?? null))
        .catch(() => finish(null));
    } catch {
      finish(null);
    }
    // 플러그인 응답이 없을 때 송신이 무기한 밀리지 않게 한다 (관측 경로 전용).
    setTimeout(() => finish(null), 1500);
  });
  return state.appInfoPromise;
}

function buildEvent(
  w: RuntimeWindow,
  kind: EntryEventKind,
  ev: EntryEventType,
  extra: { failure?: EntryFailureClass | null; hiddenMs?: number | null; recovery?: { prev: EntryFailureClass | null } | null }
): EntryTelemetryEvent {
  state.seq += 1;
  return {
    v: ENTRY_TELEMETRY_SCHEMA_VERSION,
    run: state.run,
    seq: state.seq,
    kind,
    ev,
    platform: readPlatform(w),
    appVersion: state.appInfo?.version ?? null,
    appBuild: state.appInfo?.build ?? null,
    webSha: (process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA ?? "").trim() || null,
    entryKind: readEntryKind(w),
    restoreHint: typeof w.__DIBAY_NATIVE_RESTORE_HINT__ === "string" ? w.__DIBAY_NATIVE_RESTORE_HINT__ : null,
    releaseReason: state.releaseReason,
    failure: extra.failure ?? null,
    recovery: extra.recovery ? "after_reload" : "none",
    prevFailure: extra.recovery?.prev ?? null,
    reloads: readReloadCount(),
    ageMs: Math.round(nowMs()),
    hiddenMs: extra.hiddenMs ?? null,
    visible: typeof document !== "undefined" ? document.visibilityState === "visible" : false,
    t: readStages(w),
  };
}

function transmit(event: EntryTelemetryEvent): void {
  try {
    const body = JSON.stringify(event);
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav && typeof nav.sendBeacon === "function") {
      if (nav.sendBeacon(ENTRY_TELEMETRY_ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    }
    if (typeof fetch === "function") {
      void fetch(ENTRY_TELEMETRY_ENDPOINT, {
        method: "POST",
        body,
        keepalive: true,
        credentials: "omit",
        headers: { "content-type": "text/plain" },
      }).catch(() => undefined);
    }
  } catch {
    /* 관측 실패는 무시 */
  }
}

function canSend(): boolean {
  return state.seq < ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN;
}

/** 즉시 보낸다 (새로고침 직전 등 문서가 곧 사라질 때). 앱 정보가 아직 없으면 없는 채로 보낸다. */
function sendNow(kind: EntryEventKind, ev: EntryEventType, extra: Parameters<typeof buildEvent>[3]): void {
  const w = win();
  if (!w || !canSend()) return;
  transmit(buildEvent(w, kind, ev, extra));
}

/** 유휴 시점에 보낸다 (앱 정보를 기다릴 수 있을 때). */
function sendIdle(kind: EntryEventKind, ev: EntryEventType, extra: Parameters<typeof buildEvent>[3]): void {
  const w = win();
  if (!w || !canSend()) return;
  const run = () => {
    void ensureAppInfo(w).then(() => {
      if (!canSend()) return;
      transmit(buildEvent(w, kind, ev, extra));
    });
  };
  try {
    const ric = (w as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (typeof ric === "function") ric(run, { timeout: 3000 });
    else setTimeout(run, 0);
  } catch {
    run();
  }
}

function takePendingRecovery(): { prev: EntryFailureClass | null } | null {
  const raw = readSession(RECOVERY_KEY);
  if (!raw) return null;
  writeSession(RECOVERY_KEY, null);
  if ((ENTRY_FAILURE_CLASSES as readonly string[]).includes(raw)) return { prev: raw as EntryFailureClass };
  return { prev: null };
}

/** 문서(앱 실행)마다 1회 — AppBootProvider 마운트 시. 관측 한도·복귀 감지를 건다. */
export function startEntryTelemetry(): void {
  try {
    const w = win();
    if (!w || state.started) return;
    state.started = true;
    void ensureAppInfo(w);

    setTimeout(() => {
      try {
        if (state.released || state.noReleaseSent) return;
        state.noReleaseSent = true;
        sendIdle("cold", "no_release", {});
      } catch {
        /* ignore */
      }
    }, ENTRY_NO_RELEASE_OBSERVE_MS);

    document.addEventListener("visibilitychange", () => {
      try {
        if (document.visibilityState === "hidden") {
          state.hiddenAt = nowMs();
          return;
        }
        if (state.hiddenAt == null) return;
        const hiddenMs = nowMs() - state.hiddenAt;
        state.hiddenAt = null;
        if (hiddenMs < ENTRY_RESUME_MIN_HIDDEN_MS) return;
        const now = nowMs();
        if (state.lastResumeSentAt != null && now - state.lastResumeSentAt < ENTRY_RESUME_MIN_GAP_MS) return;
        state.lastResumeSentAt = now;
        sendIdle("resume", "resume", { hiddenMs });
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* 관측 실패는 무시 */
  }
}

/** 시작 화면 해제 신호 (startup-metrics `tryDismissNativeSplash`) — 문서당 1회 기록. */
export function noteEntryReleased(reason: string): void {
  try {
    if (state.released) return;
    state.released = true;
    state.releaseReason = reason;
    state.releaseAt = nowMs();
    sendIdle("cold", "released", { recovery: takePendingRecovery() });
  } catch {
    /* ignore */
  }
}

/**
 * 시작·복귀 중 실패. `chunk_reload` 는 곧 새로고침되므로 즉시 보내고, 다음 문서가 `after_reload` 로 회복 여부를 남긴다.
 */
export function noteEntryFailure(failure: EntryFailureClass): void {
  try {
    const w = win();
    if (!w) return;
    const kind: EntryEventKind = state.released ? "resume" : "cold";
    if (failure === "chunk_reload") {
      writeSession(RECOVERY_KEY, failure);
      writeSession(RELOADS_KEY, String(readReloadCount() + 1));
      sendNow(kind, "failure", { failure });
      return;
    }
    sendIdle(kind, "failure", { failure });
  } catch {
    /* ignore */
  }
}

export function resetEntryTelemetryForTests(): void {
  state = freshState();
}
