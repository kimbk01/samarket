"use client";

/**
 * D1 2단계 — 상대 1명의 접속 상태 전환을 비공개 토픽 `cm-presence-user:<userId>` 로 받는다.
 * 화면에 실시간으로 보여 줄 상대(1:1 방 머리글)만 구독 — 같은 상대는 refcount 로 1채널 공유.
 * 수신 권한: 본인 또는 같은 방 참가자(`internal.cm_realtime_can_read_topic`). 권한이 없거나 가입 실패여도
 * 표시는 스냅샷(만료 시 재확인)으로 계속된다 — 실시간 전환만 늦어진다.
 *
 * 구조는 `cm-read-ack-broadcast-client.ts` 와 같다(토픽 lease · auth bridge · 백오프 재구독).
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createRealtimeAuthBridge } from "@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge";
import {
  createMessengerPrivateChannelStatusHandler,
  messengerPrivateBroadcastChannelOptions,
} from "@/lib/community-messenger/realtime/private-broadcast-client";
import {
  releaseMessengerChannel,
  whenMessengerTopicFree,
} from "@/lib/community-messenger/realtime/messenger-channel-topic-lease";
import {
  RT_SELF_LOOP_MAX_CONSECUTIVE_FAILURES,
  messengerRealtimeSupervisorAllowsJoin,
  messengerRealtimeSupervisorEnabled,
  noteMessengerRealtimeSelfLoopFailure,
  onMessengerRealtimeSupervisorOpen,
  whenMessengerRealtimeJoinAllowed,
} from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";
import {
  CM_PRESENCE_USER_BROADCAST_EVENT,
  communityMessengerPresenceUserChannelName,
  parseCmPresenceUserBroadcastPayload,
} from "@/lib/community-messenger/realtime/presence/cm-presence-user-channel";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";
import { getSupabaseClient } from "@/lib/supabase/client";

type Entry = { refcount: number; stop: () => void };
const entries = new Map<string, Entry>();

function resubscribeDelayMs(attempt: number): number {
  const steps = [1_000, 2_000, 5_000, 10_000];
  return steps[Math.min(Math.max(0, Math.floor(attempt)), steps.length - 1)]!;
}

function subscribePresenceUser(peerUserId: string): () => void {
  const sb = getSupabaseClient();
  if (!sb) return () => undefined;

  let cancelled = false;
  let ch: RealtimeChannel | null = null;
  let generation = 0;
  let recoveryAttempt = 0;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let parkUnregister: (() => void) | null = null;
  const topic = communityMessengerPresenceUserChannelName(peerUserId);

  const onBroadcast = (msg: unknown, gen: number) => {
    if (cancelled || gen !== generation) return;
    const raw = msg && typeof msg === "object" && "payload" in msg ? (msg as { payload?: unknown }).payload : undefined;
    const p = parseCmPresenceUserBroadcastPayload(raw);
    if (!p) return;
    /** 토픽 = 사용자 — 다른 사용자 페이로드는 무시(라우팅 방어) */
    if (!messengerUserIdsEqual(p.userId, peerUserId)) return;
    /** 관측 시각 = 수신 시각(상대 기기 시계 오차 배제) — 표시 신선도 판정 기준 */
    useMessengerPresenceStore.getState().upsertPresence(p.userId, {
      state: p.state,
      lastSeenAt: p.state === "offline" ? p.lastSeenAt ?? p.at : p.lastSeenAt,
      updatedAt: new Date().toISOString(),
    });
  };

  const clearRecoveryTimer = () => {
    if (recoveryTimer != null) {
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
  };
  /**
   * D1 R1(2026-11-26): 연속 실패 상한·연결 감독 차단이면 재시도를 멈추고 채널을 놓는다(라이브러리 rejoin 도 멈춤).
   * 다시 가입해도 될 때(차단 닫힘·화면 복귀·온라인) 1번 새로 가입한다.
   * 2차 감사 F-A: 대기를 **먼저** 걸고 `ch` 를 비운 뒤 놓는다 — realtime-js 는 가입 안 된 채널을 놓을 때
   * `CLOSED` 를 동기로 다시 부르는데(`unsubscribe` → `leavePush.trigger('ok')`), 그 호출은 `parkUnregister` 가드에서 멈춘다.
   */
  const park = (gen: number) => {
    if (cancelled || gen !== generation || parkUnregister) return;
    clearRecoveryTimer();
    /** 독립 감사 F3: 콜백이 즉시 불려도 해제 함수가 남아 다음 상한을 막지 않게 */
    let fired = false;
    const unregister = whenMessengerRealtimeJoinAllowed(() => {
      fired = true;
      parkUnregister = null;
      if (cancelled || gen !== generation) return;
      recoveryAttempt = 0;
      subscribeChannel();
    });
    if (!fired) parkUnregister = unregister;
    const old = ch;
    ch = null;
    if (old) releaseMessengerChannel(sb, old);
  };
  const scheduleRecovery = (gen: number, status: string) => {
    if (cancelled || gen !== generation || recoveryTimer != null || parkUnregister) return;
    if (messengerRealtimeSupervisorEnabled()) {
      /** 2차 감사 F-E: 자체 루프 실패도 감독 창에 센다(CLOSED 제외 — 감독과 같은 규칙) */
      if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") noteMessengerRealtimeSelfLoopFailure();
      if (recoveryAttempt >= RT_SELF_LOOP_MAX_CONSECUTIVE_FAILURES || !messengerRealtimeSupervisorAllowsJoin()) {
        park(gen);
        return;
      }
    }
    const delay = resubscribeDelayMs(recoveryAttempt);
    recoveryAttempt += 1;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (cancelled || gen !== generation) return;
      const state = ch ? String((ch as { state?: unknown }).state ?? "") : "";
      if (state === "joined" || state === "joining") return;
      subscribeChannel();
    }, delay);
  };

  const subscribeChannel = () => {
    if (cancelled) return;
    const gen = ++generation;
    clearRecoveryTimer();
    /** 새 세대 가입이면 이전 세대의 대기(쉼)는 버린다 — 새 세대 실패가 막히지 않게 */
    parkUnregister?.();
    parkUnregister = null;
    if (ch) {
      releaseMessengerChannel(sb, ch);
      ch = null;
    }
    void (async () => {
      await whenMessengerTopicFree(sb, topic);
      if (cancelled || gen !== generation) return;
      ch = sb
        .channel(topic, messengerPrivateBroadcastChannelOptions())
        .on("broadcast", { event: CM_PRESENCE_USER_BROADCAST_EVENT }, (msg) => onBroadcast(msg, gen))
        .subscribe(
          createMessengerPrivateChannelStatusHandler({
            sb,
            scope: "presence_user",
            onStatus: (status) => {
              if (cancelled || gen !== generation) return;
              if (status === "SUBSCRIBED") {
                recoveryAttempt = 0;
                clearRecoveryTimer();
                return;
              }
              if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                scheduleRecovery(gen, status);
              }
            },
          })
        );
    })();
  };

  const bridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: subscribeChannel,
  });
  /** 2차 감사 F-E: 감독 차단이 열리면 가입된 채널도 놓고 대기 */
  const offSupervisorOpen = onMessengerRealtimeSupervisorOpen(() => park(generation));

  return () => {
    cancelled = true;
    clearRecoveryTimer();
    parkUnregister?.();
    parkUnregister = null;
    offSupervisorOpen();
    bridgeCleanup();
    if (ch) {
      releaseMessengerChannel(sb, ch);
      ch = null;
    }
  };
}

/** 상대 1명 실시간 접속 상태 구독 — 같은 상대는 1채널 공유(refcount). */
export function acquireCommunityMessengerPresenceUserBroadcast(peerUserId: string): () => void {
  const id = String(peerUserId ?? "").trim().toLowerCase();
  if (!id) return () => undefined;
  let entry = entries.get(id);
  if (!entry) {
    entry = { refcount: 0, stop: subscribePresenceUser(id) };
    entries.set(id, entry);
  }
  entry.refcount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const cur = entries.get(id);
    if (!cur) return;
    cur.refcount = Math.max(0, cur.refcount - 1);
    if (cur.refcount === 0) {
      entries.delete(id);
      cur.stop();
    }
  };
}
