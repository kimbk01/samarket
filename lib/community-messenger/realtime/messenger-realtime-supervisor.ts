"use client";

/**
 * D1 R1 — 메신저 실시간 연결 감독 (Owner 「개정안 승인」 2026-11-26).
 * 계약: docs/messenger-realtime-policy.md 「실시간 연결 감독」 · 개정안
 * docs/audit/supabase-request-surge-2026-11-18/messenger-realtime-contract-revision-d1-d2-2026-11-26.md §3 R1
 *
 * 왜: 채널마다 따로 끝없이 재시도하고(`subscribe-with-retry.ts` · `cm-rt-loop-guard.ts`) 소켓 단위 판단이 없어
 * 서버가 가입을 거절(`SocketJoinRateLimitReached`)해도 재가입이 스스로 이어졌다(11-26 iPhone 4시간 재시도 2,483).
 *
 * 규칙:
 * - 대상(메신저·알림·거래 비통화 채널)은 `subscribeWithRetry` 대신 `superviseMessengerChannel` 을 부른다.
 *   감독은 안에서 `subscribeWithRetry` 를 **그대로** 부른다 — `subscribe-with-retry.ts`(통화 공유)는 무변경.
 *   통화 채널은 감독을 쓰지 않으며 감독은 그 실패를 세지도 멈추지도 않는다.
 * - 실패(`TIMED_OUT`·`CHANNEL_ERROR`)가 60초 안 6회 또는 5분 안 20회 → 차단(open): 대상 채널 전부 stop, 가입 0.
 *   (`CLOSED` 는 래퍼 내부 재생성에서도 오므로 세지 않는다.)
 * - 차단 대기 30→60→120→300초. 대기가 끝나도 화면이 숨겨져 있거나 오프라인이면 보일 때·온라인일 때 시험.
 * - 시험(half_open): 채널 1개만 가입, 15초 안 SUBSCRIBED → 닫힘(closed), 나머지를 300ms 간격으로 하나씩 가입.
 * - 채널별 연속 실패 6회 → 그 채널만 쉼(park). 다음 시험·화면 복귀·온라인 때 다시 가입.
 * - `NEXT_PUBLIC_MESSENGER_RT_SUPERVISOR=0` 이면 그대로 통과(지금 동작) — 롤백 스위치.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  SubscribeWithRetryArgs,
  SubscribeWithRetryHandle,
} from "@/lib/community-messenger/realtime/cm-rt-channel-registry";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";

export const RT_SUPERVISOR_SHORT_WINDOW_MS = 60_000;
export const RT_SUPERVISOR_SHORT_WINDOW_FAILURES = 6;
export const RT_SUPERVISOR_LONG_WINDOW_MS = 300_000;
export const RT_SUPERVISOR_LONG_WINDOW_FAILURES = 20;
export const RT_SUPERVISOR_OPEN_DELAYS_MS = [30_000, 60_000, 120_000, 300_000] as const;
export const RT_SUPERVISOR_PROBE_TIMEOUT_MS = 15_000;
export const RT_SUPERVISOR_RESTART_GAP_MS = 300;
export const RT_SUPERVISOR_CHANNEL_PARK_FAILURES = 6;

export type RtSupervisorState = "closed" | "open" | "half_open";

type Entry = {
  args: SubscribeWithRetryArgs;
  inner: SubscribeWithRetryHandle | null;
  lastChannel: RealtimeChannel | null;
  consecutiveFailures: number;
  parked: boolean;
  stopped: boolean;
  seq: number;
};

export type RtSupervisorDeps = {
  subscribe: (args: SubscribeWithRetryArgs) => SubscribeWithRetryHandle;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  canProbe: () => boolean;
  record: (event: "open" | "close" | "park" | "probe_fail", labels: Record<string, string>) => void;
};

export type RtSupervisor = {
  supervise: (args: SubscribeWithRetryArgs) => SubscribeWithRetryHandle;
  /** 화면 복귀·온라인 — 대기 끝난 시험 시작, 쉰 채널 재가입 */
  wake: () => void;
  state: () => RtSupervisorState;
  /**
   * 자체 재시도 루프(presence·read-ack)가 멈춘 뒤 「다시 가입해도 될 때」 1번 불린다 — 차단이 닫힐 때·닫힌 상태에서 wake 때.
   * 반환 = 등록 해제.
   */
  whenJoinAllowed: (cb: () => void) => () => void;
  /** 시험용 */
  activeCount: () => number;
};

function isFailure(status: string): boolean {
  return status === "TIMED_OUT" || status === "CHANNEL_ERROR";
}

