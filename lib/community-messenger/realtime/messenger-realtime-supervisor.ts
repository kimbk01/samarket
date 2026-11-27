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
 * - 실패(`TIMED_OUT`·`CHANNEL_ERROR`)를 2초 묶음(소켓 사건 1번)으로 세어 60초 안 6번 또는 5분 안 20번 → 차단(open): 대상 채널 전부 stop, 가입 0.
 *   소켓이 한 번 끊겨 모든 채널이 동시에 오류를 받는 것은 1번이다(일상적 끊김은 지금처럼 라이브러리 재연결).
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
/**
 * 독립 감사 F1(2026-11-26): 소켓이 한 번 끊기면 realtime-js 가 가입된 모든 채널에 오류를 동시에 보낸다
 * (`RealtimeClient._triggerChanError`) — 이 시간 안의 실패는 소켓 사건 1번으로 센다.
 */
export const RT_SUPERVISOR_FAILURE_COALESCE_MS = 2_000;
/**
 * 2차 독립 감사 F-B: 시험 1개는 성공했는데 나머지 재가입이 다시 거절되면 30초마다 열림·닫힘을 반복했다.
 * 닫힌 상태가 이만큼 이어져야 대기 단계를 처음(30초)으로 되돌린다.
 */
export const RT_SUPERVISOR_STABLE_RESET_MS = 300_000;
/** 시험 통과로 닫힌 뒤 안정 전(위 5분)에는 소켓 사건 이 수만으로 다시 차단 — 재가입이 곧바로 거절되는 반복을 짧게 끊는다 */
export const RT_SUPERVISOR_PROBATION_FAILURES = 2;

export type RtSupervisorState = "closed" | "open" | "half_open";

type Entry = {
  args: SubscribeWithRetryArgs;
  inner: SubscribeWithRetryHandle | null;
  lastChannel: RealtimeChannel | null;
  consecutiveFailures: number;
  parked: boolean;
  stopped: boolean;
  seq: number;
  /** 지금 가입 중인 채널이 마지막으로 받은 상태 — 멈추거나 새로 가입하면 비운다 */
  lastStatus: string | null;
};

export type RtSupervisorDeps = {
  subscribe: (args: SubscribeWithRetryArgs) => SubscribeWithRetryHandle;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  canProbe: () => boolean;
  /** 네트워크 연결 여부(없으면 항상 연결로 본다) — 오프라인 일시정지 판정용 */
  isOnline?: () => boolean;
  record: (
    event: "open" | "close" | "park" | "probe_fail" | "offline_pause" | "offline_resume",
    labels: Record<string, string>,
  ) => void;
};

