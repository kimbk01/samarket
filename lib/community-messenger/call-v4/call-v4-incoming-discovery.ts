"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import {
  callV4FetchIncomingSessionsOutcome,
  callV4FetchSession,
  type CallV4IncomingFetchOutcome,
} from "@/lib/community-messenger/call-v4/call-v4-api";
import { subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import {
  getCallV4PersistedSurfaceOwner,
  isCallV4NativeAcceptingSurface,
  syncCallV4NativeAcceptingSurfaceFromWindowLocation,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import {
  isCallV4CalleeAcceptRoute,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";
import { tryPrimeCallV4WebIncomingOwner } from "@/lib/community-messenger/call-v4/call-v4-platform-owner-claim";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import {
  INCOMING_CALL_BACKUP_HTTP_POLL_SUPPRESSED_TAIL_MS,
  shouldRunIncomingCallBackupHttpPoll,
} from "@/lib/layout/incoming-call-backup-poll-policy";
import { acquireCallV4IncomingRealtimeFeed } from "@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed";
import {
  confirmCallV4IncomingRemoteTerminal,
  isCurrentCallV4IncomingRinging,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

const INCOMING_POLL_MS = 2_000;
const INCOMING_POLL_MAX_BACKOFF_MS = 30_000;
const INCOMING_POLL_MAX_BACKOFF_STEPS = 4;
/**
 * S4 (docs/audit/supabase-request-surge-s4-poll-reduction-design-2026-11-08.md · Owner 「지금 구현」 2026-11-08):
 * 실시간 수신 채널이 SUBSCRIBED 를 5초 이상 유지하는 동안만 2초 → 10초.
 * 10초 = 실시간이 몰래 끊겨도(무음 사망) 30초 울림 안에 조회로 반드시 찾는 상한(요청 왕복 포함 약 11초).
 * 울리는 중·끊김·오류·연결 중에는 2초 그대로. SUBSCRIBED 만으로 0 으로 만들지 않는다(Owner 지시).
 */
export const CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS = 10_000;
export const CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS = 5_000;

/**
 * F1 (docs/audit/f1-f2-call-incoming-design-2026-11-09.md §F1-6 · Owner F1 승인 2026-11-09)
 * HTTP 오류는 「수신 없음」이 아니다 — 종류별로 간격을 정하고, 오류 응답으로는 T2(빠짐 확인)를 하지 않는다.
 * - 5xx·본문 오류(bad_response): 2초 × 2^n, 상한 8초 — 울림 30초 안에 최소 3회(8·16·24초) 조회 기회.
 * - 429: Retry-After 를 따른다(2~60초). 울림 구간(울리는 중 또는 울림 신호 30초 이내)에는 429 시점부터 최대 8초.
 * - 401(auth)·403(forbidden): 예외와 같은 사다리(4→8→16→30초). 401 은 인증 회복(SIGNED_IN·TOKEN_REFRESHED) 때 즉시 1회.
 */
export const CALL_V4_INCOMING_ERROR_MAX_BACKOFF_MS = 8_000;
export const CALL_V4_INCOMING_RATE_LIMIT_MIN_WAIT_MS = 2_000;
export const CALL_V4_INCOMING_RATE_LIMIT_MAX_WAIT_MS = 60_000;
/** Retry-After 가 없거나 읽을 수 없을 때 — 서버 고정 창(60초) 전체 */
export const CALL_V4_INCOMING_RATE_LIMIT_DEFAULT_WAIT_MS = 60_000;
export const CALL_V4_INCOMING_RATE_LIMIT_RINGING_MAX_WAIT_MS = 8_000;
/** 울림 구간 판정 — 운영 `incoming_ring_timeout_seconds` 30초 */
export const CALL_V4_INCOMING_RING_WINDOW_MS = 30_000;

export type CallV4IncomingFailureKind = "network" | "auth" | "forbidden" | "server" | "bad_response";

function pickIncomingRingingCallee(sessions: CommunityMessengerCallSession[]): CommunityMessengerCallSession | null {
  for (const session of sessions) {
    const callId = session.id?.trim() ?? "";
    if (!callId || session.status !== "ringing" || session.isMineInitiator) continue;
    return session;
  }
  return null;
}

function isIncomingDiscoveryDuplicateSkip(callId: string): boolean {
  if (isCallV4NativeAcceptingSurface(callId)) return true;
  if (isNativeAcceptInflight(callId)) return true;
  if (typeof window !== "undefined") {
    const path = `${window.location.pathname}${window.location.search}`;
    if (
      isCallV4CalleeAcceptRoute(path) &&
      readCallV4SessionIdFromNativeRoute(path) === callId
    ) {
      return true;
    }
  }
  const phase = readCallV4Phase();
  const current = readCallV4Identity();
  if (current?.callId !== callId) return false;
  return phase !== "idle";
}

function readCallV4IncomingDiscoveryPathname(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname;
}

function hasCallV4IncomingDiscoveryRingingCallee(): boolean {
  const phase = readCallV4Phase();
  return phase === "incoming_ringing" || phase === "accepting";
}

/** Legacy incoming HTTP 백업 폴링 표면 정책과 동일 — 홈·커뮤니티 표면에서는 GET 생략. */
export function shouldRunCallV4IncomingDiscoveryHttpPoll(): boolean {
  return shouldRunIncomingCallBackupHttpPoll(
    readCallV4IncomingDiscoveryPathname(),
    hasCallV4IncomingDiscoveryRingingCallee(),
  );
}

/**
 * 조회 간격 — 순서가 곧 우선순위다.
 * 1) 채팅 화면 밖(울림 없음): 60초 대기(HTTP 없음) — 기존
 * 1-1) F1 429 대기 중: 남은 시간(2~60초, 울림 구간은 429 시점부터 8초 상한 — 호출자가 반영)
 * 2) 실패 백오프: 예외·401·403 은 4→8→16→30초(기존 사다리), F1 5xx·본문 오류는 4→8초 상한
 * 3) 울리는 중: 2초 — 원격 종료 백업(T2)·수락 흐름이 이 주기에 기댐
 * 4) 실시간 SUBSCRIBED 5초 이상 유지: 10초 (S4)
 * 5) 그 밖(끊김·오류·연결 중·피드 없음): 2초 — 기존
 */
export function resolveCallV4IncomingDiscoveryPollDelayMs(
  allowHttp: boolean,
  consecutiveNetworkFailures: number,
  realtime?: { ringing: boolean; healthy: boolean },
  failure?: { kind?: CallV4IncomingFailureKind | null; rateLimitWaitMs?: number | null },
): number {
  if (!allowHttp) return INCOMING_CALL_BACKUP_HTTP_POLL_SUPPRESSED_TAIL_MS;
  /** F1: 429 대기 중 — 남은 시간만큼(2~60초). 울림 구간 상한(8초)은 호출자가 남은 시간에 이미 반영한다. */
  const rateLimitWaitMs = failure?.rateLimitWaitMs ?? 0;
  if (rateLimitWaitMs > 0) {
    return Math.min(
      Math.max(rateLimitWaitMs, CALL_V4_INCOMING_RATE_LIMIT_MIN_WAIT_MS),
      CALL_V4_INCOMING_RATE_LIMIT_MAX_WAIT_MS,
    );
  }
  if (consecutiveNetworkFailures <= 0) {
    if (realtime && !realtime.ringing && realtime.healthy) return CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS;
    return INCOMING_POLL_MS;
  }
  const steps = Math.min(consecutiveNetworkFailures, INCOMING_POLL_MAX_BACKOFF_STEPS);
  /** F1: 5xx·본문 오류 — 2→4→8초 상한(울리는 중에도 같은 상한: 무한 2초 재시도 금지 + 30초 안 3회 기회) */
  if (failure?.kind === "server" || failure?.kind === "bad_response") {
    return Math.min(INCOMING_POLL_MS * 2 ** steps, CALL_V4_INCOMING_ERROR_MAX_BACKOFF_MS);
  }
  return Math.min(INCOMING_POLL_MS * 2 ** steps, INCOMING_POLL_MAX_BACKOFF_MS);
}

/** Phase 6A — only discover when Android owner bridge says web_in_app. */
export function shouldDiscoverCallV4IncomingForWebSheet(callId: string): {
  discover: boolean;
  reason: "owner_pending" | "owner_not_web_in_app" | "allow_web_in_app";
} {
  const owner = getCallV4PersistedSurfaceOwner(callId);
  if (owner === "web_in_app") return { discover: true, reason: "allow_web_in_app" };
  if (owner === "none") return { discover: false, reason: "owner_pending" };
  return { discover: false, reason: "owner_not_web_in_app" };
}

export function discoverCallV4IncomingSessionIfWebOwner(
  session: CommunityMessengerCallSession,
): void {
  const callId = session.id?.trim() ?? "";
  if (!callId) return;
  const gate = shouldDiscoverCallV4IncomingForWebSheet(callId);
  if (!gate.discover) {
    logCallV4("incoming_discovery_suppressed", { callId, reason: gate.reason });
    return;
  }
  callV4IncomingDiscovered(session);
}

/** Re-evaluate after Android surface-owner bridge arrives. */
export async function tryHydrateCallV4IncomingForWebOwner(callId: string): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  const session = await callV4FetchSession(sid);
  if (session?.status !== "ringing" || session.isMineInitiator) return;
  discoverCallV4IncomingSessionIfWebOwner(session);
}

/**
 * U2 측정 — 수신 callId 별로 「먼저 발견한 경로」(Realtime 신호로 시작한 조회 / 정기 폴링)를 센다.
 * 폴링 축소안(S4)은 이 측정으로 Realtime 수신률이 증명된 뒤에만 제시한다.
 * 집계는 U1 모니터링(카테고리 `call.incoming_discovery`)으로 보낸다. 라벨은 저장되지 않으므로 탭 상태는 이름에 넣는다.
 */
export const CALL_V4_INCOMING_REALTIME_NEVER_AFTER_MS = 10_000;
const DISCOVERY_MEASURE_MAX_CALLS = 20;

type IncomingTickSource = "poll" | "realtime" | "resync";

type IncomingDiscoveryMeasure = {
  realtimeSeen: boolean;
  neverTimer: ReturnType<typeof setTimeout> | null;
};

function readTabState(): "visible" | "hidden" {
  return typeof document !== "undefined" && document.visibilityState === "hidden" ? "hidden" : "visible";
}

function recordIncomingDiscoveryMetric(metric: string, value: number): void {
  messengerMonitorRecord({ category: "call.incoming_discovery", metric, value, unit: "ms" });
}

function recordIncomingDiscoveryCount(metric: string): void {
  messengerMonitorRecord({ category: "call.incoming_discovery", metric, value: 1, unit: "count" });
}

function elapsedSinceStartMs(startedAt: string | null | undefined): number {
  const t = startedAt ? Date.parse(startedAt) : NaN;
  return Number.isFinite(t) ? Math.max(0, Date.now() - t) : -1;
}

function rememberBounded(set: Set<string>, id: string): void {
  if (set.has(id)) return;
  if (set.size >= DISCOVERY_MEASURE_MAX_CALLS) {
    const oldest = set.values().next().value;
    if (oldest != null) set.delete(oldest);
  }
  set.add(id);
}

export function startCallV4IncomingDiscovery(userId: string | null): () => void {
  if (!isCallV4TelegramLaneEnabled() || !userId) return () => {};
  let cancelled = false;
  let inFlight = false;
  /** 연속 실패 수(예외·HTTP 오류 공통, 상한 4). 성공(ok) 때만 0 — 오류로는 줄이지 않는다. */
  let consecutiveNetworkFailures = 0;
  /** F1: 마지막 실패 종류 — 간격 사다리·인증 회복 판단 */
  let lastFailureKind: CallV4IncomingFailureKind | null = null;
  /** F1: 429 — 받은 시각과 Retry-After 해제 시각 */
  let rateLimitedAtMs: number | null = null;
  let rateLimitedUntilMs: number | null = null;
  /** F1: 마지막 실시간 울림 신호 시각 — 울림 구간(429 대기 상한 8초) 판정 */
  let lastRingingSignalAtMs: number | null = null;
  let pollTimer: number | null = null;
  /** Realtime 신호가 조회 중에 오면 끝난 뒤 1회만 다시 조회한다(신호 유실 방지). */
  let pendingRealtimeTick = false;
  /** U2: 브라우저·PWA 에서만 Realtime 신호를 병행한다(아래 acquire). */
  const realtimeFeedActive = !isCapacitorNativePlatform();
  let releaseRealtimeFeed: () => void = () => {};
  /** S4: 실시간 수신 채널 상태 — SUBSCRIBED 가 언제부터 이어졌는가 */
  let feedStatus: string | null = null;
  let subscribedSince: number | null = null;
  const isRealtimeHealthy = (): boolean =>
    realtimeFeedActive &&
    feedStatus === "SUBSCRIBED" &&
    subscribedSince != null &&
    Date.now() - subscribedSince >= CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS;
  /** 측정 — 조회로 처음 발견한 callId, Realtime 신호가 도착한 callId */
  const measures = new Map<string, IncomingDiscoveryMeasure>();
  const realtimeSignaled = new Set<string>();

  /**
   * 조회 결과에서 callId 를 처음 봤을 때 1회.
   * 「먼저 발견한 경로」는 tick 의 출처가 아니라 「그 시점까지 Realtime 신호가 왔는가」로 정한다
   * (신호가 왔는데 진행 중인 폴링 조회가 먼저 끝나 발견한 경우도 Realtime 이 먼저 도착한 것으로 센다).
   */
  const noteFirstFound = (callId: string, startedAt: string | null | undefined) => {
    if (measures.has(callId)) return;
    if (measures.size >= DISCOVERY_MEASURE_MAX_CALLS) {
      const oldest = measures.keys().next().value;
      if (oldest != null) {
        const m = measures.get(oldest);
        if (m?.neverTimer) clearTimeout(m.neverTimer);
        measures.delete(oldest);
      }
    }
    const tab = readTabState();
    const realtimeFirst = realtimeSignaled.has(callId);
    const entry: IncomingDiscoveryMeasure = { realtimeSeen: realtimeFirst, neverTimer: null };
    measures.set(callId, entry);
    recordIncomingDiscoveryMetric(
      `incoming_found_${realtimeFirst ? "realtime" : "poll"}_first_${tab}`,
      elapsedSinceStartMs(startedAt),
    );
    if (!realtimeFirst && realtimeFeedActive) {
      entry.neverTimer = setTimeout(() => {
        entry.neverTimer = null;
        if (cancelled || entry.realtimeSeen) return;
        recordIncomingDiscoveryMetric(`incoming_realtime_never_${tab}`, CALL_V4_INCOMING_REALTIME_NEVER_AFTER_MS);
      }, CALL_V4_INCOMING_REALTIME_NEVER_AFTER_MS);
    }
  };

  const noteRealtimeSignal = (callId: string, startedAt: string | null) => {
    const firstSignal = !realtimeSignaled.has(callId);
    rememberBounded(realtimeSignaled, callId);
    if (!firstSignal) return;
    const tab = readTabState();
    recordIncomingDiscoveryMetric(`incoming_realtime_signal_${tab}`, elapsedSinceStartMs(startedAt));
    const m = measures.get(callId);
    if (m && !m.realtimeSeen) {
      m.realtimeSeen = true;
      recordIncomingDiscoveryMetric(`incoming_realtime_after_poll_${tab}`, elapsedSinceStartMs(startedAt));
    }
    if (!shouldRunCallV4IncomingDiscoveryHttpPoll()) {
      recordIncomingDiscoveryMetric(`incoming_realtime_outside_surface_${tab}`, elapsedSinceStartMs(startedAt));
    }
  };

  const isInRingWindow = (nowMs: number): boolean =>
    hasCallV4IncomingDiscoveryRingingCallee() ||
    (lastRingingSignalAtMs != null && nowMs - lastRingingSignalAtMs < CALL_V4_INCOMING_RING_WINDOW_MS);

  /** F1: 429 로 남은 대기(ms). 울림 구간에는 429 시점부터 최대 8초까지만 기다린다. */
  const rateLimitRemainingMs = (nowMs: number): number => {
    if (rateLimitedUntilMs == null || rateLimitedAtMs == null) return 0;
    const until = isInRingWindow(nowMs)
      ? Math.min(rateLimitedUntilMs, rateLimitedAtMs + CALL_V4_INCOMING_RATE_LIMIT_RINGING_MAX_WAIT_MS)
      : rateLimitedUntilMs;
    return Math.max(0, until - nowMs);
  };

  /** F1: 오류 응답 — 빈 목록으로 바꾸지 않는다. T2(빠짐 확인) 없음, 실패 카운터는 늘리기만 한다. */
  const noteHttpFailure = (outcome: Exclude<CallV4IncomingFetchOutcome, { kind: "ok" }>) => {
    recordIncomingDiscoveryCount(`incoming_http_${outcome.kind}_${readTabState()}`);
    logCallV4("incoming_poll_http_failure", { kind: outcome.kind, status: outcome.status });
    if (outcome.kind === "rate_limited") {
      const now = Date.now();
      const wait = Math.min(
        Math.max(outcome.retryAfterMs ?? CALL_V4_INCOMING_RATE_LIMIT_DEFAULT_WAIT_MS, CALL_V4_INCOMING_RATE_LIMIT_MIN_WAIT_MS),
        CALL_V4_INCOMING_RATE_LIMIT_MAX_WAIT_MS,
      );
      rateLimitedAtMs = now;
      rateLimitedUntilMs = now + wait;
      return;
    }
    lastFailureKind = outcome.kind;
    consecutiveNetworkFailures = Math.min(consecutiveNetworkFailures + 1, INCOMING_POLL_MAX_BACKOFF_STEPS);
  };

  /** 항상 타이머 1개만 — 즉시 조회(resync)와 정기 조회가 겹쳐도 예약이 두 갈래로 갈라지지 않게 기존 예약을 지운다. */
  const scheduleNextPoll = () => {
    if (cancelled) return;
    if (pollTimer != null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
    const allowHttp = shouldRunCallV4IncomingDiscoveryHttpPoll();
    const delayMs = resolveCallV4IncomingDiscoveryPollDelayMs(
      allowHttp,
      consecutiveNetworkFailures,
      { ringing: hasCallV4IncomingDiscoveryRingingCallee(), healthy: isRealtimeHealthy() },
      { kind: lastFailureKind, rateLimitWaitMs: rateLimitRemainingMs(Date.now()) },
    );
    pollTimer = window.setTimeout(() => {
      pollTimer = null;
      void tick("poll").finally(scheduleNextPoll);
    }, delayMs);
  };

  const tick = async (source: IncomingTickSource) => {
    if (cancelled) return;
    if (inFlight) {
      if (source !== "poll") pendingRealtimeTick = true;
      return;
    }
    syncCallV4NativeAcceptingSurfaceFromWindowLocation();
    if (!shouldRunCallV4IncomingDiscoveryHttpPoll()) return;
    /** F1: 429 대기 중 — 서버가 거부하는 구간. 신호·resync 조회도 해제 시각 예약 1회로 합친다(scheduleNextPoll). */
    if (rateLimitRemainingMs(Date.now()) > 0) return;

    inFlight = true;
    if (source === "poll" && realtimeFeedActive) {
      /** S4 측정 — 정기 조회 1회가 어떤 상태에서 나갔는가(축소 효과 실측) */
      recordIncomingDiscoveryCount(
        `poll_tick_${isRealtimeHealthy() ? "subscribed" : "unsubscribed"}_${readTabState()}`,
      );
    }
    try {
      const outcome = await callV4FetchIncomingSessionsOutcome();
      if (outcome.kind !== "ok") {
        /** F1: 오류 응답은 「빠짐」을 알 수 없다 — T2 생략(T1 Realtime·T3 broadcast·다음 성공 조회가 맡는다). */
        noteHttpFailure(outcome);
        return;
      }
      const sessions = outcome.sessions;
      consecutiveNetworkFailures = 0;
      lastFailureKind = null;
      rateLimitedAtMs = null;
      rateLimitedUntilMs = null;
      /**
       * T2 (원격 종료 백업): 이 탭이 울리는 중인 통화가 조회 결과에 없으면 서버 세션을 다시 읽어 확인한다.
       * 정상 응답(200 ok:true)만 여기 온다. 서버가 DB 오류를 `200 + []` 로 줄 수도 있으므로(빠짐만으로 판단 금지)
       * 반드시 확인 함수가 서버 상태로 확정한다.
       */
      const ringingNowId = readCallV4Identity()?.callId?.trim() ?? "";
      if (
        ringingNowId &&
        isCurrentCallV4IncomingRinging(ringingNowId) &&
        !sessions.some((s) => s.id?.trim() === ringingNowId)
      ) {
        void confirmCallV4IncomingRemoteTerminal(ringingNowId, "poll_incoming_absent");
      }
      const candidate = pickIncomingRingingCallee(sessions);
      if (!candidate?.id) return;
      const callId = candidate.id.trim();
      noteFirstFound(callId, candidate.startedAt);
      if (isIncomingDiscoveryDuplicateSkip(callId)) return;
      if (isCallV4NativeAcceptingSurface(callId)) {
        logCallV4("incoming_sheet_suppressed_native_accepting", { callId });
        return;
      }
      const gate = shouldDiscoverCallV4IncomingForWebSheet(callId);
      if (gate.discover) {
        discoverCallV4IncomingSessionIfWebOwner(candidate);
        return;
      }
      void tryPrimeCallV4WebIncomingOwner(callId, "poll_discovery").then(() => {
        if (cancelled) return;
        const after = shouldDiscoverCallV4IncomingForWebSheet(callId);
        if (after.discover) discoverCallV4IncomingSessionIfWebOwner(candidate);
      });
    } catch {
      lastFailureKind = "network";
      consecutiveNetworkFailures = Math.min(
        consecutiveNetworkFailures + 1,
        INCOMING_POLL_MAX_BACKOFF_STEPS,
      );
    } finally {
      inFlight = false;
      if (pendingRealtimeTick && !cancelled) {
        pendingRealtimeTick = false;
        /** 밀린 신호 조회가 울림을 발견하면 간격이 바뀌므로(→2초) 끝난 뒤 다시 예약한다. */
        void tick("realtime").finally(scheduleNextPoll);
      }
    }
  };

  /**
   * U2: 브라우저·PWA 에서만 Realtime 신호를 병행한다. iOS 앱 셸은 CallKit 과 웹 시트 순서 위험(K4)으로 제외.
   * 폴링 주기·조건·실패 처리는 그대로다(신호는 같은 tick 을 한 번 더 부를 뿐).
   */
  /** S4: 상태가 바뀐 순간 기다리지 않고 1회 조회한 뒤 그 상태의 간격으로 다시 예약한다. */
  const resyncNow = () => {
    if (cancelled) return;
    if (pollTimer != null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
    void tick("resync").finally(scheduleNextPoll);
  };
  const onVisibilityResync = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") resyncNow();
  };
  const onOnlineResync = () => resyncNow();
  if (realtimeFeedActive && typeof window !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityResync);
    window.addEventListener("online", onOnlineResync);
  }

  if (realtimeFeedActive) {
    releaseRealtimeFeed = acquireCallV4IncomingRealtimeFeed(userId, {
      onRinging: ({ callId, startedAt }) => {
        if (cancelled) return;
        /** 같은 통화의 ringing UPDATE 가 여러 번 와도 추가 조회는 통화당 1회(요청 증폭 금지). */
        const firstSignal = !realtimeSignaled.has(callId);
        noteRealtimeSignal(callId, startedAt);
        if (!firstSignal) return;
        lastRingingSignalAtMs = Date.now();
        logCallV4("incoming_realtime_signal", { callId });
        /** S4: 울림이 시작되면 다음 예약(10초일 수 있음)을 버리고 울림 중 2초 주기로 다시 잡는다. */
        void tick("realtime").finally(scheduleNextPoll);
      },
      /** T1 (원격 종료 주 경로): 내 수신 행이 ringing 이 아니게 됐다 → 서버 확인 후 정리(누가 종료했든 온다). */
      onSessionStatus: ({ callId, status }) => {
        if (cancelled) return;
        if (!isCurrentCallV4IncomingRinging(callId)) return;
        logCallV4("incoming_realtime_session_status", { callId, status });
        void confirmCallV4IncomingRemoteTerminal(callId, "realtime_incoming_status");
      },
      onStatus: (status) => {
        if (cancelled) return;
        const wasHealthyStatus = feedStatus === "SUBSCRIBED";
        feedStatus = status;
        if (status === "SUBSCRIBED") {
          if (!wasHealthyStatus) subscribedSince = Date.now();
        } else {
          subscribedSince = null;
        }
        /** S4: 연결이 붙거나 끊기는 순간 1회 조회(놓친 울림 복구) + 새 간격으로 다시 예약 */
        if ((status === "SUBSCRIBED") !== wasHealthyStatus) resyncNow();
        if (status === "SUBSCRIBED") {
          recordIncomingDiscoveryMetric(`incoming_feed_subscribed_${readTabState()}`, 0);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          recordIncomingDiscoveryMetric(`incoming_feed_${status.toLowerCase()}_${readTabState()}`, 0);
        }
      },
    });
  }

  /**
   * F1: 401 뒤 인증이 돌아오면(앱 단일 인증 이벤트 fan-out — onAuthStateChange 중복 구독 금지) 기다리지 않고 1회 조회.
   * 401 실패 상태일 때만 반응하므로 평시 TOKEN_REFRESHED 로는 요청이 늘지 않는다.
   */
  const unsubscribeAuth = subscribeDibayAuthStateChange((event, session) => {
    if (cancelled) return;
    if (event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED") return;
    if (lastFailureKind !== "auth" || consecutiveNetworkFailures <= 0) return;
    const sessionUserId = session?.user?.id?.trim().toLowerCase() ?? "";
    if (sessionUserId && sessionUserId !== userId.trim().toLowerCase()) return;
    consecutiveNetworkFailures = 0;
    lastFailureKind = null;
    logCallV4("incoming_poll_auth_recovered", { event });
    resyncNow();
  });

  void tick("poll").finally(scheduleNextPoll);
  return () => {
    cancelled = true;
    unsubscribeAuth();
    releaseRealtimeFeed();
    if (realtimeFeedActive && typeof window !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityResync);
      window.removeEventListener("online", onOnlineResync);
    }
    for (const m of measures.values()) {
      if (m.neverTimer) clearTimeout(m.neverTimer);
    }
    measures.clear();
    realtimeSignaled.clear();
    if (pollTimer != null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  };
}