/** 시험 채널 우선순위: 홈 meta → 먼저 등록된 채널 */
function pickProbe(entries: Entry[]): Entry | null {
  const live = entries.filter((e) => !e.stopped).sort((a, b) => a.seq - b.seq);
  return live.find((e) => e.args.name.startsWith("community-messenger-home:meta")) ?? live[0] ?? null;
}

export function createMessengerRealtimeSupervisor(deps: RtSupervisorDeps): RtSupervisor {
  const entries = new Set<Entry>();
  let state: RtSupervisorState = "closed";
  let failures: number[] = [];
  let openLevel = 0;
  let waitTimer: unknown = null;
  let probeTimer: unknown = null;
  let waitingForWake = false;
  let probeEntry: Entry | null = null;
  let seq = 0;
  const restartTimers = new Set<unknown>();
  const joinWaiters = new Set<() => void>();

  const flushJoinWaiters = () => {
    const list = [...joinWaiters];
    joinWaiters.clear();
    list.forEach((cb, i) => {
      deps.setTimer(() => cb(), (i + 1) * RT_SUPERVISOR_RESTART_GAP_MS);
    });
  };

  const clearRestartTimers = () => {
    for (const t of restartTimers) deps.clearTimer(t);
    restartTimers.clear();
  };

  const stopInner = (e: Entry) => {
    const inner = e.inner;
    e.inner = null;
    if (inner) inner.stop();
  };

  const start = (e: Entry) => {
    if (e.stopped || e.inner) return;
    const inner = deps.subscribe({
      ...e.args,
      onStatus: (status) => {
        onEntryStatus(e, status);
        e.args.onStatus?.(status);
      },
    });
    e.inner = inner;
    e.lastChannel = inner.channel;
  };

  const restartAllGradually = () => {
    clearRestartTimers();
    const pending = [...entries]
      .filter((e) => !e.stopped && !e.inner)
      .sort((a, b) => a.seq - b.seq);
    pending.forEach((e, i) => {
      e.parked = false;
      e.consecutiveFailures = 0;
      const t = deps.setTimer(() => {
        restartTimers.delete(t);
        if (state === "closed") start(e);
      }, (i + 1) * RT_SUPERVISOR_RESTART_GAP_MS);
      restartTimers.add(t);
    });
  };

  const close = () => {
    if (probeTimer != null) deps.clearTimer(probeTimer);
    probeTimer = null;
    probeEntry = null;
    state = "closed";
    openLevel = 0;
    failures = [];
    deps.record("close", {});
    restartAllGradually();
    flushJoinWaiters();
  };

  const probe = () => {
    waitingForWake = false;
    const p = pickProbe([...entries]);
    if (!p) {
      // 등록 채널이 없으면 닫아 두고 다음 등록 때 바로 가입
      state = "closed";
      openLevel = 0;
      failures = [];
      return;
    }
    state = "half_open";
    probeEntry = p;
    p.parked = false;
    p.consecutiveFailures = 0;
    start(p);
    probeTimer = deps.setTimer(() => {
      probeTimer = null;
      if (state === "half_open") {
        deps.record("probe_fail", { reason: "timeout" });
        open("probe_timeout");
      }
    }, RT_SUPERVISOR_PROBE_TIMEOUT_MS);
  };

  const scheduleProbe = () => {
    const delay = RT_SUPERVISOR_OPEN_DELAYS_MS[Math.min(openLevel, RT_SUPERVISOR_OPEN_DELAYS_MS.length - 1)]!;
    openLevel += 1;
    waitTimer = deps.setTimer(() => {
      waitTimer = null;
      if (state !== "open") return;
      if (!deps.canProbe()) {
        waitingForWake = true;
        return;
      }
      probe();
    }, delay);
    return delay;
  };

  const open = (reason: string) => {
    clearRestartTimers();
    if (probeTimer != null) deps.clearTimer(probeTimer);
    probeTimer = null;
    probeEntry = null;
    state = "open";
    failures = [];
    for (const e of entries) stopInner(e);
    const delay = scheduleProbe();
    deps.record("open", { reason, wait_ms: String(delay) });
  };

  const onEntryStatus = (e: Entry, status: string) => {
    if (e.stopped) return;
    if (status === "SUBSCRIBED") {
      e.consecutiveFailures = 0;
      if (state === "half_open" && e === probeEntry) close();
      return;
    }
    if (!isFailure(status)) return;
    if (state === "half_open") {
      if (e === probeEntry) {
        deps.record("probe_fail", { reason: status.toLowerCase() });
        open("probe_failed");
      }
      return;
    }
    if (state !== "closed") return;
    const t = deps.now();
    failures.push(t);
    failures = failures.filter((x) => t - x <= RT_SUPERVISOR_LONG_WINDOW_MS);
    const shortCount = failures.filter((x) => t - x <= RT_SUPERVISOR_SHORT_WINDOW_MS).length;
    if (shortCount >= RT_SUPERVISOR_SHORT_WINDOW_FAILURES || failures.length >= RT_SUPERVISOR_LONG_WINDOW_FAILURES) {
      open(shortCount >= RT_SUPERVISOR_SHORT_WINDOW_FAILURES ? "short_window" : "long_window");
      return;
    }
    e.consecutiveFailures += 1;
    if (e.consecutiveFailures >= RT_SUPERVISOR_CHANNEL_PARK_FAILURES) {
      e.parked = true;
      stopInner(e);
      deps.record("park", { scope: e.args.scope.split(":")[0] ?? "other" });
    }
  };

  return {
    supervise(args) {
      const e: Entry = {
        args,
        inner: null,
        lastChannel: null,
        consecutiveFailures: 0,
        parked: false,
        stopped: false,
        seq: (seq += 1),
      };
      entries.add(e);
      if (state === "closed") start(e);
      return {
        get channel() {
          return (e.inner?.channel ?? e.lastChannel) as RealtimeChannel;
        },
        stop: () => {
          e.stopped = true;
          entries.delete(e);
          stopInner(e);
          if (e === probeEntry && state === "half_open") {
            if (probeTimer != null) deps.clearTimer(probeTimer);
            probeTimer = null;
            probeEntry = null;
            state = "open";
            if (waitTimer == null) waitingForWake = true;
          }
        },
        markSignal: () => {
          e.inner?.markSignal();
        },
      };
    },
    wake() {
      if (state === "open" && waitingForWake && waitTimer == null && deps.canProbe()) {
        probe();
        return;
      }
      if (state !== "closed") return;
      flushJoinWaiters();
      for (const e of entries) {
        if (e.parked && !e.stopped) {
          e.parked = false;
          e.consecutiveFailures = 0;
          start(e);
        }
      }
    },
    state: () => state,
    whenJoinAllowed(cb) {
      joinWaiters.add(cb);
      return () => {
        joinWaiters.delete(cb);
      };
    },
    activeCount: () => [...entries].filter((e) => e.inner != null).length,
  };
}

function supervisorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MESSENGER_RT_SUPERVISOR !== "0";
}

let defaultSupervisor: RtSupervisor | null = null;

function getDefaultSupervisor(): RtSupervisor {
  if (defaultSupervisor) return defaultSupervisor;
  const sup = createMessengerRealtimeSupervisor({
    subscribe: subscribeWithRetry,
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    canProbe: () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      return true;
    },
    record: (event, labels) => {
      messengerMonitorRecord({
        category: "realtime.subscription",
        metric: `supervisor_${event}`,
        value: 1,
        unit: "count",
        labels,
      });
    },
  });
  if (typeof window !== "undefined") {
    const wake = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      sup.wake();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
  }
  defaultSupervisor = sup;
  return sup;
}

/** §2 대상 채널의 가입 입구. 통화 채널은 쓰지 않는다. */
export function superviseMessengerChannel(args: SubscribeWithRetryArgs): SubscribeWithRetryHandle {
  if (!supervisorEnabled()) return subscribeWithRetry(args);
  return getDefaultSupervisor().supervise(args);
}

/** presence·read-ack 처럼 자체 재시도 루프를 가진 채널이 「지금 가입해도 되는가」를 묻는다 */
export function messengerRealtimeSupervisorAllowsJoin(): boolean {
  if (!supervisorEnabled()) return true;
  return getDefaultSupervisor().state() === "closed";
}

/** 자체 재시도 루프용 — 상한·차단으로 멈춘 뒤 다시 가입해도 될 때 1번 */
export function whenMessengerRealtimeJoinAllowed(cb: () => void): () => void {
  if (!supervisorEnabled()) {
    cb();
    return () => undefined;
  }
  return getDefaultSupervisor().whenJoinAllowed(cb);
}

/** 자체 재시도 루프가 이 횟수 연속 실패하면 멈추고 `whenMessengerRealtimeJoinAllowed` 를 기다린다 */
export const RT_SELF_LOOP_MAX_CONSECUTIVE_FAILURES = RT_SUPERVISOR_CHANNEL_PARK_FAILURES;
