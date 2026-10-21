"use client";

/**
 * C-12 — callId 당 세션 GET poller 1개 (공유).
 *
 * 이전: 발신 수락 감지(caller-active 500ms) · 네이티브 발신 종료 동기화(500ms) · 연결 후 종료 감시(1s)가
 * 각자 `GET /calls/sessions/:id` 를 돌려 사용자당 120회/분 제한에 근접 → 기기 여러 대면 429 → 종료 감지 지연.
 *
 * 이제: 같은 callId 구독자는 하나의 1초 타이머·하나의 요청 결과를 공유한다.
 * - 첫 구독 시 즉시 1회 조회(기존 `void tick()` 동작 유지).
 * - 요청 중이면 다음 tick 은 건너뛴다(중첩 요청 0).
 * - 429 는 `Retry-After`(없으면 기본 backoff) 동안 조회를 멈추고 구독자에게 전달하지 않는다.
 * - 구독자가 0이 되면 타이머를 멈춘다.
 */

import {
  callV4FetchSessionForCallerPoll,
  type CallV4CallerPollFetchResult,
} from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

export const CALL_V4_SESSION_STATUS_POLL_MS = 1_000;
/** 429 인데 Retry-After 가 없을 때 */
export const CALL_V4_SESSION_STATUS_DEFAULT_BACKOFF_MS = 5_000;
/** Retry-After 상한 — 종료 감지가 너무 늦어지지 않게 */
export const CALL_V4_SESSION_STATUS_MAX_BACKOFF_MS = 30_000;

export type CallV4SessionStatusListener = (result: CallV4CallerPollFetchResult) => void | Promise<void>;

type PollerEntry = {
  callId: string;
  timer: ReturnType<typeof setInterval> | null;
  /** listener → 조회가 필요한지(없으면 항상). 원하는 구독자가 0이면 그 tick 은 요청하지 않는다. */
  listeners: Map<CallV4SessionStatusListener, (() => boolean) | null>;
  inflight: boolean;
  backoffUntil: number;
};

const pollers = new Map<string, PollerEntry>();

function stopEntry(entry: PollerEntry): void {
  if (entry.timer != null) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
  pollers.delete(entry.callId);
}

async function tickEntry(entry: PollerEntry): Promise<void> {
  if (entry.inflight) return;
  if (entry.listeners.size === 0) return;
  if (![...entry.listeners.values()].some((isWanted) => !isWanted || isWanted())) return;
  const now = Date.now();
  if (now < entry.backoffUntil) return;
  entry.inflight = true;
  let result: CallV4CallerPollFetchResult | null = null;
  try {
    result = await callV4FetchSessionForCallerPoll(entry.callId);
  } catch (error: unknown) {
    logCallV4("session_status_poll_failed", {
      callId: entry.callId,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    entry.inflight = false;
  }
  if (!result) return;
  if (result.httpStatus === 429) {
    const wait = Math.min(
      CALL_V4_SESSION_STATUS_MAX_BACKOFF_MS,
      Math.max(CALL_V4_SESSION_STATUS_POLL_MS, result.retryAfterMs ?? CALL_V4_SESSION_STATUS_DEFAULT_BACKOFF_MS),
    );
    entry.backoffUntil = Date.now() + wait;
    logCallV4("session_status_poll_rate_limited", { callId: entry.callId, waitMs: wait });
    return;
  }
  /** 구독 해제 중 변경되지 않게 스냅샷 */
  for (const listener of [...entry.listeners.keys()]) {
    if (!entry.listeners.has(listener)) continue;
    try {
      await listener(result);
    } catch (error: unknown) {
      logCallV4("session_status_listener_failed", {
        callId: entry.callId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** callId 세션 상태 구독 — 반환 함수로 해제. 같은 listener 를 두 번 등록해도 1회만 호출된다. */
export function subscribeCallV4SessionStatus(
  callId: string,
  listener: CallV4SessionStatusListener,
  options?: {
    isWanted?: () => boolean;
    /** 새 poller 생성 시 즉시 1회 조회(기본 true). 연결 직후 감시는 false — 상태를 이미 안다. */
    immediate?: boolean;
  },
): () => void {
  const sid = callId.trim();
  if (!sid) return () => undefined;
  let entry = pollers.get(sid);
  const created = !entry;
  if (!entry) {
    entry = { callId: sid, timer: null, listeners: new Map(), inflight: false, backoffUntil: 0 };
    pollers.set(sid, entry);
  }
  entry.listeners.set(listener, options?.isWanted ?? null);
  const target = entry;
  if (created) {
    target.timer = setInterval(() => {
      void tickEntry(target);
    }, CALL_V4_SESSION_STATUS_POLL_MS);
    logCallV4("session_status_poll_start", { callId: sid });
    if (options?.immediate !== false) void tickEntry(target);
  }
  return () => {
    target.listeners.delete(listener);
    if (target.listeners.size === 0 && pollers.get(sid) === target) {
      stopEntry(target);
      logCallV4("session_status_poll_stop", { callId: sid });
    }
  };
}

export function readCallV4SessionStatusPollerCountForTests(): number {
  return pollers.size;
}

export function resetCallV4SessionStatusPollerForTests(): void {
  for (const entry of [...pollers.values()]) stopEntry(entry);
  pollers.clear();
}
