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
import { messengerRealtimeAllSupervisedChannelsLive } from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";

/** realtime-js 2.99.2 `CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL` 과 같은 값 */
export const RESUME_RESYNC_SKIP_MAX_HIDDEN_MS = 25_000;

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
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else visibleAt = Date.now();
  });
  window.addEventListener("pagehide", () => {
    hiddenAt = Date.now();
  });
}

/** 가장 최근에 숨겨져 있던 시간(ms). 숨긴 적이 없으면 0. 기록을 달지 못했으면 모름 = 무한(→ 조회한다) */
export function lastHiddenSpanMs(now: number = Date.now()): number {
  if (!installed) return Number.POSITIVE_INFINITY;
  if (hiddenAt == null) return 0;
  if (visibleAt != null && visibleAt >= hiddenAt) return visibleAt - hiddenAt;
  /** 받는 쪽 리스너가 이 시계보다 먼저 불린 경우 — 아직 보임 시각이 안 찍혔다 */
  return Math.max(0, now - hiddenAt);
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

/** 지금 다시 열기 조회가 필요한가 (친구요청·알림 배지·사장님 배지 공용) */
export function shouldRefetchOnAppResume(): boolean {
  /** 네이티브 `appStateChange(isActive)` 가 visibilitychange 보다 먼저 와도 숨김 시작 시각으로 잰다 */
  return resumeRefetchNeeded({
    allChannelsLive: messengerRealtimeAllSupervisedChannelsLive(),
    socketConnected: realtimeSocketConnected(),
    hiddenSpanMs: lastHiddenSpanMs(),
  });
}
