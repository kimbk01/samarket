"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  cmRtLogSubscribe,
  cmRtLogTeardown,
  isCommunityMessengerRealtimeDebugEnabled,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import {
  clearCommunityMessengerRealtimeScope,
  markCommunityMessengerRealtimeScopeSignal,
  registerCommunityMessengerRealtimeScope,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-health";
import { messengerMonitorRealtimeSubscriptionOutcome } from "@/lib/community-messenger/monitoring/client";
import { syncSupabaseRealtimeAuthFromSession, waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";

type SubscribeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CHANNEL_ERROR" | "CLOSED";

function isFailureStatus(status: string): status is Exclude<SubscribeStatus, "SUBSCRIBED"> {
  return status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED";
}

function nextBackoffMs(attempt: number): number {
  // 첫 재시도를 ~0.35s대로 두어 WS 핸드셰이크 일시 실패 시 체감 지연을 줄인다(이후는 2배).
  const base = Math.min(20_000, 350 * Math.pow(2, Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * 220);
  return base + jitter;
}

export function subscribeWithRetry(args: {
  sb: SupabaseClient;
  /** 채널 이름(고정). 같은 이름으로 재시도 시 remove+recreate */
  name: string;
  /** `[cm-rt] subscribe` 에만 넣는 원장 room id(옵션) */
  logStreamRoomId?: string;
  /** 모니터링 스코프(집계 키). */
  scope: string;
  /** on 등록을 포함한 채널 구성 함수 */
  build: (ch: RealtimeChannel) => RealtimeChannel;
  /** hook cleanup에서 true로 바꿔 중단 */
  isCancelled: () => boolean;
  /** 상태 변화를 UI/폴백 정책에 반영(선택) */
  onStatus?: (status: string) => void;
  /** 실패 시 refresh 스케줄 등(선택) */
  onAfterSubscribeFailure?: (status: string, attempt: number) => void;
  /** payload 무음 구독 감지 상한 */
  silentAfterMs?: number;
}): { channel: RealtimeChannel; stop: () => void; markSignal: () => void } {
  let attempt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let expectedInternalClosed = 0;
  const internalDecayTimers = new Set<ReturnType<typeof setTimeout>>();
  let channel: RealtimeChannel = args.build(args.sb.channel(args.name));

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  const markInternalChannelRecycle = () => {
    expectedInternalClosed += 1;
    const t = setTimeout(() => {
      internalDecayTimers.delete(t);
      if (expectedInternalClosed > 0) expectedInternalClosed -= 1;
    }, 1600);
    internalDecayTimers.add(t);
  };

  const clearInternalDecayTimers = () => {
    for (const t of internalDecayTimers) {
      clearTimeout(t);
    }
    internalDecayTimers.clear();
  };

  const consumeInternalClosed = (): boolean => {
    if (expectedInternalClosed <= 0) return false;
    expectedInternalClosed -= 1;
    return true;
  };

  const stop = () => {
    stopped = true;
    clearTimer();
    clearInternalDecayTimers();
    expectedInternalClosed = 0;
    clearCommunityMessengerRealtimeScope(args.scope);
    markInternalChannelRecycle();
    if (isCommunityMessengerRealtimeDebugEnabled() && args.name.startsWith("community-messenger")) {
      cmRtLogTeardown({ reason: "stop", channelName: args.name });
    }
    try {
      void args.sb.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };

  const resubscribe = () => {
    if (stopped || args.isCancelled()) return;
    clearTimer();
    markInternalChannelRecycle();
    try {
      void args.sb.removeChannel(channel);
    } catch {
      /* ignore */
    }
    channel = args.build(args.sb.channel(args.name));
    attachSubscribe();
  };

  const scheduleRetry = (status: string) => {
    if (stopped || args.isCancelled()) return;
    const wait = nextBackoffMs(attempt);
    attempt += 1;
    args.onAfterSubscribeFailure?.(status, attempt);
    timer = setTimeout(() => resubscribe(), wait);
  };

  const attachSubscribe = () => {
    /**
     * `channel.subscribe()` 직전에 세션 JWT 를 Realtime 소켓에 반드시 맞춘다.
     * 그렇지 않으면 SUBSCRIBED 인데 `auth.uid()` 가 비어 RLS 로 postgres_changes 가
     * 영구히 오지 않는 레이스가 난다(@supabase/ssr 쿠키 복원 타이밍).
     */
    void (async () => {
      if (stopped || args.isCancelled()) return;
      /**
       * 초기 쿠키 복원 레이스에서 anon JWT로 붙지 않도록,
       * 짧은 상한으로 한 번 대기 후 세션 토큰을 다시 맞춘다.
       */
      await waitForSupabaseRealtimeAuth(args.sb, 1_500);
      await syncSupabaseRealtimeAuthFromSession(args.sb);
      if (stopped || args.isCancelled()) return;
      channel = channel.subscribe((status) => {
        registerCommunityMessengerRealtimeScope({
          scope: args.scope,
          status,
          silentAfterMs: args.silentAfterMs,
        });
        args.onStatus?.(status);
        if (status === "SUBSCRIBED") {
          void syncSupabaseRealtimeAuthFromSession(args.sb);
          const phase = attempt > 0 ? "retry" : "initial";
          attempt = 0;
          messengerMonitorRealtimeSubscriptionOutcome(args.scope, true, status, { attemptPhase: phase });
          if (isCommunityMessengerRealtimeDebugEnabled() && args.name.startsWith("community-messenger")) {
            cmRtLogSubscribe({
              scope: args.scope,
              channelName: args.name,
              status,
              attemptPhase: phase,
              streamRoomId: args.logStreamRoomId,
            });
          }
          return;
        }
        if (isFailureStatus(status)) {
          const intentionalTeardown = stopped || args.isCancelled();
          if (status === "CLOSED" && (intentionalTeardown || consumeInternalClosed())) return;
          const phase = attempt > 0 ? "retry" : "initial";
          messengerMonitorRealtimeSubscriptionOutcome(args.scope, false, status, { attemptPhase: phase });
          if (isCommunityMessengerRealtimeDebugEnabled() && args.name.startsWith("community-messenger")) {
            cmRtLogSubscribe({
              scope: args.scope,
              channelName: args.name,
              status,
              attemptPhase: phase,
              streamRoomId: args.logStreamRoomId,
            });
          }
          if (intentionalTeardown) return;
          scheduleRetry(status);
        }
      });
    })();
  };

  attachSubscribe();
  return {
    channel,
    stop,
    markSignal: () => {
      markCommunityMessengerRealtimeScopeSignal(args.scope);
    },
  };
}

