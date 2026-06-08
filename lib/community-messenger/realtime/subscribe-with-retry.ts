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
import {
  cmDebugUserIdTailFromChannelName,
  pushCmBrowserDebugEvent,
  recordCmRtLoopCreateForBuffer,
  recordCmRtLoopStopForBuffer,
} from "@/lib/community-messenger/realtime/cm-browser-debug-buffer";
import {
  cmRtHs4DiagnosisLog,
  cmRtHs4FingerprintDigest,
  type CmRtHs4SubscribeContext,
} from "@/lib/community-messenger/realtime/cm-rt-hs4-diagnosis";
import {
  logCmRtLoopIntervalSummaryDiagnosis,
  markCmRtSubscribeWithRetryModuleEval,
  registerCmRtLoopActiveCountLookup,
} from "@/lib/community-messenger/realtime/cm-rt-loop-diagnosis";
import { logRtReconnectTrace } from "@/lib/dibay/network-fetch-storm-trace";
import {
  emitCmRtWindowSummaryNow,
  recordCmRtWindowHomePhysicalCreate,
} from "@/lib/community-messenger/realtime/cm-rt-window-metrics";
import {
  acquireCmRtChannelSubscription,
  type SubscribeWithRetryArgs,
  type SubscribeWithRetryHandle,
} from "@/lib/community-messenger/realtime/cm-rt-channel-registry";
import {
  cmRtComputeRetryDelayMs,
  cmRtLoopGuardRegisterWakeCallback,
  cmRtRecordSubscribeFailure,
  cmRtRecordSubscribeSuccess,
  cmRtRegistryDevLog,
  cmRtResetFailureState,
  cmRtShouldDeferRetries,
} from "@/lib/community-messenger/realtime/cm-rt-loop-guard";
import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";

type SubscribeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CHANNEL_ERROR" | "CLOSED";
type RtLoopDiagEvent =
  | "create"
  | "attach_subscribe"
  | "status_subscribed"
  | "status_failed"
  | "schedule_retry"
  | "resubscribe"
  | "stop";
const rtLoopDiagLastAtByName = new Map<string, number>();
const rtLoopDiagActiveCountByName = new Map<string, number>();
const rtLoopDiagCountersByName = new Map<
  string,
  { create: number; stop: number; lastCreateAt: number | null; lastStopAt: number | null }
>();
let rtLoopDiagSummaryTimer: ReturnType<typeof setInterval> | null = null;
/**
 * 무활동 6틱(=30s) 동안 새로운 create/stop 가 없고 출력할 루프 후보가 없으면 타이머 정지.
 * 다음 create/stop 발생 시 다시 살아난다.
 */
const RT_LOOP_DIAG_IDLE_TICKS_TO_STOP = 6;
let rtLoopDiagIdleTickCount = 0;

/**
 * 「루프 의심」판정: 같은 채널 이름이 2번 이상 만들어졌거나(중복 인스턴스/재구독), 2번 이상 정리된 경우.
 * `1 create / 0 stop`(정상 마운트), `1 create / 1 stop`(정상 hot-reload·unmount) 은 정상 상태이므로 노이즈가 되지 않게 제외.
 */
function isLoopSuspect(create: number, stop: number): boolean {
  return create >= 2 || stop >= 2;
}

function stopRtLoopDiagSummaryTimer(): void {
  if (rtLoopDiagSummaryTimer == null) return;
  clearInterval(rtLoopDiagSummaryTimer);
  rtLoopDiagSummaryTimer = null;
  rtLoopDiagIdleTickCount = 0;
}

