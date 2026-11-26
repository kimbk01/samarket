"use client";

/**
 * 방 단위 **비공개** 토픽 `cm-read-ack:<roomId>` — 상대 mark_read 직후 서버(서비스 롤) broadcast 수신.
 * 방 Phase1 이 열린 방마다 acquire(같은 viewer+room 은 refcount 공유).
 * 수신 권한: `realtime.messages` SELECT 정책(방 접근 가능자) — 구 전역 토픽 `cm_read_ack` 는 폐기.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { createRealtimeAuthBridge } from "@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  CM_READ_ACK_BROADCAST_EVENT,
  communityMessengerReadAckChannelName,
} from "@/lib/community-messenger/realtime/cm-read-ack-channel";
import {
  createMessengerPrivateChannelStatusHandler,
  messengerPrivateBroadcastChannelOptions,
} from "@/lib/community-messenger/realtime/private-broadcast-client";
import { getSupabaseClient } from "@/lib/supabase/client";
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

export { CM_READ_ACK_BROADCAST_EVENT, communityMessengerReadAckChannelName };

type ReadAckEntry = { refcount: number; stop: () => void };

/** read-ack 재구독 백오프 — 1s → 2s → 5s → 10s(상한). realtime-js rejoin 간격과 같은 단계 */
export function readAckResubscribeDelayMs(attempt: number): number {
  const steps = [1_000, 2_000, 5_000, 10_000];
  return steps[Math.min(Math.max(0, Math.floor(attempt)), steps.length - 1)]!;
}
const readAckEntries = new Map<string, ReadAckEntry>();

