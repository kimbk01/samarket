"use client";

/**
 * D2 R2 — 「재연결 1번 = 재동기화 1번」 (Owner 「개정안 승인」 2026-11-26).
 * 개정안: docs/audit/supabase-request-surge-2026-11-18/messenger-realtime-contract-revision-d1-d2-2026-11-26.md §3 R2
 *
 * 왜: 재연결 때 채널마다 따로 다시 읽었다 — 방 묶음 `firstSubscribeResync`(열린 방마다 after=·bootstrap), 홈 목록 확인,
 * 알림 RESYNC(배지), 친구요청 목록. 실기(2026-11-26 T4 #623)에서 복구 직후 친구요청 19·메시지 19·상대 관계 19건.
 *
 * 규칙:
 * - 채널은 **두 번째 이후** SUBSCRIBED(재연결)에서 스스로 다시 읽지 않고 `noteMessengerRealtimeResubscribed()` 만 부른다.
 *   처음 가입(SUBSCRIBED 1번째)은 지금 그대로 각자 처리한다.
 * - 재가입이 몰리는 동안(마지막 재가입 뒤 1초 조용 · 첫 재가입부터 최대 5초) 기다렸다가 등록된 받는 쪽을 **1번씩** 부른다.
 * - 받는 쪽: 열린 방(방당 after= 1번) · 홈 목록 확인 · 배지 · 친구요청.
 *
 * 1묶음 (2026-11-27 Owner 「구현 승인」 · 설계 docs/audit/supabase-request-surge-2026-11-18/resume-reconnect-wait-design-2026-11-27.md §3-2):
 * Samsung 실기에서 소켓이 끊겼다 붙으면 채널들이 수 초에 걸쳐 흩어져 다시 붙어(보임 +3.4·+5.8초) 「1초 조용」 규칙이
 * 재동기화를 2번 냈다. 감독이 있으면 **감독 채널이 모두 SUBSCRIBED 가 되는 순간** 또는 첫 재가입 뒤 **최대 8초**에 1번 실행한다.
 * 감독이 없으면(롤백 스위치) 예전 규칙(1초 조용 · 최대 5초) 그대로.
 */

import {
  messengerRealtimeAllSupervisedChannelsLive,
  messengerRealtimeSupervisorEnabled,
  onMessengerRealtimeAllChannelsLive,
} from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";

export const MESSENGER_RESYNC_QUIET_MS = 1_000;
export const MESSENGER_RESYNC_MAX_WAIT_MS = 5_000;
/** 감독이 있을 때 첫 재가입부터 최대 대기 — 실측 마지막 재가입 묶음 +5.8초에 여유(Owner 승인 값) */
export const MESSENGER_RESYNC_ALL_LIVE_MAX_WAIT_MS = 8_000;

/** 감독 채널 「모두 연결」 판정·알림 — 없으면 예전 조용 규칙 */
export type MessengerResyncAllLiveSource = {
  isAllLive: () => boolean;
  onAllLive: (cb: () => void) => () => void;
};

export type MessengerResyncCoordinatorDeps = {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  allLive?: MessengerResyncAllLiveSource | null;
};

export type MessengerResyncCoordinator = {
  noteResubscribed: () => void;
  onResynced: (cb: () => void) => () => void;
  /** 재가입이 들어와 실행을 기다리는 묶음이 있는가 — 있으면 상한 안에 반드시 1번 실행된다 */
  isPending: () => boolean;
};

export function createMessengerResyncCoordinator(deps: MessengerResyncCoordinatorDeps): MessengerResyncCoordinator {
  const listeners = new Set<() => void>();
  let timer: unknown = null;
  let firstAt: number | null = null;
  /** 1묶음 모드 — 상한 타이머 · 「곧 실행」 타이머 · 모두 연결 알림 해제 */
  let soonTimer: unknown = null;
  let offAllLive: (() => void) | null = null;

  const fire = () => {
    if (timer != null) deps.clearTimer(timer);
    if (soonTimer != null) deps.clearTimer(soonTimer);
    timer = null;
    soonTimer = null;
    offAllLive?.();
    offAllLive = null;
    firstAt = null;
    for (const cb of [...listeners]) {
      try {
        cb();
      } catch {
        /* 받는 쪽 오류가 다른 받는 쪽을 막지 않게 */
      }
    }
  };

  return {
    noteResubscribed() {
      const t = deps.now();
      const allLive = deps.allLive;
      if (allLive) {
        /** 같은 순간 여러 채널이 함께 붙어도 1번 — 다음 차례(0ms)에 실행 */
        const fireSoon = () => {
          if (soonTimer == null) soonTimer = deps.setTimer(fire, 0);
        };
        if (firstAt == null) {
          firstAt = t;
          timer = deps.setTimer(fire, MESSENGER_RESYNC_ALL_LIVE_MAX_WAIT_MS);
          offAllLive = allLive.onAllLive(fireSoon);
        }
        if (allLive.isAllLive()) fireSoon();
        return;
      }
      if (firstAt == null) firstAt = t;
      if (timer != null) deps.clearTimer(timer);
      const untilMax = Math.max(0, firstAt + MESSENGER_RESYNC_MAX_WAIT_MS - t);
      timer = deps.setTimer(fire, Math.min(MESSENGER_RESYNC_QUIET_MS, untilMax));
    },
    isPending: () => firstAt != null,
    onResynced(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

let defaultCoordinator: MessengerResyncCoordinator | null = null;

function getDefault(): MessengerResyncCoordinator {
  if (!defaultCoordinator) {
    defaultCoordinator = createMessengerResyncCoordinator({
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      allLive: messengerRealtimeSupervisorEnabled()
        ? { isAllLive: messengerRealtimeAllSupervisedChannelsLive, onAllLive: onMessengerRealtimeAllChannelsLive }
        : null,
    });
  }
  return defaultCoordinator;
}

/** 채널의 재연결(두 번째 이후 SUBSCRIBED) — 스스로 다시 읽지 말고 이것만 부른다 */
export function noteMessengerRealtimeResubscribed(): void {
  getDefault().noteResubscribed();
}

/** 실행을 기다리는 재동기화 묶음이 있는가 (다시 열기 기다림이 묶음 끝까지 기다리게) */
export function messengerRealtimeResyncPending(): boolean {
  return getDefault().isPending();
}

/** 재연결 묶음마다 1번 불린다. 반환 = 등록 해제 */
export function onMessengerRealtimeResynced(cb: () => void): () => void {
  return getDefault().onResynced(cb);
}