function rtLoopDiagBumpCounter(name: string, kind: "create" | "stop"): void {
  if (!isDebugMessengerEnabled()) return;
  if (!name.startsWith("community-messenger")) return;
  if (name.startsWith("community-messenger-home") && kind === "create") {
    recordCmRtWindowHomePhysicalCreate();
  }
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const row = rtLoopDiagCountersByName.get(name) ?? {
    create: 0,
    stop: 0,
    lastCreateAt: null,
    lastStopAt: null,
  };
  if (kind === "create") {
    row.create += 1;
    row.lastCreateAt = now;
  } else {
    row.stop += 1;
    row.lastStopAt = now;
  }
  rtLoopDiagCountersByName.set(name, row);
  rtLoopDiagIdleTickCount = 0;
  if (!rtLoopDiagSummaryTimer) {
    rtLoopDiagSummaryTimer = setInterval(() => {
      const list = [...rtLoopDiagCountersByName.entries()]
        .map(([k, v]) => ({ name: k, create: v.create, stop: v.stop }))
        .filter((x) => isLoopSuspect(x.create, x.stop))
        .sort((a, b) => b.stop - a.stop || b.create - a.create)
        .slice(0, 6);
      if (list.length === 0) {
        rtLoopDiagIdleTickCount += 1;
        if (rtLoopDiagIdleTickCount >= RT_LOOP_DIAG_IDLE_TICKS_TO_STOP) {
          stopRtLoopDiagSummaryTimer();
        }
        return;
      }
      rtLoopDiagIdleTickCount = 0;
      try {
        const topText = list
          .map((x) => `${x.stop} stop / ${x.create} create — ${x.name}`)
          .join(" | ");
        // eslint-disable-next-line no-console -- dev-only realtime loop summary
        console.warn("[cm-rt-loop-summary]", {
          top: list,
          topText,
          note: "counts since last reload; focus on highest stop/create",
        });
        logCmRtLoopIntervalSummaryDiagnosis(list);
        emitCmRtWindowSummaryNow();
      } catch {
        /* ignore */
      }
    }, 5000);
  }
}

/**
 * 「루프 의심 이벤트」 — 진짜 재시도·재구독·실패 신호.
 * 정상 마운트 시퀀스(`create` → `attach_subscribe` → `status_subscribed`) 는 같은 채널에서
 * 수 ms 안에 차례로 일어나는 게 정상이므로 이 집합에 포함하지 않는다.
 */
const RT_LOOP_DIAG_SUSPECT_EVENTS = new Set<RtLoopDiagEvent>([
  "status_failed",
  "schedule_retry",
  "resubscribe",
]);

function rtLoopDiagLog(args: {
  event: RtLoopDiagEvent;
  name: string;
  scope: string;
  reason?: string;
  status?: string;
  attempt?: number;
  waitMs?: number;
  expectedInternalClosed?: number;
  stopSourceStack?: string | null;
}): void {
  if (!isDebugMessengerEnabled()) return;
  if (!args.name.startsWith("community-messenger")) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const prev = rtLoopDiagLastAtByName.get(args.name);
  const dtMs = typeof prev === "number" ? Math.max(0, Math.round(now - prev)) : null;
  rtLoopDiagLastAtByName.set(args.name, now);
  const active = rtLoopDiagActiveCountByName.get(args.name) ?? 0;
  /**
   * 출력 정책 (헌장 [근본 대책만] §「임계값만 가리는 구성 금지」준수 — 단순 임계 완화가 아니라
   * "정상 라이프사이클" 과 "루프 신호" 를 의미적으로 분리):
   *   - 항상 출력: 재시도·재구독·실패·stop (실제 진단 가치)
   *   - 정상 라이프사이클(`create`/`attach_subscribe`/`status_subscribed`): `active >= 2` 일 때만
   *     (같은 이름 채널 2개 이상 동시 활성 — 중복 인스턴스 의심)
   * dtMs 만으로는 정상 마운트도 항상 작아서 루프 판정에 쓸 수 없다.
   */
  const isSuspectEvent = RT_LOOP_DIAG_SUSPECT_EVENTS.has(args.event);
  const isStop = args.event === "stop";
  const shouldPrint = isSuspectEvent || isStop || active >= 2;
  if (!shouldPrint) return;
  try {
    // eslint-disable-next-line no-console -- dev-only realtime loop diagnostics
    console.warn("[cm-rt-loop]", {
      event: args.event,
      name: args.name,
      scope: args.scope,
      reason: args.reason ?? null,
      status: args.status ?? null,
      attempt: typeof args.attempt === "number" ? args.attempt : null,
      waitMs: typeof args.waitMs === "number" ? Math.round(args.waitMs) : null,
      dtMs,
      activeCount: active,
      expectedInternalClosed: typeof args.expectedInternalClosed === "number" ? args.expectedInternalClosed : null,
      stopSourceStack: args.event === "stop" ? args.stopSourceStack ?? null : null,
    });
  } catch {
    /* ignore */
  }
}

function isOpsReconnectStressMonitorEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const g = globalThis as typeof globalThis & { __SAMARKET_OPS1_MONITOR__?: boolean };
  if (g.__SAMARKET_OPS1_MONITOR__ === true) return true;
  return process.env.NEXT_PUBLIC_SAMARKET_OPS1_MONITOR === "1";
}

function maybeRecordReconnectStressEvent(
  roomId: string,
  event: "reconnect" | "duplicate_subscribe"
): void {
  if (!isOpsReconnectStressMonitorEnabled()) return;
  void import("@/lib/ops/reconnect-stress-analysis")
    .then(({ recordReconnectStressEvent }) => {
      recordReconnectStressEvent(roomId, event);
    })
    .catch(() => {
      /* dev HMR stale chunk — hot reload 직후 구 chunk URL 404 는 무시 */
    });
}

function isFailureStatus(status: string): status is Exclude<SubscribeStatus, "SUBSCRIBED"> {
  return status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED";
}

/** 모니터링 labels(hs4_) — 값은 모두 문자열 */
function hs4MonitorLabels(
  ctx: CmRtHs4SubscribeContext | undefined,
  channelName: string,
  extras: {
    attemptNo?: number;
    elapsedAttachMs?: number | null;
    previousChannelState?: string | null;
    expectedInternalClosed?: number;
    activeCount?: number;
  }
): Record<string, string> {
  const o: Record<string, string> = {
    hs4_channelName: channelName,
  };
  if (ctx?.fingerprint != null && ctx.fingerprint !== "") {
    const d = cmRtHs4FingerprintDigest(ctx.fingerprint);
    o.hs4_fpLen = String(d.fpLen);
    o.hs4_fpDigest8 = d.fpDigest8;
  } else {
    o.hs4_fpLen = "0";
    o.hs4_fpDigest8 = "";
  }
  if (ctx?.channelBindRole) o.hs4_bindRole = ctx.channelBindRole;
  if (ctx?.chunkOffset != null) o.hs4_chunkOffset = String(ctx.chunkOffset);
  if (ctx?.bindOrdinal != null) o.hs4_bindOrdinal = String(ctx.bindOrdinal);
  if (extras.attemptNo != null) o.hs4_attemptNo = String(extras.attemptNo);
  if (extras.elapsedAttachMs != null) o.hs4_elapsedAttachMs = String(Math.round(extras.elapsedAttachMs));
  if (extras.previousChannelState != null) o.hs4_previousChannelState = extras.previousChannelState;
  if (extras.expectedInternalClosed != null) o.hs4_expectedInternalClosed = String(extras.expectedInternalClosed);
  if (extras.activeCount != null) o.hs4_activeCount = String(extras.activeCount);
  return o;
}