export type RtSupervisor = {
  supervise: (args: SubscribeWithRetryArgs) => SubscribeWithRetryHandle;
  /** 화면 복귀·온라인 — 대기 끝난 시험 시작, 쉰 채널 재가입 */
  wake: () => void;
  state: () => RtSupervisorState;
  /** 지금 가입해도 되는가 — 닫힘이고 오프라인 일시정지가 아님 */
  isJoinAllowed: () => boolean;
  /**
   * 감독하는 채널이 하나 이상 있고 **모두** 지금 SUBSCRIBED 인가 — 차단·시험·오프라인 일시정지·쉼·재시도 중이면 false.
   * 앱 다시 열기 때 「실시간이 이미 따라잡는 값」을 또 조회할지 판정하는 데 쓴다(resume-resync-gate.ts).
   */
  allChannelsLive: () => boolean;
  /** 자체 재시도 루프(presence·read-ack)의 가입 실패 — 같은 창에 센다(2차 감사 F-E) */
  noteSelfLoopFailure: () => void;
  /** 차단이 열릴 때 — 자체 루프가 가입된 채널을 놓는다(2차 감사 F-E). 반환 = 등록 해제 */
  onOpen: (cb: () => void) => () => void;
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
  const waiterTimers = new Map<unknown, () => void>();
  const openListeners = new Set<() => void>();
  let stableTimer: unknown = null;
  /**
   * 오프라인 일시정지 (실기 T4 재실기 2026-11-26 22:08 PHT): 오프라인 중 래퍼가 쌓은 재시도가 온라인 직후 한꺼번에 실행돼
   * 28초 동안 가입·떠남 약 110번과 HTTP 57건(친구요청·메시지·상대 관계 각 19)이 나갔다. 오프라인 실패가 오면 대상 채널을
   * 멈추고(가입 0·폴백 0), 온라인이 되면 300ms 간격으로 1번씩 다시 가입한다. 실패 창·대기 단계에는 넣지 않는다.
   */
  let offlinePaused = false;
  const isOnline = deps.isOnline ?? (() => true);
  /** 시험 통과로 닫힌 뒤 관찰 기간 — stableTimer 가 끝나면 false */
  let probation = false;

  const flushJoinWaiters = () => {
    const list = [...joinWaiters];
    joinWaiters.clear();
    list.forEach((cb, i) => {
      const t = deps.setTimer(() => {
        waiterTimers.delete(t);
        if (state === "closed") cb();
        else joinWaiters.add(cb);
      }, (i + 1) * RT_SUPERVISOR_RESTART_GAP_MS);
      waiterTimers.set(t, cb);
    });
  };
  /** 다시 차단되면 아직 안 부른 대기자는 취소하고 대기열로 돌린다 */
  const cancelWaiterTimers = () => {
    for (const [t, cb] of waiterTimers) {
      deps.clearTimer(t);
      joinWaiters.add(cb);
    }
    waiterTimers.clear();
  };

  const clearRestartTimers = () => {
    for (const t of restartTimers) deps.clearTimer(t);
    restartTimers.clear();
  };

  /**
   * `notifyCaller`: 감독이 멈춘 경우(차단·쉼) 호출부에 `CLOSED` 를 알린다 — 레지스트리가 owner 를 먼저 빼서
   * 호출부는 채널이 멈춘 것을 알 수 없다(독립 감사 F4: 거래 채팅 presence 가 「연결됨」으로 남아 REST broadcast).
   * 호출부 stop 에서는 알리지 않는다.
   */
  const stopInner = (e: Entry, notifyCaller: boolean) => {
    const inner = e.inner;
    e.inner = null;
    e.lastStatus = null;
    if (!inner) return;
    inner.stop();
    if (notifyCaller && !e.stopped) {
      try {
        e.args.onStatus?.("CLOSED");
      } catch {
        /* 호출부 오류가 감독을 멈추지 않게 */
      }
    }
  };

  const start = (e: Entry) => {
    if (e.stopped || e.inner || offlinePaused) return;
    e.lastStatus = null;
    const inner = deps.subscribe({
      ...e.args,
      onStatus: (status) => {
        e.lastStatus = status;
        /** 호출부 먼저 — 이 실패로 차단·쉼이 되면 호출부가 마지막에 받는 상태가 감독의 CLOSED 가 되게(2차 감사 F-D) */
        e.args.onStatus?.(status);
        onEntryStatus(e, status);
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
    failures = [];
    if (stableTimer != null) deps.clearTimer(stableTimer);
    probation = openLevel > 0;
    stableTimer = deps.setTimer(() => {
      stableTimer = null;
      probation = false;
      if (state === "closed") openLevel = 0;
    }, RT_SUPERVISOR_STABLE_RESET_MS);
    deps.record("close", {});
    restartAllGradually();
    flushJoinWaiters();
  };

  const probe = () => {
    waitingForWake = false;
    const p = pickProbe([...entries]);
    if (!p) {
      // 등록 채널이 없으면 닫는다 — 자체 루프 대기자도 깨운다(2차 감사 F-C). 다음 등록은 바로 가입
      close();
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
    cancelWaiterTimers();
    if (stableTimer != null) deps.clearTimer(stableTimer);
    stableTimer = null;
    probation = false;
    if (probeTimer != null) deps.clearTimer(probeTimer);
    probeTimer = null;
    probeEntry = null;
    state = "open";
    failures = [];
    for (const e of entries) stopInner(e, true);
    const delay = scheduleProbe();
    deps.record("open", { reason, wait_ms: String(delay) });
    for (const cb of [...openListeners]) {
      try {
        cb();
      } catch {
        /* 자체 루프 오류가 감독을 멈추지 않게 */
      }
    }
  };

  const pauseForOffline = () => {
    if (offlinePaused) return;
    offlinePaused = true;
    clearRestartTimers();
    for (const e of entries) stopInner(e, true);
    deps.record("offline_pause", {});
    for (const cb of [...openListeners]) {
      try {
        cb();
      } catch {
        /* 자체 루프 오류가 감독을 멈추지 않게 */
      }
    }
  };

  /** 닫힌 상태의 실패 1건을 창에 넣고, 기준을 넘으면 차단. 반환 = 차단했는가 */
  const noteFailure = (): boolean => {
    if (state !== "closed") return false;
    if (!deps.canProbe()) return false;
    const t = deps.now();
    const last = failures[failures.length - 1];
    if (last === undefined || t - last > RT_SUPERVISOR_FAILURE_COALESCE_MS) failures.push(t);
    failures = failures.filter((x) => t - x <= RT_SUPERVISOR_LONG_WINDOW_MS);
    const shortCount = failures.filter((x) => t - x <= RT_SUPERVISOR_SHORT_WINDOW_MS).length;
    const shortLimit = probation ? RT_SUPERVISOR_PROBATION_FAILURES : RT_SUPERVISOR_SHORT_WINDOW_FAILURES;
    if (shortCount >= shortLimit || failures.length >= RT_SUPERVISOR_LONG_WINDOW_FAILURES) {
      open(probation && shortCount >= shortLimit ? "probation" : shortCount >= shortLimit ? "short_window" : "long_window");
      return true;
    }
    return false;
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
      if (e === probeEntry && deps.canProbe()) {
        deps.record("probe_fail", { reason: status.toLowerCase() });
        open("probe_failed");
      }
      return;
    }
    if (state !== "closed") return;
    if (!isOnline()) {
      pauseForOffline();
      return;
    }
    /**
     * 실기 T4(2026-11-26 21:43 PHT, Samsung 비행기 모드 70초): 오프라인 중 실패를 세어 차단·쉼이 생겨 온라인 뒤 감독 채널만
     * 54초 뒤 재가입(감독 밖 채널 20초). 오프라인·숨김 중 실패는 서버 거절이 아니므로 세지 않는다 — 재시도는 래퍼가 그대로 한다.
     */
    if (!deps.canProbe()) return;
    if (noteFailure()) return;
    e.consecutiveFailures += 1;
    if (e.consecutiveFailures >= RT_SUPERVISOR_CHANNEL_PARK_FAILURES) {
      e.parked = true;
      stopInner(e, true);
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
        lastStatus: null,
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
          stopInner(e, false);
          if (e === probeEntry && state === "half_open") {
            if (probeTimer != null) deps.clearTimer(probeTimer);
            probeTimer = null;
            probeEntry = null;
            state = "open";
            /** 독립 감사 F2: 시험 채널이 시험 중 사라지면 곧바로 다른 채널로 시험(보이는 중이면) — 아니면 복귀 대기 */
            if (waitTimer == null) {
              if (deps.canProbe()) probe();
              else waitingForWake = true;
            }
          }
        },
        markSignal: () => {
          e.inner?.markSignal();
        },
      };
    },
    wake() {
      if (offlinePaused) {
        if (!isOnline()) return;
        offlinePaused = false;
        deps.record("offline_resume", {});
        if (state === "closed") {
          restartAllGradually();
          flushJoinWaiters();
          return;
        }
      }
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
    isJoinAllowed: () => state === "closed" && !offlinePaused,
    allChannelsLive() {
      if (state !== "closed" || offlinePaused) return false;
      const live = [...entries].filter((e) => !e.stopped);
      if (!live.length) return false;
      return live.every((e) => e.inner != null && !e.parked && e.lastStatus === "SUBSCRIBED");
    },
    noteSelfLoopFailure() {
      if (state === "closed" && !isOnline()) {
        pauseForOffline();
        return;
      }
      noteFailure();
    },
    onOpen(cb) {
      openListeners.add(cb);
      return () => {
        openListeners.delete(cb);
      };
    },
    whenJoinAllowed(cb) {
      joinWaiters.add(cb);
      return () => {
        joinWaiters.delete(cb);
        for (const [t, c] of waiterTimers) {
          if (c === cb) {
            deps.clearTimer(t);
            waiterTimers.delete(t);
          }
        }
      };
    },
    activeCount: () => [...entries].filter((e) => e.inner != null).length,
  };
}

export function messengerRealtimeSupervisorEnabled(): boolean {
  return supervisorEnabled();
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
    isOnline: () => !(typeof navigator !== "undefined" && navigator.onLine === false),
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
  return getDefaultSupervisor().isJoinAllowed();
}

/** 감독하는 채널이 모두 지금 연결돼 있는가 — 감독을 끈 경우(롤백 스위치)는 알 수 없으므로 false */
export function messengerRealtimeAllSupervisedChannelsLive(): boolean {
  if (!supervisorEnabled()) return false;
  return getDefaultSupervisor().allChannelsLive();
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

/** 자체 재시도 루프의 가입 실패를 감독 창에 센다 */
export function noteMessengerRealtimeSelfLoopFailure(): void {
  if (!supervisorEnabled()) return;
  getDefaultSupervisor().noteSelfLoopFailure();
}

/** 차단이 열릴 때 1번씩 불린다 — 자체 루프가 가입된 채널을 놓는 데 쓴다 */
export function onMessengerRealtimeSupervisorOpen(cb: () => void): () => void {
  if (!supervisorEnabled()) return () => undefined;
  return getDefaultSupervisor().onOpen(cb);
}
