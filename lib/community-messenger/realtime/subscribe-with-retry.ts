"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { messengerMonitorRealtimeSubscriptionOutcome } from "@/lib/community-messenger/monitoring/client";

type SubscribeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CHANNEL_ERROR" | "CLOSED";

function isFailureStatus(status: string): status is Exclude<SubscribeStatus, "SUBSCRIBED"> {
  return status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED";
}

function nextBackoffMs(attempt: number): number {
  // 0.8s, 1.6s, 3.2s ... max 20s (+jitter)
  const base = Math.min(20_000, 800 * Math.pow(2, Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * 300);
  return base + jitter;
}

export function subscribeWithRetry(args: {
  sb: SupabaseClient;
  /** 채널 이름(고정). 같은 이름으로 재시도 시 remove+recreate */
  name: string;
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
}): { channel: RealtimeChannel; stop: () => void } {
  let attempt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let channel: RealtimeChannel = args.build(args.sb.channel(args.name));

  const clearTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  const stop = () => {
    stopped = true;
    clearTimer();
    try {
      void args.sb.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };

  const resubscribe = () => {
    if (stopped || args.isCancelled()) return;
    clearTimer();
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
    channel = channel.subscribe((status) => {
      args.onStatus?.(status);
      if (status === "SUBSCRIBED") {
        attempt = 0;
        messengerMonitorRealtimeSubscriptionOutcome(args.scope, true, status);
        return;
      }
      if (isFailureStatus(status)) {
        messengerMonitorRealtimeSubscriptionOutcome(args.scope, false, status);
        scheduleRetry(status);
      }
    });
  };

  attachSubscribe();
  return { channel, stop };
}

