"use client";

/**
 * Realtime 정책 (커뮤니티 메신저)
 *
 * - **구독 수**: 홈은 방 id 를 `in.(…)` 청크로 묶어 WS 채널 수를 줄임 (`COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX`).
 * - **홈 청크 채널**: 각 청크에 `community_messenger_rooms` + `community_messenger_messages` 를 같이 둔다(방 메타만 늦게 오는 경우에도 대화 목록 동기화).
 * - **방 번들**: 방당 단일 채널에 messages / participants / rooms / call_* postgres_changes 를 묶음.
 * - **메타 refresh**: 멤버·방 설정 변경은 연속 이벤트가 많아 디바운스로 `onRefresh` 호출을 합침 — 수치는 `messenger-latency-config.ts` (home-sync 단일 비행으로 폭주 완화).
 * - **통화(방 번들)**: 세션·참가자·로그·call_stub 는 단일 `roomCallBundleRefreshScheduler` 로 합류 (버스트당 GET 1회).
 * - **방 메시지(대화 화면)**: `postgres_changes` INSERT/UPDATE/DELETE 는 콜백으로만 처리; 파싱 실패 시에만 짧은 지연 refresh. 저지연 bump·`message` 스냅샷은 **서버 발행 전용** — `docs/messenger-realtime-policy.md`「Community 메신저 방 메시지」절.
 * - **typing / presence**: 현재 스키마 훅에 없음 — 추가 시 **별 토픽·초경량 페이로드**만 (전체 방 refresh 금지).
 *
 * 채널 빌더: `lib/community-messenger/realtime/community-messenger-*-realtime-channel(s).ts`
 *
 * 상세: `docs/messenger-realtime-policy.md`
 */