function createInternalSubscribeWithRetry(args: SubscribeWithRetryArgs): SubscribeWithRetryHandle {
  let attempt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeGeneration = 1;
  let expectedInternalClosed = 0;
  const internalDecayTimers = new Set<ReturnType<typeof setTimeout>>();
  let channel: RealtimeChannel = args.build(args.sb.channel(args.name));
  let previousChannelStatusForHs4: string | null = null;

  /**
   * 같은 채널 이름 동시 인스턴스 추적 — HS4 에서 activeCount 제공.
   * (기존에는 devRtLoopDiag 안에서만 갱신되어 프로덕션에서 항상 0 에 가까웠음)
   */
  const prevActiveForHs4 = rtLoopDiagActiveCountByName.get(args.name) ?? 0;
  rtLoopDiagActiveCountByName.set(args.name, prevActiveForHs4 + 1);
  const createReason =
    prevActiveForHs4 > 0 ? ("duplicate_instance_same_name" as const) : ("initial_build" as const);
  cmRtHs4DiagnosisLog("lifecycle_create", {
    scope: args.scope,
    channelName: args.name,
    createReason,
    expectedInternalClosed,
    activeCount: rtLoopDiagActiveCountByName.get(args.name) ?? 0,
    ...cmRtHs4FingerprintDigest(args.hs4Context?.fingerprint ?? ""),
    bindRole: args.hs4Context?.channelBindRole ?? null,
    chunkOffset: args.hs4Context?.chunkOffset ?? null,
    bindOrdinal: args.hs4Context?.bindOrdinal ?? null,
  });

  /**
   * 진단(create-time) — prod hot path 무동작.
   * dev 에서만 ring buffer 누적·rtLoopDiag 출력.
   * 헌장 §「근본 대책만」 — hot path direct logging 금지, 진단 가치는 dev 에서만 의미.
   */
  if (isDebugMessengerEnabled() && args.name.startsWith("community-messenger")) {
    const counts = recordCmRtLoopCreateForBuffer(args.name);
    pushCmBrowserDebugEvent({
      label: "cm-rt-loop",
      scope: args.scope,
      channelName: args.name,
      reason: counts.create > 1 ? "duplicate_instance_same_name" : "first_instance",
      status: "create",
      bodySnippet: null,
      payload: { event: "create", createCount: counts.create, stopCount: counts.stop },
      stopSourceStack: null,
      fingerprint: null,
      userIdTail: cmDebugUserIdTailFromChannelName(args.name),
    });
  }

  if (isDebugMessengerEnabled()) {
    rtLoopDiagBumpCounter(args.name, "create");
    rtLoopDiagLog({
      event: "create",
      name: args.name,
      scope: args.scope,
      reason: prevActiveForHs4 > 0 ? "duplicate_instance_same_name" : "first_instance",
      expectedInternalClosed,
    });
  }

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
    activeGeneration += 1;
    clearTimer();
    clearInternalDecayTimers();
    expectedInternalClosed = 0;
    cmRtResetFailureState(args.name);
    clearCommunityMessengerRealtimeScope(args.scope);
    markInternalChannelRecycle();
    /**
     * 진단(stop-time) — prod hot path 무동작.
     * `new Error().stack` 의 V8 inspector 직렬화는 동기 비용이 크고,
     * room transition 의 bundle 청크 stop 직렬 루프를 직접 늘린다(`global-messenger-room-bundle-channel.ts` 의
     * `bindFilteredPostgresSubscriptions` 의 `for (const ch of channels) ch.stop()`).
     * dev 에서만 stack 캡처 + ring buffer push + rtLoopDiag 출력. cmRtLogTeardown 은 ENV opt-in 시에만.
     * 헌장 §「근본 대책만」·사용자 §「production hot path 진단 완전 skip」.
     */
    const activeBeforeStop = rtLoopDiagActiveCountByName.get(args.name) ?? 0;
    if (isDebugMessengerEnabled() && args.name.startsWith("community-messenger")) {
      let stopSourceStack: string | null = null;
      try {
        stopSourceStack = new Error("subscribeWithRetry.stop").stack ?? null;
      } catch {
        stopSourceStack = null;
      }
      rtLoopDiagBumpCounter(args.name, "stop");
      rtLoopDiagLog({
        event: "stop",
        name: args.name,
        scope: args.scope,
        reason: "explicit_stop",
        expectedInternalClosed,
        stopSourceStack,
      });
      const counts = recordCmRtLoopStopForBuffer(args.name);
      pushCmBrowserDebugEvent({
        label: "cm-rt-loop",
        scope: args.scope,
        channelName: args.name,
        reason: "explicit_stop",
        status: "stop",
        bodySnippet: null,
        payload: { event: "stop", createCount: counts.create, stopCount: counts.stop },
        stopSourceStack,
        fingerprint: null,
        userIdTail: cmDebugUserIdTailFromChannelName(args.name),
      });
      if (isCommunityMessengerRealtimeDebugEnabled()) {
        cmRtLogTeardown({
          reason: "stop",
          channelName: args.name,
          stopSourceStack,
          teardownDetail: "explicit_stop(removeChannel)",
        });
      }
    }
    cmRtHs4DiagnosisLog("lifecycle_stop", {
      scope: args.scope,
      channelName: args.name,
      stopReason: "explicit_stop",
      activeCountBeforeStop: activeBeforeStop,
      expectedInternalClosed,
      ...cmRtHs4FingerprintDigest(args.hs4Context?.fingerprint ?? ""),
      bindRole: args.hs4Context?.channelBindRole ?? null,
    });
    try {
      void args.sb.removeChannel(channel);
    } catch {
      /* ignore */
    }
    {
      const prev = rtLoopDiagActiveCountByName.get(args.name) ?? 1;
      const next = Math.max(0, prev - 1);
      if (next <= 0) rtLoopDiagActiveCountByName.delete(args.name);
      else rtLoopDiagActiveCountByName.set(args.name, next);
    }
  };

  const resubscribe = () => {
    if (stopped || args.isCancelled()) return;
    const gen = activeGeneration;
    clearTimer();
    markInternalChannelRecycle();
    cmRtHs4DiagnosisLog("lifecycle_resubscribe", {
      scope: args.scope,
      channelName: args.name,
      reason: "remove+recreate_channel",
      attemptNo: attempt,
      expectedInternalClosed,
      activeCount: rtLoopDiagActiveCountByName.get(args.name) ?? 0,
      ...cmRtHs4FingerprintDigest(args.hs4Context?.fingerprint ?? ""),
    });
    rtLoopDiagLog({
      event: "resubscribe",
      name: args.name,
      scope: args.scope,
      reason: "remove+recreate_channel",
      expectedInternalClosed,
    });
    logRtReconnectTrace({
      roomId: args.logStreamRoomId ?? null,
      channelName: args.name,
      reconnectReason: "remove+recreate_channel",
      attempt,
    });
    try {
      void args.sb.removeChannel(channel);
    } catch {
      /* ignore */
    }
    if (gen !== activeGeneration || stopped || args.isCancelled()) return;
    channel = args.build(args.sb.channel(args.name));
    attachSubscribe();
  };

  const scheduleRetry = (status: string) => {
    if (stopped || args.isCancelled()) return;
    const failureMeta = cmRtRecordSubscribeFailure(args.name, status);
    const wait = cmRtComputeRetryDelayMs(args.name, attempt);
    const gen = activeGeneration;
    attempt += 1;
    cmRtHs4DiagnosisLog("schedule_retry", {
      scope: args.scope,
      channelName: args.name,
      status,
      attemptNo: attempt,
      waitMs: Math.round(wait),
      expectedInternalClosed,
      activeCount: rtLoopDiagActiveCountByName.get(args.name) ?? 0,
    });
    rtLoopDiagLog({
      event: "schedule_retry",
      name: args.name,
      scope: args.scope,
      status,
      attempt,
      waitMs: wait,
      expectedInternalClosed,
    });
    logRtReconnectTrace({
      roomId: args.logStreamRoomId ?? null,
      channelName: args.name,
      reconnectReason: `schedule_retry:${status}`,
      attempt,
    });
    args.onAfterSubscribeFailure?.(status, attempt);
    timer = setTimeout(() => {
      if (gen !== activeGeneration) {
        cmRtRegistryDevLog("skip-stale-retry", {
          key: args.name,
          generation: gen,
          activeGeneration,
          status,
          failureCount: failureMeta.consecutiveFailures,
        });
        return;
      }
      if (stopped || args.isCancelled()) return;
      resubscribe();
    }, wait);
  };

  const attachSubscribe = () => {
    /**
     * `channel.subscribe()` 직전에 세션 JWT 를 Realtime 소켓에 반드시 맞춘다.
     * 그렇지 않으면 SUBSCRIBED 인데 `auth.uid()` 가 비어 RLS 로 postgres_changes 가
     * 영구히 오지 않는 레이스가 난다(@supabase/ssr 쿠키 복원 타이밍).
     */
    void (async () => {
      const attachCycleT0 = typeof performance !== "undefined" ? performance.now() : null;
      const attachGen = activeGeneration;
      if (stopped || args.isCancelled()) return;
      rtLoopDiagLog({
        event: "attach_subscribe",
        name: args.name,
        scope: args.scope,
        reason: attempt > 0 ? "retry_attach" : "initial_attach",
        attempt,
        expectedInternalClosed,
      });
      cmRtHs4DiagnosisLog("attach_cycle_start", {
        scope: args.scope,
        channelName: args.name,
        attemptPhase: attempt > 0 ? "retry" : "initial",
        attemptNo: attempt,
        expectedInternalClosed,
        activeCount: rtLoopDiagActiveCountByName.get(args.name) ?? 0,
        ...cmRtHs4FingerprintDigest(args.hs4Context?.fingerprint ?? ""),
      });
      /**
       * 초기 쿠키 복원 레이스에서 anon JWT로 붙지 않도록,
       * 짧은 상한으로 한 번 대기 후 세션 토큰을 다시 맞춘다.
       */
      await waitForSupabaseRealtimeAuth(args.sb, 1_500);
      await syncSupabaseRealtimeAuthFromSession(args.sb);
      if (stopped || args.isCancelled() || attachGen !== activeGeneration) return;
      channel = channel.subscribe((status) => {
        const elapsedAttachMs =
          attachCycleT0 != null && typeof performance !== "undefined"
            ? Math.round(performance.now() - attachCycleT0)
            : null;
        const activeNow = rtLoopDiagActiveCountByName.get(args.name) ?? 0;
        registerCommunityMessengerRealtimeScope({
          scope: args.scope,
          status,
          silentAfterMs: args.silentAfterMs,
        });
        args.onStatus?.(status);
        cmRtHs4DiagnosisLog("subscribe_status", {
          scope: args.scope,
          channelName: args.name,
          status,
          attemptPhase: attempt > 0 ? "retry" : "initial",
          attemptNo: attempt,
          elapsedMs: elapsedAttachMs,
          previousChannelState: previousChannelStatusForHs4,
          expectedInternalClosed,
          activeCount: activeNow,
          ...cmRtHs4FingerprintDigest(args.hs4Context?.fingerprint ?? ""),
          bindRole: args.hs4Context?.channelBindRole ?? null,
        });
        if (status === "SUBSCRIBED") {
          cmRtRecordSubscribeSuccess(args.name);
          void syncSupabaseRealtimeAuthFromSession(args.sb);
          if (attempt > 0) {
            maybeRecordReconnectStressEvent(args.logStreamRoomId ?? args.scope, "reconnect");
          }
          if (activeNow > 1) {
            maybeRecordReconnectStressEvent(args.logStreamRoomId ?? args.scope, "duplicate_subscribe");
          }
          const attemptNoAtOutcome = attempt;
          const phase = attempt > 0 ? "retry" : "initial";
          attempt = 0;
          messengerMonitorRealtimeSubscriptionOutcome(args.scope, true, status, {
            attemptPhase: phase,
            ...hs4MonitorLabels(args.hs4Context, args.name, {
              attemptNo: attemptNoAtOutcome,
              elapsedAttachMs,
              previousChannelState: previousChannelStatusForHs4,
              expectedInternalClosed,
              activeCount: activeNow,
            }),
          });
          previousChannelStatusForHs4 = status;
          if (isCommunityMessengerRealtimeDebugEnabled() && args.name.startsWith("community-messenger")) {
            cmRtLogSubscribe({
              scope: args.scope,
              channelName: args.name,
              status,
              attemptPhase: phase,
              streamRoomId: args.logStreamRoomId,
            });
          }
          rtLoopDiagLog({
            event: "status_subscribed",
            name: args.name,
            scope: args.scope,
            status,
            reason: phase,
            expectedInternalClosed,
          });
          return;
        }
        if (isFailureStatus(status)) {
          const intentionalTeardown = stopped || args.isCancelled();
          if (status === "CLOSED" && (intentionalTeardown || consumeInternalClosed())) {
            cmRtHs4DiagnosisLog("subscribe_closed_skipped", {
              scope: args.scope,
              channelName: args.name,
              status,
              reason: intentionalTeardown ? "intentional_teardown_or_cancelled" : "internal_closed_expected",
              attemptPhase: attempt > 0 ? "retry" : "initial",
              attemptNo: attempt,
              elapsedMs: elapsedAttachMs,
              previousChannelState: previousChannelStatusForHs4,
              expectedInternalClosed,
              activeCount: activeNow,
            });
            previousChannelStatusForHs4 = status;
            return;
          }
          /**
           * 동일 `channelName` 에 `subscribeWithRetry` 인스턴스가 2개 이상 겹칠 때(홈 리바인드·중복 마운트 등),
           * 한쪽의 `removeChannel`/재구독이 다른 인스턴스에 `CLOSED` 를 밀어 넣을 수 있다.
           * `expectedInternalClosed` 토큰만으로는 커버되지 않아 **가짜 initial 실패**로 집계되어
           * `channel_subscribe_callback_failure_ratio` 가 부풀 수 있다. TIMED_OUT/CHANNEL_ERROR 와 분리한다.
           */
          if (status === "CLOSED" && activeNow > 1) {
            cmRtHs4DiagnosisLog("subscribe_closed_skipped", {
              scope: args.scope,
              channelName: args.name,
              status,
              reason: "duplicate_instance_peer_teardown_no_retry",
              attemptPhase: attempt > 0 ? "retry" : "initial",
              attemptNo: attempt,
              elapsedMs: elapsedAttachMs,
              previousChannelState: previousChannelStatusForHs4,
              expectedInternalClosed,
              activeCount: activeNow,
            });
            previousChannelStatusForHs4 = status;
            return;
          }
          const attemptNoAtOutcome = attempt;
          const phase = attempt > 0 ? "retry" : "initial";
          messengerMonitorRealtimeSubscriptionOutcome(args.scope, false, status, {
            attemptPhase: phase,
            ...hs4MonitorLabels(args.hs4Context, args.name, {
              attemptNo: attemptNoAtOutcome,
              elapsedAttachMs,
              previousChannelState: previousChannelStatusForHs4,
              expectedInternalClosed,
              activeCount: activeNow,
            }),
          });
          previousChannelStatusForHs4 = status;
          if (isCommunityMessengerRealtimeDebugEnabled() && args.name.startsWith("community-messenger")) {
            cmRtLogSubscribe({
              scope: args.scope,
              channelName: args.name,
              status,
              attemptPhase: phase,
              streamRoomId: args.logStreamRoomId,
            });
          }
          rtLoopDiagLog({
            event: "status_failed",
            name: args.name,
            scope: args.scope,
            status,
            reason: intentionalTeardown ? "intentional" : phase,
            expectedInternalClosed,
          });
          if (intentionalTeardown) return;
          if (cmRtShouldDeferRetries()) {
            const deferredGen = activeGeneration;
            timer = setTimeout(() => {
              if (deferredGen !== activeGeneration || stopped || args.isCancelled()) return;
              scheduleRetry(status);
            }, Math.max(2_000, cmRtComputeRetryDelayMs(args.name, attempt)));
            return;
          }
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

let wakeUnregister: (() => void) | null = null;

export function subscribeWithRetry(args: SubscribeWithRetryArgs): SubscribeWithRetryHandle {
  if (!wakeUnregister) {
    wakeUnregister = cmRtLoopGuardRegisterWakeCallback(() => {
      /* visibility/online — 쿨다운 만료 후 다음 attach 는 각 owner 의 onStatus 로 처리 */
    });
  }
  return acquireCmRtChannelSubscription(args, createInternalSubscribeWithRetry);
}

registerCmRtLoopActiveCountLookup((name) => rtLoopDiagActiveCountByName.get(name) ?? 0);
markCmRtSubscribeWithRetryModuleEval();

