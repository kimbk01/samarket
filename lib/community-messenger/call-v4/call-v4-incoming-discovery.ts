"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchIncomingSessions, callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
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

function resolveCallV4IncomingDiscoveryPollDelayMs(allowHttp: boolean, consecutiveNetworkFailures: number): number {
  if (!allowHttp) return INCOMING_CALL_BACKUP_HTTP_POLL_SUPPRESSED_TAIL_MS;
  if (consecutiveNetworkFailures <= 0) return INCOMING_POLL_MS;
  const steps = Math.min(consecutiveNetworkFailures, INCOMING_POLL_MAX_BACKOFF_STEPS);
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

type IncomingTickSource = "poll" | "realtime";

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
  let consecutiveNetworkFailures = 0;
  let pollTimer: number | null = null;
  /** Realtime 신호가 조회 중에 오면 끝난 뒤 1회만 다시 조회한다(신호 유실 방지). */
  let pendingRealtimeTick = false;
  /** U2: 브라우저·PWA 에서만 Realtime 신호를 병행한다(아래 acquire). */
  const realtimeFeedActive = !isCapacitorNativePlatform();
  let releaseRealtimeFeed: () => void = () => {};
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

  const scheduleNextPoll = () => {
    if (cancelled) return;
    const allowHttp = shouldRunCallV4IncomingDiscoveryHttpPoll();
    const delayMs = resolveCallV4IncomingDiscoveryPollDelayMs(allowHttp, consecutiveNetworkFailures);
    pollTimer = window.setTimeout(() => {
      pollTimer = null;
      void tick("poll").finally(scheduleNextPoll);
    }, delayMs);
  };

  const tick = async (source: IncomingTickSource) => {
    if (cancelled) return;
    if (inFlight) {
      if (source === "realtime") pendingRealtimeTick = true;
      return;
    }
    syncCallV4NativeAcceptingSurfaceFromWindowLocation();
    if (!shouldRunCallV4IncomingDiscoveryHttpPoll()) return;

    inFlight = true;
    try {
      const sessions = await callV4FetchIncomingSessions();
      consecutiveNetworkFailures = 0;
      /**
       * T2 (원격 종료 백업): 이 탭이 울리는 중인 통화가 조회 결과에 없으면 서버 세션을 다시 읽어 확인한다.
       * 조회 실패도 `[]` 로 오므로(빠짐만으로 판단 금지) 반드시 확인 함수가 서버 상태로 확정한다.
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
      consecutiveNetworkFailures = Math.min(
        consecutiveNetworkFailures + 1,
        INCOMING_POLL_MAX_BACKOFF_STEPS,
      );
    } finally {
      inFlight = false;
      if (pendingRealtimeTick && !cancelled) {
        pendingRealtimeTick = false;
        void tick("realtime");
      }
    }
  };

  /**
   * U2: 브라우저·PWA 에서만 Realtime 신호를 병행한다. iOS 앱 셸은 CallKit 과 웹 시트 순서 위험(K4)으로 제외.
   * 폴링 주기·조건·실패 처리는 그대로다(신호는 같은 tick 을 한 번 더 부를 뿐).
   */
  if (realtimeFeedActive) {
    releaseRealtimeFeed = acquireCallV4IncomingRealtimeFeed(userId, {
      onRinging: ({ callId, startedAt }) => {
        if (cancelled) return;
        /** 같은 통화의 ringing UPDATE 가 여러 번 와도 추가 조회는 통화당 1회(요청 증폭 금지). */
        const firstSignal = !realtimeSignaled.has(callId);
        noteRealtimeSignal(callId, startedAt);
        if (!firstSignal) return;
        logCallV4("incoming_realtime_signal", { callId });
        void tick("realtime");
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
        if (status === "SUBSCRIBED") {
          recordIncomingDiscoveryMetric(`incoming_feed_subscribed_${readTabState()}`, 0);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          recordIncomingDiscoveryMetric(`incoming_feed_${status.toLowerCase()}_${readTabState()}`, 0);
        }
      },
    });
  }

  void tick("poll").finally(scheduleNextPoll);
  return () => {
    cancelled = true;
    releaseRealtimeFeed();
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
