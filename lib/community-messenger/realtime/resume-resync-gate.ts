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
  flushDeferredMessengerResync,
  messengerRealtimeResyncDeferred,
  messengerRealtimeResyncPending,
  onMessengerRealtimeResynced,
} from "@/lib/community-messenger/realtime/messenger-realtime-resync";
import { lastHiddenSpanMs } from "@/lib/community-messenger/realtime/messenger-app-visibility";

/** realtime-js 2.99.2 `CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL` 과 같은 값 */
export const RESUME_RESYNC_SKIP_MAX_HIDDEN_MS = 25_000;
/** 숨김·보임 시계는 `messenger-app-visibility.ts` 로 옮김(2026-11-28) — 예전 이름으로도 쓰게 다시 내보낸다 */
export {
  RESUME_SIGNAL_WINDOW_MS,
  ensureResumeVisibilityClock,
  hiddenSpanFrom,
  lastHiddenSpanMs,
} from "@/lib/community-messenger/realtime/messenger-app-visibility";

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
export function resumeRefetchPlan(
  inputs: ResumeResyncInputs & { reconnectExpected: boolean; resyncDeferred?: boolean }
): ResumeRefetchPlan {
  /**
   * 숨김 중 재연결로 밀린 재동기화 묶음이 있으면 그 묶음(보일 때 1번)이 받는다 — 연결·감독 상태와 무관하게 기다린다
   * (2026-11-28 설계 hidden-reconnect-resync-design §3-3 · 독립 검토: 이 조건이 없으면 받는 쪽마다 2번 조회).
   */
  if (inputs.resyncDeferred) return "wait_resync";
  const connected = inputs.allChannelsLive && inputs.socketConnected;
  if (connected) return inputs.hiddenSpanMs >= RESUME_RESYNC_SKIP_MAX_HIDDEN_MS ? "now" : "skip";
  return inputs.reconnectExpected ? "wait_resync" : "now";
}

export type ResumeRefetchSchedulerDeps = {
  plan: () => ResumeRefetchPlan;
  onResynced: (cb: () => void) => () => void;
  /** 실행을 기다리는 재동기화 묶음이 있는가 */
  resyncPending: () => boolean;
  /** 숨김 중 밀린 묶음을 (다음 차례에) 실행시킨다 — 기다리기 시작한 뒤·기다림 끝에 부른다 */
  flushDeferred?: () => void;
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
      if (deps.resyncPending()) {
        /** 묶음이 실행되면 onResynced 가 finish 한다 — 숨김으로 밀린 채면 지금 실행시킨다(보임 알림을 놓친 경우 안전망) */
        deps.flushDeferred?.();
        return;
      }
      finish();
      refetch();
    }, RESUME_REFETCH_WAIT_FOR_RESYNC_MS);
    /** 다시 열기 신호 자체가 「보임」이다 — 보임 알림을 놓쳤어도 밀린 묶음을 실행시킨다(다음 차례 실행이라 위 기다림이 먼저 걸린다) */
    deps.flushDeferred?.();
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
      resyncDeferred: messengerRealtimeResyncDeferred(),
    }),
  onResynced: onMessengerRealtimeResynced,
  resyncPending: messengerRealtimeResyncPending,
  flushDeferred: flushDeferredMessengerResync,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
});

/** 친구요청 피드·알림 배지의 다시 열기 조회 — skip / 바로 / 재동기화 기다림. 반환 = 취소 */
export function scheduleResumeRefetch(refetch: () => void): () => void {
  return scheduleResumeRefetchDefault(refetch);
}

/** 지금 다시 열기 조회가 필요한가 (판정만 — 기다림 없이 쓰는 곳용) */
export function shouldRefetchOnAppResume(): boolean {
  /** 밀린 재동기화 묶음이 있으면 예약(`scheduleResumeRefetch`)으로 넘긴다 — 예약이 묶음을 기다리고, 실행시킨다 */
  if (messengerRealtimeResyncDeferred()) return true;
  /** 네이티브 `appStateChange(isActive)` 가 visibilitychange 보다 먼저 와도 숨김 시작 시각으로 잰다 */
  return resumeRefetchNeeded({
    allChannelsLive: messengerRealtimeAllSupervisedChannelsLive(),
    socketConnected: realtimeSocketConnected(),
    hiddenSpanMs: lastHiddenSpanMs(),
  });
}