function subscribeCmReadAckBroadcast(viewerUserId: string, subscribeRoomId: string): () => void {
  const sb = getSupabaseClient();
  if (!sb) return () => undefined;

  let cancelled = false;
  let ch: RealtimeChannel | null = null;
  let readAckGeneration = 0;

  const onBroadcast = (msg: unknown, callbackGeneration: number) => {
    if (cancelled || callbackGeneration !== readAckGeneration) return;
    const raw =
      msg && typeof msg === "object" && "payload" in msg
        ? (msg as { payload?: unknown }).payload
        : undefined;
    const p = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const roomId = typeof p.roomId === "string" ? p.roomId.trim() : "";
    const readerUserId = typeof p.readerUserId === "string" ? p.readerUserId.trim() : "";
    const lastReadMessageId =
      typeof p.lastReadMessageId === "string" && p.lastReadMessageId.trim() ? p.lastReadMessageId.trim() : null;
    const lastReadAt = typeof p.lastReadAt === "string" && p.lastReadAt.trim() ? p.lastReadAt.trim() : null;
    if (!roomId || !readerUserId) return;
    /** 토픽=방 — 페이로드 roomId 가 다른 방이면 무시(라우팅 방어) */
    if (roomId.toLowerCase() !== subscribeRoomId) return;
    if (messengerUserIdsEqual(readerUserId, viewerUserId)) return;

    cmRtReadSyncLog("read_ack_broadcast_received", {
      roomId,
      viewerUserId,
      participantUserId: readerUserId,
      lastReadMessageId,
      lastReadAt,
    });

    postCommunityMessengerBusEvent({
      type: "cm.room.peer_read_ack",
      roomId,
      readerUserId,
      lastReadMessageId,
      lastReadAt,
      at: Date.now(),
    });
  };

  const topic = communityMessengerReadAckChannelName(subscribeRoomId);
  /**
   * X4: 같은 토픽 이전 채널 제거 완료 뒤 생성(세대 번호로 취소 확인).
   * 토큰 갱신 재구독은 하지 않는다 — supabase-js/`lib/supabase/client.ts` 의 `realtime.setAuth` 가
   * 가입된 채널에 새 토큰을 보내고 join payload 도 갱신한다(재구독이 오히려 채널을 죽였음).
   */
  /**
   * 안전망(토큰 갱신 재구독 삭제 뒤): 서버가 채널을 닫거나(CLOSED) 가입 실패(CHANNEL_ERROR·TIMED_OUT)가
   * 회복되지 않으면 같은 세대일 때만 백오프 뒤 다시 구독한다. realtime-js 의 rejoin 으로 이미 joined/joining 이면 건너뜀.
   * 우리가 스스로 제거한 채널의 CLOSED 는 세대가 바뀌었거나 cancelled 라 무시된다.
   */
  let recoveryAttempt = 0;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let parkUnregister: (() => void) | null = null;
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
  const park = (bindGen: number) => {
    if (cancelled || bindGen !== readAckGeneration || parkUnregister) return;
    clearRecoveryTimer();
    /** 독립 감사 F3: 콜백이 즉시 불려도 해제 함수가 남아 다음 상한을 막지 않게 */
    let fired = false;
    const unregister = whenMessengerRealtimeJoinAllowed(() => {
      fired = true;
      parkUnregister = null;
      if (cancelled || bindGen !== readAckGeneration) return;
      recoveryAttempt = 0;
      subscribeReadAckChannel();
    });
    if (!fired) parkUnregister = unregister;
    const old = ch;
    ch = null;
    if (old) releaseMessengerChannel(sb, old);
  };
  const scheduleRecovery = (bindGen: number, status: string) => {
    if (cancelled || bindGen !== readAckGeneration || recoveryTimer != null || parkUnregister) return;
    if (messengerRealtimeSupervisorEnabled()) {
      /** 2차 감사 F-E: 자체 루프 실패도 감독 창에 센다(CLOSED 제외 — 감독과 같은 규칙) */
      if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") noteMessengerRealtimeSelfLoopFailure();
      if (recoveryAttempt >= RT_SELF_LOOP_MAX_CONSECUTIVE_FAILURES || !messengerRealtimeSupervisorAllowsJoin()) {
        park(bindGen);
        return;
      }
    }
    const delay = readAckResubscribeDelayMs(recoveryAttempt);
    recoveryAttempt += 1;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (cancelled || bindGen !== readAckGeneration) return;
      const state = ch ? String((ch as { state?: unknown }).state ?? "") : "";
      if (state === "joined" || state === "joining") return;
      subscribeReadAckChannel();
    }, delay);
  };

  const subscribeReadAckChannel = () => {
    if (cancelled) return;
    const bindGen = ++readAckGeneration;
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
      if (cancelled || bindGen !== readAckGeneration) return;
      ch = sb
        .channel(topic, messengerPrivateBroadcastChannelOptions())
        .on("broadcast", { event: CM_READ_ACK_BROADCAST_EVENT }, (msg) => onBroadcast(msg, bindGen))
        .subscribe(
          createMessengerPrivateChannelStatusHandler({
            sb,
            scope: "read_ack",
            onStatus: (status) => {
              if (cancelled || bindGen !== readAckGeneration) return;
              if (status === "SUBSCRIBED") {
                recoveryAttempt = 0;
                clearRecoveryTimer();
                return;
              }
              if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                scheduleRecovery(bindGen, status);
              }
            },
          })
        );
    })();
  };

  const bridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: subscribeReadAckChannel,
  });
  /** 2차 감사 F-E: 감독 차단이 열리면 가입된 채널도 놓고 대기 */
  const offSupervisorOpen = onMessengerRealtimeSupervisorOpen(() => park(readAckGeneration));

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

/**
 * 방 단위 read-ack 비공개 구독 — 같은 viewer+room 은 refcount 로 공유.
 * `roomId` 는 서버 발행과 같은 canonical `community_messenger_rooms.id` (방 Phase1 의 `streamRoomId`).
 */
export function acquireCommunityMessengerReadAckBroadcast(viewerUserId: string, roomId: string): () => void {
  const uid = viewerUserId.trim();
  const rid = String(roomId ?? "").trim().toLowerCase();
  if (!uid || !rid) return () => undefined;
  const key = `${uid}\0${rid}`;

  let entry = readAckEntries.get(key);
  if (!entry) {
    entry = { refcount: 0, stop: subscribeCmReadAckBroadcast(uid, rid) };
    readAckEntries.set(key, entry);
  }
  entry.refcount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const cur = readAckEntries.get(key);
    if (!cur) return;
    cur.refcount = Math.max(0, cur.refcount - 1);
    if (cur.refcount === 0) {
      readAckEntries.delete(key);
      cur.stop();
    }
  };
}
