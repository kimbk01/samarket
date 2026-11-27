"use client";

/**
 * 앱 다시 열기 조회 판정 — 실시간이 이미 따라잡는 값을 다시 열 때마다 또 조회하지 않는다.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/resume-fixed-cost-design-2026-11-27.md §4
 *
 * 다시 열 때 실시간 소켓은 둘 중 하나다.
 * - 끊기지 않았다 → 숨겨진 동안의 변경도 소켓으로 받았다(놓친 것 없음).
 * - 끊겼다 다시 붙었다 → 재연결 따라잡기(D2 R2 `onMessengerRealtimeResynced`)가 1번 다시 받는다.
 * 그래서 아래가 모두 참일 때만 「다시 열기 조회」를 건너뛴다. 하나라도 아니면 지금처럼 조회한다.
 * 1. 감독하는 실시간 채널이 모두 지금 SUBSCRIBED (차단·쉼·재시도·오프라인 일시정지 아님)
 * 2. 실시간 소켓이 열려 있음
 * 3. 숨겨져 있던 시간이 연결 확인 간격(realtime-js 2.99.2 `HEARTBEAT_INTERVAL` 25초) 미만
 *    — 백그라운드에서 오래 멈추면 서버가 이미 연결을 끊었는데 기기는 아직 「연결됨」으로 보일 수 있다.
 *      그 경우 변경을 놓쳤을 수 있으므로 조회한다.
 */
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  messengerRealtimeAllSupervisedChannelsLive,
  messengerRealtimeReconnectExpected,
} from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";
import {
  MESSENGER_RESYNC_ALL_LIVE_MAX_WAIT_MS,
  messengerRealtimeResyncPending,
  onMessengerRealtimeResynced,
} from "@/lib/community-messenger/realtime/messenger-realtime-resync";

/** realtime-js 2.99.2 `CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL` 과 같은 값 */
export const RESUME_RESYNC_SKIP_MAX_HIDDEN_MS = 25_000;
/**
 * 「방금 다시 열림」으로 보는 창. 보임이 된 지 이보다 오래면 지금 신호(창 포커스 등)는 새 다시 열기가 아니다 —
 * 그 사이 숨김이 없었으므로 숨김 시간 0으로 본다(옛 숨김 시간으로 매 포커스마다 조회하지 않게).
 */
export const RESUME_SIGNAL_WINDOW_MS = 5_000;

let hiddenAt: number | null = null;
let visibleAt: number | null = null;
let installed = false;

/**
 * 숨김·보임 시각 기록을 단다(1번만). 다시 열기 조회를 쓰는 쪽이 시작할 때 부른다 — 모듈을 불러오는 것만으로는 달지 않는다.
 * 기록을 달기 전 숨김은 모르므로 0으로 본다(그 전 다시 열기는 앱 시작 직후뿐이다).
 */
export function ensureResumeVisibilityClock(): void {
  if (installed) return;
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  installed = true;
  if (document.visibilityState === "hidden") hiddenAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") markHidden();
    else visibleAt = Date.now();
  });
  window.addEventListener("pagehide", markHidden);
  /** 네이티브 앱 상태 — WebView 숨김 이벤트가 늦거나 빠져도 백그라운드 시작 시각을 남긴다 */
  void import("@capacitor/core")
    .then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      return import("@capacitor/app").then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) markHidden();
          else if (hiddenAt != null && (visibleAt == null || visibleAt < hiddenAt)) visibleAt = Date.now();
        })
      );
    })
    .catch(() => {
      /* 웹 이벤트만 쓴다 */
    });
}

/** 숨김 시작 — 이미 숨김 중이면(보임 이후 첫 숨김 신호가 아니면) 처음 시각을 유지한다 */
function markHidden(): void {
  const now = Date.now();
  if (hiddenAt != null && (visibleAt == null || hiddenAt > visibleAt)) return;
  hiddenAt = now;
}

/** 순수 계산 — 가장 최근 숨김 시간(ms). 기록을 달지 못했으면 모름 = 무한(→ 조회한다), 숨긴 적이 없으면 0 */
export function hiddenSpanFrom(input: {
  installed: boolean;
  hiddenAt: number | null;
  visibleAt: number | null;
  now: number;
}): number {
  const { installed: on, hiddenAt: h, visibleAt: v, now } = input;
  if (!on) return Number.POSITIVE_INFINITY;
  if (h == null) return 0;
  if (v != null && v >= h) {
    /** 보임이 된 지 오래 — 이번 신호는 새 다시 열기가 아니다(데스크톱 창 포커스 등) */
    if (now - v > RESUME_SIGNAL_WINDOW_MS) return 0;
    return v - h;
  }
  /** 아직 보임 시각이 안 찍혔다(네이티브 appStateChange 가 visibilitychange 보다 먼저 옴) — 숨김 시작부터 지금까지 */
  return Math.max(0, now - h);
}

/** 가장 최근에 숨겨져 있던 시간(ms) */
export function lastHiddenSpanMs(now: number = Date.now()): number {
  return hiddenSpanFrom({ installed, hiddenAt, visibleAt, now });
}

export type ResumeResyncInputs = {
  allChannelsLive: boolean;
  socketConnected: boolean;
  hiddenSpanMs: number;
};