import { useEffect, useRef, useState } from "react";
import {
  MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS,
  MESSENGER_ROOM_CALL_REALTIME_BUNDLE_DEBOUNCE_MS,
  MESSENGER_ROOM_META_DEBOUNCE_MS,
  MESSENGER_ROOM_REALTIME_RESUBSCRIBE_RESYNC_DEBOUNCE_MS,
  MESSENGER_VOICE_AUX_DEBOUNCE_MS,
} from "@/lib/community-messenger/messenger-latency-config";
import { bindCommunityMessengerHomeRealtimeChannels } from "@/lib/community-messenger/realtime/community-messenger-home-realtime-channels";
import { attachCommunityMessengerRoomCallPostgresHandlers } from "@/lib/community-messenger/realtime/community-messenger-room-call-realtime-channel";
import { attachCommunityMessengerRoomMetaPostgresHandlers } from "@/lib/community-messenger/realtime/community-messenger-room-meta-realtime-channel";
import { attachCommunityMessengerRoomMessagePostgresHandlers } from "@/lib/community-messenger/realtime/community-messenger-room-message-realtime-channel";
import { createRefreshScheduler } from "@/lib/community-messenger/realtime/community-messenger-realtime-schedulers";
import type {
  CommunityMessengerHomeRealtimeMessageInsertHint,
  CommunityMessengerHomeRealtimeParticipantUnreadHint,
  CommunityMessengerRoomRealtimeMessageEvent,
  CommunityMessengerRoomRealtimeMessageRow,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { syncSupabaseRealtimeAuthFromSession, waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";
import { SAMARKET_REALTIME_TOKEN_REFRESH_EVENT } from "@/lib/supabase/realtime-auth-events";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { cmRtLogAuthEpochBump } from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";

export type {
  CommunityMessengerHomeRealtimeMessageInsertHint,
  CommunityMessengerHomeRealtimeParticipantUnreadHint,
  CommunityMessengerRoomRealtimeMessageEvent,
  CommunityMessengerRoomRealtimeMessageRow,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";

function useStableCallback(callback: () => void) {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  return ref;
}

export function useCommunityMessengerHomeRealtime(args: {
  userId: string | null;
  roomIds?: string[];
  enabled: boolean;
  onRefresh: () => void;
  /** 메시지 INSERT 시 목록 카드만 즉시 갱신( debounced home-sync 와 병행 ) */
  onRealtimeMessageInsert?: (hint: CommunityMessengerHomeRealtimeMessageInsertHint) => void;
  onParticipantUnreadDelta?: (hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => void;
}) {
  const callbackRef = useStableCallback(args.onRefresh);
  const messageInsertHintRef = useRef(args.onRealtimeMessageInsert);
  const participantUnreadDeltaRef = useRef(args.onParticipantUnreadDelta);
  useEffect(() => {
    messageInsertHintRef.current = args.onRealtimeMessageInsert;
  }, [args.onRealtimeMessageInsert]);
  useEffect(() => {
    participantUnreadDeltaRef.current = args.onParticipantUnreadDelta;
  }, [args.onParticipantUnreadDelta]);
  /** 배열 참조와 무관하게 id 집합이 같으면 Realtime 재구독하지 않음 */
  const roomIdsFingerprint = [...new Set((args.roomIds ?? []).filter(Boolean))].sort().join("\0");

  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => {
      setRealtimeAuthEpoch((e) => {
        const next = e + 1;
        cmRtLogAuthEpochBump({ epoch: next, source: "token_refresh" });
        return next;
      });
    };
    window.addEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
    return () => window.removeEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
  }, []);

  useEffect(() => {
    if (!args.enabled || !args.userId) return;
    const userId = args.userId;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const channels: Array<{ stop: () => void }> = [];
    let cancelSchedulers: (() => void) | null = null;
    let deferredAuthCleanup: (() => void) | null = null;
    let deferredAuthPollTimer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      const authOk = await waitForSupabaseRealtimeAuth(sb);
      if (cancelled) return;

      let homeBound = false;
      const bindHomeChannels = () => {
        if (cancelled || homeBound) return;
        homeBound = true;
        const { channels: next, cancelSchedulers: cancel } = bindCommunityMessengerHomeRealtimeChannels({
          sb,
          userId,
          isCancelled: () => cancelled,
          roomIdsFingerprint,
          messageInsertHintRef,
          participantUnreadDeltaRef,
          onRefreshRef: callbackRef,
        });
        cancelSchedulers = cancel;
        for (const item of next) channels.push(item);
      };

      if (authOk) {
        bindHomeChannels();
        return;
      }
      const { data } = sb.auth.onAuthStateChange((_e, session) => {
        if (cancelled || !session?.access_token) return;
        try {
          data.subscription.unsubscribe();
        } catch {
          /* ignore */
        }
        deferredAuthCleanup = null;
        if (deferredAuthPollTimer != null) {
          clearInterval(deferredAuthPollTimer);
          deferredAuthPollTimer = null;
        }
        bindHomeChannels();
      });
      deferredAuthCleanup = () => {
        try {
          data.subscription.unsubscribe();
        } catch {
          /* ignore */
        }
      };
      /**
       * `INITIAL_SESSION` 등 쿠키 복원만으로 세션이 잡히면 `onAuthStateChange` 이벤트가
       * 재생되지 않을 수 있다. 이 경우 단발성 sync만으로는 영구 지연이 나서
       * “새로고침해야 실시간이 붙는” 문제가 생긴다.
       *
       * 그래서 짧은 기간(약 12s) 폴링로 세션 JWT가 잡히는 순간 bind를 보장한다.
       */
      let pollAttempts = 0;
      deferredAuthPollTimer = setInterval(() => {
        if (cancelled) return;
        pollAttempts += 1;
        void syncSupabaseRealtimeAuthFromSession(sb).then((ok) => {
          if (cancelled || !ok) return;
          try {
            data.subscription.unsubscribe();
          } catch {
            /* ignore */
          }
          deferredAuthCleanup = null;
          if (deferredAuthPollTimer != null) {
            clearInterval(deferredAuthPollTimer);
            deferredAuthPollTimer = null;
          }
          bindHomeChannels();
        });
        if (pollAttempts >= 100) {
          if (deferredAuthPollTimer != null) {
            clearInterval(deferredAuthPollTimer);
            deferredAuthPollTimer = null;
          }
        }
      }, 120);
    })();

    return () => {
      cancelled = true;
      deferredAuthCleanup?.();
      deferredAuthCleanup = null;
      if (deferredAuthPollTimer != null) {
        clearInterval(deferredAuthPollTimer);
        deferredAuthPollTimer = null;
      }
      cancelSchedulers?.();
      for (const item of channels) item.stop();
    };
  }, [args.enabled, roomIdsFingerprint, args.userId, callbackRef, realtimeAuthEpoch]);
}