/** 순수 판정 — true = 다시 열기 조회를 한다 */
export function resumeRefetchNeeded(inputs: ResumeResyncInputs): boolean {
  if (!inputs.allChannelsLive) return true;
  if (!inputs.socketConnected) return true;
  return inputs.hiddenSpanMs >= RESUME_RESYNC_SKIP_MAX_HIDDEN_MS;
}

function realtimeSocketConnected(): boolean {
  try {
    return getSupabaseClient()?.realtime.isConnected() === true;
  } catch {
    return false;
  }
}

/**
 * 다시 열기 조회를 재연결 따라잡기로 대신할 때 기다리는 시간 — 재동기화 최대 대기(8초) + 1초 (Owner 승인 값).
 * 설계 docs/audit/supabase-request-surge-2026-11-18/resume-reconnect-wait-design-2026-11-27.md §3-1
 */
export const RESUME_REFETCH_WAIT_FOR_RESYNC_MS = MESSENGER_RESYNC_ALL_LIVE_MAX_WAIT_MS + 1_000;

export type ResumeRefetchPlan = "skip" | "now" | "wait_resync";

/**
 * 순수 판정 — 다시 열기 조회를 어떻게 할까.
 * - skip: 모든 채널 연결·소켓 열림·짧게 숨김 (놓친 것 없음)
 * - now: 연결은 살아 보이는데 오래 숨김(겉으로만 열린 소켓일 수 있음) · 재연결을 기대할 수 없음(차단·오프라인·감독 꺼짐)
 * - wait_resync: 연결이 끊겼거나 채널이 다시 붙는 중이고 감독이 가입을 허용 — 곧 올 재동기화로 대신, 안 오면 조회
 *   (Samsung 실기: 백그라운드 약 2초 뒤 소켓 1006 종료 → 다시 열 때마다 재연결)
 */
export function resumeRefetchPlan(inputs: ResumeResyncInputs & { reconnectExpected: boolean }): ResumeRefetchPlan {
  const connected = inputs.allChannelsLive && inputs.socketConnected;
  if (connected) return inputs.hiddenSpanMs >= RESUME_RESYNC_SKIP_MAX_HIDDEN_MS ? "now" : "skip";
  return inputs.reconnectExpected ? "wait_resync" : "now";
}

export type ResumeRefetchSchedulerDeps = {
  plan: () => ResumeRefetchPlan;
  onResynced: (cb: () => void) => () => void;
  /** 실행을 기다리는 재동기화 묶음이 있는가 */
  resyncPending: () => boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
};

/**
 * 다시 열기 조회 예약. 반환 = 취소(아직 기다리는 중이면 기다림을 끝내고 조회하지 않는다).
 * wait_resync: 기다림 안에 재동기화가 오면 조회 0(재동기화 받는 쪽이 이미 다시 받는다), 끝까지 안 오면 1번 조회.
 * 9초가 끝날 때 재동기화 묶음이 이미 시작돼 기다리는 중이면(첫 재가입이 신호보다 늦게 와 상한 8초가 신호 +9초를 넘는 경우)
 * 조회하지 않고 그 묶음을 기다린다 — 묶음은 상한 안에 반드시 1번 실행되고 그것이 받는다(독립 재감사 2026-11-27: 이 경우 2번 조회가 남던 빈틈).
 */
export function createResumeRefetchScheduler(deps: ResumeRefetchSchedulerDeps) {
  return (refetch: () => void): (() => void) => {
    const plan = deps.plan();
    if (plan === "skip") return () => undefined;
    if (plan === "now") {
      refetch();
      return () => undefined;
    }
    let done = false;
    let timer: unknown = null;
    let off: (() => void) | null = null;
    const finish = () => {
      done = true;
      if (timer != null) deps.clearTimer(timer);
      timer = null;
      off?.();
      off = null;
    };
    off = deps.onResynced(() => {
      if (!done) finish();
    });
    timer = deps.setTimer(() => {
      timer = null;
      if (done) return;
      if (deps.resyncPending()) return; // 묶음이 실행되면 onResynced 가 finish 한다
      finish();
      refetch();
    }, RESUME_REFETCH_WAIT_FOR_RESYNC_MS);
    return () => {
      if (!done) finish();
    };
  };
}

const scheduleResumeRefetchDefault = createResumeRefetchScheduler({
  plan: () =>
    resumeRefetchPlan({
      allChannelsLive: messengerRealtimeAllSupervisedChannelsLive(),
      socketConnected: realtimeSocketConnected(),
      hiddenSpanMs: lastHiddenSpanMs(),
      reconnectExpected: messengerRealtimeReconnectExpected(),
    }),
  onResynced: onMessengerRealtimeResynced,
  resyncPending: messengerRealtimeResyncPending,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
});

/** 친구요청 피드·알림 배지의 다시 열기 조회 — skip / 바로 / 재동기화 기다림. 반환 = 취소 */
export function scheduleResumeRefetch(refetch: () => void): () => void {
  return scheduleResumeRefetchDefault(refetch);
}

/** 지금 다시 열기 조회가 필요한가 (판정만 — 기다림 없이 쓰는 곳용) */
export function shouldRefetchOnAppResume(): boolean {
  /** 네이티브 `appStateChange(isActive)` 가 visibilitychange 보다 먼저 와도 숨김 시작 시각으로 잰다 */
  return resumeRefetchNeeded({
    allChannelsLive: messengerRealtimeAllSupervisedChannelsLive(),
    socketConnected: realtimeSocketConnected(),
    hiddenSpanMs: lastHiddenSpanMs(),
  });
}