export function useCommunityMessengerRoomRealtime(args: {
  roomId: string | null;
  /** 채널명 분리·세션 전환 시 재구독 — Realtime 토픽은 연결(브라우저) 단위 */
  viewerUserId?: string | null;
  enabled: boolean;
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
}) {
  const callbackRef = useStableCallback(args.onRefresh);
  const messageCallbackRef = useRef(args.onMessageEvent);

  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => {
      setRealtimeAuthEpoch((e) => {
        const next = e + 1;
        cmRtLogAuthEpochBump({ epoch: next, source: "token_refresh" });
        return next;
      });
    };
    window.addEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
    return () => window.removeEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
  }, []);

  useEffect(() => {
    messageCallbackRef.current = args.onMessageEvent;
  }, [args.onMessageEvent]);

  const viewerForChannel = (args.viewerUserId ?? "").trim() || "anon";

  useEffect(() => {
    if (!args.enabled || !args.roomId) return;
    const rid = args.roomId.trim();
    if (!rid) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const channels: Array<{ stop: () => void }> = [];
    let cancelSchedulers: (() => void) | null = null;
    let deferredAuthCleanup: (() => void) | null = null;
    let deferredAuthPollTimer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      const authOk = await waitForSupabaseRealtimeAuth(sb);
      if (cancelled) return;

      let roomBound = false;
      const bindRoomChannels = () => {
        if (cancelled || roomBound) return;
        roomBound = true;

        const messageFallbackRefreshScheduler = createRefreshScheduler(
          callbackRef,
          MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS
        );
        const metaRefreshScheduler = createRefreshScheduler(callbackRef, MESSENGER_ROOM_META_DEBOUNCE_MS);
        const roomCallBundleRefreshScheduler = createRefreshScheduler(
          callbackRef,
          MESSENGER_ROOM_CALL_REALTIME_BUNDLE_DEBOUNCE_MS
        );
        const voiceRefreshScheduler = createRefreshScheduler(callbackRef, MESSENGER_VOICE_AUX_DEBOUNCE_MS);
        const subscribedResyncScheduler = createRefreshScheduler(
          callbackRef,
          MESSENGER_ROOM_REALTIME_RESUBSCRIBE_RESYNC_DEBOUNCE_MS
        );
        cancelSchedulers = () => {
          messageFallbackRefreshScheduler.cancel();
          metaRefreshScheduler.cancel();
          roomCallBundleRefreshScheduler.cancel();
          voiceRefreshScheduler.cancel();
          subscribedResyncScheduler.cancel();
        };

        const isCancelled = () => cancelled;
        let roomBundleSubscribedCount = 0;

        const roomBundle = subscribeWithRetry({
          sb,
          name: `community-messenger-room:bundle:${viewerForChannel}:${rid}`,
          scope: `community-messenger-room:bundle`,
          isCancelled,
          onStatus: (status) => {
            if (status !== "SUBSCRIBED" || cancelled) return;
            roomBundleSubscribedCount += 1;
            if (roomBundleSubscribedCount === 1) {
              callbackRef.current();
            } else {
              subscribedResyncScheduler.schedule();
            }
          },
          onAfterSubscribeFailure: (_status, attempt) => {
            if (cancelled) return;
            if (attempt >= 2) messageFallbackRefreshScheduler.schedule();
          },
          build: (channel) => {
            let c = attachCommunityMessengerRoomMessagePostgresHandlers(channel, {
              roomId: rid,
              isCancelled,
              messageCallbackRef,
              messageFallbackRefreshScheduler,
              roomCallBundleRefreshScheduler,
              voiceRefreshScheduler,
            });
            c = attachCommunityMessengerRoomMetaPostgresHandlers(c, {
              roomId: rid,
              isCancelled,
              metaRefreshScheduler,
            });
            c = attachCommunityMessengerRoomCallPostgresHandlers(c, {
              roomId: rid,
              isCancelled,
              roomCallBundleRefreshScheduler,
              onRefreshRef: callbackRef,
            });
            return c;
          },
        });
        if (cancelled) {
          roomBundle.stop();
          return;
        }
        channels.push(roomBundle);
      };

      if (authOk) {
        bindRoomChannels();
        return;
      }
      const { data } = sb.auth.onAuthStateChange((_e, session) => {
        if (cancelled || !session?.access_token) return;
        try {
          data.subscription.unsubscribe();
        } catch {
          /* ignore */
        }
        deferredAuthCleanup = null;
        if (deferredAuthPollTimer != null) {
          clearInterval(deferredAuthPollTimer);
          deferredAuthPollTimer = null;
        }
        bindRoomChannels();
      });
      deferredAuthCleanup = () => {
        try {
          data.subscription.unsubscribe();
        } catch {
          /* ignore */
        }
      };
      // Home hook와 동일: 쿠키 복원만으로 세션이 잡히는 경우 bind 영구 지연 방지.
      let pollAttempts = 0;
      deferredAuthPollTimer = setInterval(() => {
        if (cancelled) return;
        pollAttempts += 1;
        void syncSupabaseRealtimeAuthFromSession(sb).then((ok) => {
          if (cancelled || !ok) return;
          try {
            data.subscription.unsubscribe();
          } catch {
            /* ignore */
          }
          deferredAuthCleanup = null;
          if (deferredAuthPollTimer != null) {
            clearInterval(deferredAuthPollTimer);
            deferredAuthPollTimer = null;
          }
          bindRoomChannels();
        });
        if (pollAttempts >= 100) {
          if (deferredAuthPollTimer != null) {
            clearInterval(deferredAuthPollTimer);
            deferredAuthPollTimer = null;
          }
        }
      }, 120);
    })();

    return () => {
      cancelled = true;
      deferredAuthCleanup?.();
      deferredAuthCleanup = null;
      if (deferredAuthPollTimer != null) {
        clearInterval(deferredAuthPollTimer);
        deferredAuthPollTimer = null;
      }
      cancelSchedulers?.();
      for (const channel of channels) {
        channel.stop();
      }
    };
  }, [args.enabled, args.roomId, viewerForChannel, callbackRef, realtimeAuthEpoch]);
}
