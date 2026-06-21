"use client";

/**
 * 수신 통화 전용 — 발신 진입점은 `lib/community-messenger/outgoing-call-surfaces.ts` 참고.
 * 폴링·`runSingleFlight` 키: `docs/messenger-realtime-policy.md`
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  playCommunityMessengerCallSignalSound,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
} from "@/lib/community-messenger/call-feedback-sound";
import { logCallFlow } from "@/lib/community-messenger/call-flow-log";
import {
  dibayCallSealTerminal,
  dibayIncomingLaneStopRing,
} from "@/lib/community-messenger/call-lifecycle";
import { stopIncomingCallRing, syncIncomingCallRing } from "@/lib/community-messenger/incoming-call/ring-owner";
import { sealIncomingCallTerminal } from "@/lib/community-messenger/incoming-call/terminal";
import {
  dismissIncomingPresenterAfterAccept,
  markIncomingCallHardClearedSession,
} from "@/lib/community-messenger/incoming-call/accept-presenter-dismiss";
import {
  buildCallTombstoneContext,
  fcmTerminalKindToSessionStatus,
  resolveIncomingCallWake,
  sealFcmTerminalEvent,
} from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import { filterSessionsRespectingTerminalLatch } from "@/lib/community-messenger/call-events/session-merge-guard";
import { resolveIncomingConsumedBusSealReason } from "@/lib/community-messenger/call-events/incoming-consumed-bus-guard";
import {
  canShowIncoming,
  isCallTerminal,
} from "@/lib/community-messenger/call-state/call-terminal-tombstone";
import {
  buildIncomingPresenterDecisionPayload,
  logIncomingPresenterDecision,
} from "@/lib/community-messenger/incoming-call/incoming-presenter-decision-log";
import { resetAllIncomingCallRuntime } from "@/lib/community-messenger/incoming-call-cleanup";
import {
  clearNativeCalleeAcceptPending,
} from "@/lib/community-messenger/native-callee-accept-entry";
import {
  resetIncomingCallActionGuards,
} from "@/lib/community-messenger/incoming-call-action-guard";
import { isStoreOwnerAdminPathname } from "@/lib/business/owner-hub-path";
import {
  OWNER_HUB_SECONDARY_AFTER_MS,
  runNowOrScheduleOnStoreOwnerAdmin,
} from "@/lib/business/owner-hub-secondary-fetch-queue";
import {
  fetchMessengerCallSoundConfig,
  getMessengerCallSoundConfigCache,
} from "@/lib/community-messenger/messenger-call-sound-config-client";
import {
  primeCommunityMessengerCallNavigationSeed,
  rememberCallNavigationReturnPath,
} from "@/lib/community-messenger/call-session-navigation-seed";
import {
  ensureCallMediaForUserGesture,
  getCallMediaPermissionBlockedMessageKey,
} from "@/lib/community-messenger/call-media-permission-preflight";
import {
  COMMUNITY_MESSENGER_PREFERENCE_EVENT,
  isCommunityMessengerIncomingCallBannerEnabled,
  isCommunityMessengerIncomingCallSoundEnabled,
} from "@/lib/community-messenger/preferences";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { playNotificationSound } from "@/lib/notifications/play-notification-sound";
import { getSupabaseClient } from "@/lib/supabase/client";
import { acquireIncomingCallRealtimeSubscription } from "@/lib/community-messenger/realtime/cm-incoming-call-realtime-holder";
import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";
import { isCommunityMessengerRealtimeScopeHealthy } from "@/lib/community-messenger/realtime/community-messenger-realtime-health";
import { CommunityMessengerIncomingCallUi } from "@/components/community-messenger/incoming-call";
import { resolveForegroundIncomingPresentation } from "@/lib/community-messenger/incoming-call";
import {
  buildForegroundIncomingWakeOptimisticSession,
  mergeForegroundIncomingWakeSession,
} from "@/lib/community-messenger/incoming-call/foreground-incoming-wake";
import { postCommunityMessengerCallHangupSignal } from "@/lib/call/call-actions";
import { patchCommunityMessengerCallMissedOnce } from "@/lib/community-messenger/messenger-call-missed-patch";
import { evaluateIncomingCallBusyPolicy } from "@/lib/call/call-state";
import { releaseLocalCallSession } from "@/lib/call/active-call-session";
import { releaseCallActionLock } from "@/lib/call/call-action-lock";
import { useIncomingCallTabLeader } from "@/lib/community-messenger/incoming-call-tab-leader";
import { DEFAULT_INCOMING_RING_TIMEOUT_SECONDS } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { showIncomingCallBrowserNotification } from "@/lib/call/call-notification";
import { requestCloseMessengerCallNotifications } from "@/lib/push/push-manager";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import {
  cmCallFlow,
  cmCallIncomingTraceClearRingingRoom,
  cmCallIncomingTraceLogTable,
  cmCallIncomingTraceMergeFromStorage,
  cmCallIncomingTracePatch,
  cmCallIncomingTraceRegisterRingingRoom,
} from "@/lib/community-messenger/cm-call-debug";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import {
  applyIncomingCallSessionsRealtimeEvent,
  communityMessengerIncomingSessionFromInviteBroadcast,
} from "@/lib/community-messenger/incoming-call-realtime-preview";
import {
  resolveOverlayBusyLiveSessionId,
  shouldUseIncomingCallBrowserNotification,
} from "@/lib/community-messenger/incoming-call-surface";
import { appendLocalCallChatMessageFromTerminalSession } from "@/lib/community-messenger/call-chat-local-append";
import {
  callIncomingTerminalQueryFromEvent,
  filterRemoveIncomingSessionsMatchingTerminal,
  hasIncomingCallSessionMatchingTerminal,
  type CallIncomingTerminalQuery,
  isDirectRingingCalleeForSound,
  isRingingIncomingOverlayCandidate,
  isTerminalIncomingCallStatus,
} from "@/lib/community-messenger/call-incoming-terminal";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import {
  drainPendingTerminalEventsFromNative,
  hydrateDibayCallConsumedFromNative,
  isCallConsumedIncludingNative,
} from "@/lib/push/native/dibay-call-consumed-native-bridge";
import { incomingRingTimeoutMsFromConfig } from "@/lib/community-messenger/messenger-call-ring-timeout";
import {
  acceptIncomingCallOnce,
  applyIncomingCallConsumedSideEffects,
  buildPostAcceptActiveCallHref,
  runIncomingCallReject,
} from "@/lib/community-messenger/incoming-call-accept-gateway";
import {
  claimIncomingCallSurface,
  markIncomingCallSurfaceConsumed,
  releaseIncomingCallSurface,
} from "@/lib/community-messenger/incoming-call-surface-owner";
import {
  getIncomingCallPollIntervalMs,
  MESSENGER_INCOMING_CALL_BURST_MIN_GAP_MS,
  MESSENGER_INCOMING_CALL_POLL_DURING_RING_MS,
  MESSENGER_INCOMING_CALL_POLL_WHEN_HIDDEN_MS,
  MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS,
  MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS,
  MESSENGER_INCOMING_CALL_VISIBILITY_RETRY_MS,
  MESSENGER_INCOMING_CALL_WAKE_TRAIL_MS,
} from "@/lib/community-messenger/messenger-latency-config";
import {
  notifyCommunityMessengerCallInviteHangupBestEffort,
  subscribeCommunityMessengerCallInviteBroadcast,
} from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { logCallLatencyCmInviteRingReceived } from "@/lib/community-messenger/call-latency-trace";
import { dispatchRemoteCallSessionTerminalHandoff } from "@/lib/community-messenger/call-client-remote-terminal-feed";
import {
  onCommunityMessengerBusEvent,
  postCommunityMessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";
import {
  getCommunityMessengerIncomingCallBridgeStatus,
  syncCommunityMessengerNativeIncomingCall,
} from "@/lib/community-messenger/native-call-receive";
import { messengerMonitorCallFlowPhase } from "@/lib/community-messenger/monitoring/client";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import {
  INCOMING_CALL_BACKUP_HTTP_POLL_SUPPRESSED_TAIL_MS,
} from "@/lib/layout/incoming-call-backup-poll-policy";
import {
  isIncomingCallWindowForeground,
  readIncomingCallVisibilityState,
  shouldRunIncomingCallBackupHttpRequest,
} from "@/lib/community-messenger/incoming-call-ui-policy";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { runDevSafeSingleFlight } from "@/lib/dev/dev-safe-dedupe";
import { mergeIncomingCallSessionsAfterFetch, areIncomingCallSessionListsStable } from "@/lib/community-messenger/incoming-call-sessions-merge";
import {
  clearDibayCallPendingRoute,
  installDibayFcmCallBridge,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { writeCallAcceptHydratePeerFromSession } from "@/lib/community-messenger/call-accept-hydrate-peer";
import { primeCommunityMessengerCallConnectionPrefetch } from "@/lib/community-messenger/call-connection-prefetch";
import { getActiveCallSessionCallIdForIncomingBusy, subscribeActiveCallSession } from "@/lib/call/active-call-session";
import {
  filterIncomingSessionsRespectingConsumed,
  filterIncomingSessionsRespectingDismissed,
  filterIncomingSessionsRespectingHardClear,
  isDibayCallConsumed,
  pruneHardClearedIncomingSessionIds,
  INCOMING_REMOTE_HARD_CLEAR_KEEP_MS,
  type CallConsumedReason,
} from "@/lib/community-messenger/incoming-call-state";

const INCOMING_CALL_TIER = getPublicDeployTier();
const INCOMING_CALL_FETCH_FLIGHT_KEY = "community-messenger:incoming-calls:directOnly";
const INCOMING_CALL_REALTIME_SCOPE = "community-messenger-incoming-call";
const INCOMING_CALL_REALTIME_SILENT_AFTER_MS = 12_000;
const INCOMING_CALL_POLL_FALLBACK_VISIBLE_MS = 2_500;
const INCOMING_CALL_POLL_LOG_MIN_GAP_MS = 10_000;
const INCOMING_CALL_POLL_ERROR_LOG_MIN_GAP_MS = 15_000;

/**
 * 발신 취소·hangup 직후 GET/폴링이 `ringing` 스냅샷을 한 번 더 주는 레이스에서
 * 수신 벨이 잠깐 멈췄다가 다시 울리는 현상을 막는다(서버는 이미 종료, 클라만 오래된 행을 본 경우).
 */
// INCOMING_REMOTE_HARD_CLEAR_KEEP_MS moved to incoming-call-state

/** 터미널 직후 목록 GET: 쿨다운·진행 중 단일 비행을 우회해 stale 응답에 묶이지 않게 함 */
type IncomingCallsRefreshOpts = {
  incomingTerminalListSync?: boolean;
  /** dev-safe: 수신 목록 GET 장주기 스로틀 무시 — 거절/수락 실패 후 정합 등 */
  bypassDevSafeIncomingThrottle?: boolean;
  /** WS/broadcast 미수신 fallback — 주기적 HTTP polling tick */
  source?: "poll" | "realtime" | "burst" | "manual";
};

function mapTerminalStatusToConsumedReason(status: string): CallConsumedReason {
  const s = status.trim().toLowerCase();
  if (s === "rejected") return "declined";
  if (s === "missed") return "missed";
  if (s === "ended") return "ended";
  if (s === "cancelled") return "cancelled";
  return "ended";
}

function clearIncomingMissedTimer(
  scheduleRef: { current: Map<string, { deadline: number; timerId: number }> },
  sessionId: string
) {
  const sid = sessionId.trim();
  if (!sid) return;
  const meta = scheduleRef.current.get(sid);
  if (!meta) return;
  window.clearTimeout(meta.timerId);
  scheduleRef.current.delete(sid);
}

export function GlobalCommunityMessengerIncomingCall() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef<string | null>(null);
  pathnameRef.current = pathname ?? null;
  /** `pathname` 전용 burst 보강 — 최초(userId 확정 직후)는 폴링 effect 가 burst 담당 */
  const incomingCallPathBurstPrevRef = useRef<string | null>(null);
  const [userId, setUserId] = useState<string | null>(() =>
    typeof window !== "undefined" ? getCurrentUser()?.id?.trim() || null : null
  );
  const [sessions, setSessions] = useState<CommunityMessengerCallSession[]>([]);
  const sessionsRef = useRef<CommunityMessengerCallSession[]>([]);
  sessionsRef.current = sessions;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [minimizedSessionId, setMinimizedSessionId] = useState<string | null>(null);
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useState(true);
  const incomingCallSoundEnabledRef = useRef(true);
  incomingCallSoundEnabledRef.current = incomingCallSoundEnabled;
  const [incomingCallBannerEnabled, setIncomingCallBannerEnabled] = useState(true);
  /** FCM wake id ref 갱신 → foreground presenter 재계산 */
  const [incomingWakeIdsTick, setIncomingWakeIdsTick] = useState(0);
  const [incomingRealtimeOk, setIncomingRealtimeOk] = useState(false);
  const [incomingVisibilityState, setIncomingVisibilityState] = useState<
    "visible" | "hidden" | "prerender" | "unloaded"
  >(() => readIncomingCallVisibilityState());
  /** 수신 목록 GET 실패(이전 목록은 유지). 세션 거절 등 액션 실패는 별도 */
  const [incomingListError, setIncomingListError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerIdsRef = useRef<number[]>([]);
  const lastRefreshAtRef = useRef(0);
  const lastBurstAtRef = useRef(0);
  const pendingBurstTimerRef = useRef<number | null>(null);
  const realtimeDebounceTimerRef = useRef<number | null>(null);
  const lastIncomingPollLogAtRef = useRef(0);
  const lastIncomingPollErrorLogAtRef = useRef(0);
  /** Broadcast·SW·Realtime INSERT 가 같은 틱에 겹칠 때 수신 GET 을 한 번으로 합치는 꼬리 타이머 */
  const incomingListFastSyncTrailRef = useRef<number | null>(null);
  /** 직전 폴링까지 수신 목록에 있던 ringing 세션 id (directOnly — 전부 ringing) */
  const prevIncomingRingingIdsRef = useRef<Set<string>>(new Set());
  /**
   * 수신자가 거절한 직후 GET 이 세션을 빼도, merge 낙관 로직이 이전 ringing 을 다시 붙이는 것을 막기 위한 표시.
   * (타임스탬프로 TTL 후 정리)
   */
  const dismissedIncomingSessionsAtRef = useRef<Map<string, number>>(new Map());
  /** 원격 취소·종료·hangup 신호를 받은 세션 — stale `ringing` GET/낙관 merge 로 벨이 재시작되지 않게 함 */
  const hardClearedIncomingSessionsAtRef = useRef<Map<string, number>>(new Map());
  /** 거절·수락·차단·메시지거절 등 사용자가 끊은 세션은 부재 톤 제외 */
  const suppressMissedSoundRef = useRef<Set<string>>(new Set());
  /** Realtime health 여부 — silent subscription 감지 포함 */
  const incomingRealtimeOkRef = useRef(false);
  /** 수신 목록에 세션이 처음 잡힌 시각(서버 startedAt 대비) — 발신→수신 체감 지연 */
  const incomingSurfaceLoggedRef = useRef<Set<string>>(new Set());
  /** 시스템 Notification(API) — 세션당 1회 (포그라운드·백그라운드 공통, tag 로 브라우저도 중복 완화) */
  const incomingCallBrowserNotifiedIdsRef = useRef<Set<string>>(new Set());
  /** 동일 callId 수신 이벤트·벨·UI 등록 dedup */
  const activeIncomingCallIdsRef = useRef<Set<string>>(new Set());
  /** 직전 렌더에서 ringing 이었던 세션 — 링 종료 시 SW/로컬 수신 알림 정리 */
  const prevRingingIdsRef = useRef<Set<string>>(new Set());
  /** 홈·목록 등 전역 표면: `incoming_ring_timeout_seconds` 데드라인에 맞춰 `PATCH missed` (전용 `/calls/*` 는 CallClient 와 중복 방지로 여기서 스킵) */
  const ringMissedScheduleRef = useRef<Map<string, { deadline: number; timerId: number }>>(new Map());
  /** 네이티브 자동 `/calls` 진입 — 동일 세션 중복 replace 방지 */
  // 수락 전 자동 `/calls/:id` 이동 금지 — 수신 UI는 배너에서 유지한다.

  const viewerUserIdRef = useRef<string | null>(null);
  viewerUserIdRef.current = userId;
  /** direct 수신 ringing — 백업 폴링을 더 촘촘히 */
  const ringingDirectCalleeRef = useRef(false);
  const uidForRingPoll = userId?.trim() ?? "";
  const ringingDirectCallee =
    Boolean(uidForRingPoll) && sessions.some((s) => isDirectRingingCalleeForSound(s, uidForRingPoll));
  ringingDirectCalleeRef.current = ringingDirectCallee;

  useEffect(() => {
    const syncViewerUserId = () => {
      void getCurrentUserIdForDb().then((value) => {
        setUserId((prev) => {
          if (prev === value) return prev;
          if (!value) {
            setSessions([]);
            setMinimizedSessionId(null);
            setBusyId(null);
            resetAllIncomingCallRuntime();
            activeIncomingCallIdsRef.current.clear();
          }
          return value;
        });
      });
    };
    syncViewerUserId();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, syncViewerUserId);
    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session?.user?.id)) {
        setUserId(null);
        setSessions([]);
        setMinimizedSessionId(null);
        setBusyId(null);
        resetAllIncomingCallRuntime();
        activeIncomingCallIdsRef.current.clear();
        return;
      }
      if (session?.user?.id) syncViewerUserId();
    });
    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, syncViewerUserId);
      authSub?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    incomingSurfaceLoggedRef.current.clear();
    hardClearedIncomingSessionsAtRef.current.clear();
    incomingCallPathBurstPrevRef.current = null;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    return onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.incoming_consumed") return;
      const sid = ev.sessionId?.trim();
      if (!sid) return;
      const hard = hardClearedIncomingSessionsAtRef.current;
      const sealReason = resolveIncomingConsumedBusSealReason(ev.reason);
      suppressMissedSoundRef.current.add(sid);
      clearIncomingMissedTimer(ringMissedScheduleRef, sid);
      activeIncomingCallIdsRef.current.delete(sid);
      if (sealReason) {
        sealIncomingCallTerminal(sid, sealReason, hard, "incoming_consumed_bus");
      } else {
        dismissedIncomingSessionsAtRef.current.set(sid, Date.now());
        dibayIncomingLaneStopRing("incoming_consumed_bus_dismiss", sid);
        markIncomingCallHardClearedSession(hard, sid);
      }
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      setMinimizedSessionId((m) => (m === sid ? null : m));
      setBusyId((b) => (b === `accept:${sid}` || b === `reject:${sid}` ? null : b));
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    return onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      const sid = ev.sessionId?.trim();
      if (!sid) return;
      handleCallTerminalEventRef.current(
        {
          sessionId: sid,
          tmpSessionId: ev.tmpSessionId,
          roomId: ev.roomId,
          initiatorUserId: ev.initiatorUserId,
          callKind: ev.callKind,
          status: ev.status,
        },
        "bus_session_terminal"
      );
    });
  }, [userId]);

  useEffect(() => {
    const now = Date.now();
    for (const s of sessions) {
      if (s.status !== "ringing" || s.sessionMode !== "direct") continue;
      if (incomingSurfaceLoggedRef.current.has(s.id)) continue;
      incomingSurfaceLoggedRef.current.add(s.id);
      const serverStart = s.startedAt ? new Date(s.startedAt).getTime() : NaN;
      const skew = Number.isFinite(serverStart) ? Math.max(0, Math.round(now - serverStart)) : -1;
      if (skew >= 0) {
        messengerMonitorCallFlowPhase(s.id, "flow_call_incoming_surface_skew", skew, {
          media: s.callKind,
          role: "callee",
        });
      }
      logClientPerf("messenger-call.incoming.surface", {
        sessionIdSuffix: s.id.slice(-8),
        media: s.callKind,
        serverSkewMs: skew >= 0 ? skew : null,
      });
      /** Telegram-style — 수신 벨 표시와 동시에 Agora token·SDK warm */
      primeCommunityMessengerCallConnectionPrefetch(s.id);
    }
  }, [sessions]);

  useEffect(() => {
    /** 매장 운영 허브 — 수신 벨이 없으면 기본 타임아웃만 쓰고 API 생략 */
    if (isStoreOwnerAdminPathname()) return;
    void fetchMessengerCallSoundConfig();
  }, []);

  useEffect(() => {
    const syncPreferences = () => {
      setIncomingCallSoundEnabled(isCommunityMessengerIncomingCallSoundEnabled());
      setIncomingCallBannerEnabled(isCommunityMessengerIncomingCallBannerEnabled());
    };
    syncPreferences();
    window.addEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, syncPreferences);
    return () => {
      window.removeEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, syncPreferences);
    };
  }, []);

  const refresh = useCallback(async (force = false, opts?: IncomingCallsRefreshOpts) => {
    const exec = async () => {
      if (isCapacitorNativePlatform()) {
        await hydrateDibayCallConsumedFromNative(hardClearedIncomingSessionsAtRef.current);
      }
      const now = Date.now();
      const bypassCooldown = force || Boolean(opts?.incomingTerminalListSync);
      if (!bypassCooldown && now - lastRefreshAtRef.current < MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS) {
        return;
      }
      if (opts?.incomingTerminalListSync) {
        forgetSingleFlight(INCOMING_CALL_FETCH_FLIGHT_KEY);
      }
      try {
        if (opts?.source === "poll") {
          const gap = now - lastIncomingPollLogAtRef.current;
          if (gap >= INCOMING_CALL_POLL_LOG_MIN_GAP_MS) {
            lastIncomingPollLogAtRef.current = now;
            console.info("[call-flow] incoming_poll_start", {
              pathname: pathnameRef.current ?? null,
              realtimeOk: incomingRealtimeOkRef.current,
              visibility: readIncomingCallVisibilityState(),
              directRinging: ringingDirectCalleeRef.current,
            });
          }
        }
        const res = await runSingleFlight(INCOMING_CALL_FETCH_FLIGHT_KEY, () =>
          fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
            cache: "no-store",
            credentials: "include",
          })
        );
        const json = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          sessions?: CommunityMessengerCallSession[];
        };
        if (res.status === 401 || res.status === 403) {
          setSessions([]);
          setIncomingListError(t("nav_messenger_login_required"));
          return;
        }
        if (res.ok && json.ok) {
          const serverList = json.sessions ?? [];
          if (opts?.source === "poll" && serverList.length > 0) {
            const hard = hardClearedIncomingSessionsAtRef.current;
            const dismissed = dismissedIncomingSessionsAtRef.current;
            for (const s of serverList.slice(0, 3)) {
              const sid = s.id?.trim() ?? "";
              if (!sid) continue;
              const hardAt = hard.get(sid) ?? null;
              const dismissedAt = dismissed.get(sid) ?? null;
              console.info("[call-flow] incoming_merge_candidate_after_terminal", {
                sessionId: sid,
                callId: sid,
                roomId: s.roomId ?? null,
                status: s.status ?? null,
                blockedByHardClear: hardAt != null,
                blockedByDismissed: dismissedAt != null,
                ageMs:
                  hardAt != null
                    ? Math.max(0, now - hardAt)
                    : dismissedAt != null
                      ? Math.max(0, now - dismissedAt)
                      : null,
              });
            }
          }
          if (opts?.source === "poll") {
            if (serverList.length > 0) {
              const prev = prevIncomingRingingIdsRef.current;
              const nextIds = new Set(serverList.map((s) => s.id));
              const hasNew = [...nextIds].some((id) => !prev.has(id));
              prevIncomingRingingIdsRef.current = nextIds;
              console.info("[call-flow] incoming_poll_hit", {
                count: serverList.length,
                hasNew,
              });
              if (hasNew) {
                console.info("[call-flow] incoming_poll_overlay_open", {
                  sessionId: serverList[0]?.id,
                });
              }
            } else {
              prevIncomingRingingIdsRef.current = new Set();
              console.info("[call-flow] incoming_poll_empty");
            }
          }
          setSessions((prev) => {
            const next = filterIncomingSessionsRespectingConsumed(
              mergeIncomingCallSessionsAfterFetch(
                viewerUserIdRef.current,
                serverList,
                prev,
                dismissedIncomingSessionsAtRef.current,
                hardClearedIncomingSessionsAtRef.current
              )
            );
            if (areIncomingCallSessionListsStable(prev, next)) return prev;
            return next;
          });
          setIncomingListError(null);
          return;
        }
        setIncomingListError(
          json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
            ? `${MESSENGER_CALL_USER_MSG.incomingListFailed} (${(json as { error: string }).error})`
            : MESSENGER_CALL_USER_MSG.incomingListFailed
        );
        /* 네트워크/서버 오류 시 기존 수신 목록 유지 — 잠깐의 실패로 UI 가 사라지지 않게 */
      } catch {
        setIncomingListError(`${MESSENGER_CALL_USER_MSG.incomingListFailed} ${MESSENGER_CALL_USER_MSG.networkOrServer}`);
        if (opts?.source === "poll") {
          const now = Date.now();
          const gap = now - lastIncomingPollErrorLogAtRef.current;
          if (gap >= INCOMING_CALL_POLL_ERROR_LOG_MIN_GAP_MS) {
            lastIncomingPollErrorLogAtRef.current = now;
            console.info("[call-flow] incoming_poll_error_limited", {
              pathname: pathnameRef.current ?? null,
            });
          }
        }
      } finally {
        lastRefreshAtRef.current = Date.now();
      }
    };

    if (isDevSafeMode() && !opts?.bypassDevSafeIncomingThrottle) {
      await runDevSafeSingleFlight("cm:incoming-calls:sessions:get", 120_000, exec);
      return;
    }
    await exec();
  }, [t]);

  /** 탭 복귀·포커스: 짧은 2회 확인(레이트 리밋·서버 부하 완화). */
  const queueVisibilityRefreshBurst = useCallback(() => {
    if (
      !shouldRunIncomingCallBackupHttpRequest({
        pathname: pathnameRef.current,
        hasRingingDirectCallee: ringingDirectCalleeRef.current,
        realtimeOk: incomingRealtimeOkRef.current,
      })
    ) {
      return;
    }
    const runBurst = () => {
      lastBurstAtRef.current = Date.now();
      pendingBurstTimerRef.current = null;
      void refresh(true, { source: "burst" });
      for (const timerId of refreshTimerIdsRef.current) {
        window.clearTimeout(timerId);
      }
      refreshTimerIdsRef.current = [
        window.setTimeout(() => {
          void refresh(true, { source: "burst" });
        }, MESSENGER_INCOMING_CALL_VISIBILITY_RETRY_MS),
      ];
    };
    const now = Date.now();
    const gap = now - lastBurstAtRef.current;
    if (gap >= MESSENGER_INCOMING_CALL_BURST_MIN_GAP_MS) {
      runBurst();
      return;
    }
    if (pendingBurstTimerRef.current != null) return;
    pendingBurstTimerRef.current = window.setTimeout(runBurst, MESSENGER_INCOMING_CALL_BURST_MIN_GAP_MS - gap);
  }, [refresh]);

  /** Supabase Realtime: 디바운스 후 1회만(연속 INSERT/UPDATE 시 GET 폭주 방지). */
  const scheduleRealtimeIncomingRefresh = useCallback(() => {
    if (realtimeDebounceTimerRef.current != null) {
      window.clearTimeout(realtimeDebounceTimerRef.current);
    }
    realtimeDebounceTimerRef.current = window.setTimeout(() => {
      realtimeDebounceTimerRef.current = null;
      void refresh(true, { source: "realtime" });
    }, MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS);
  }, [refresh]);

  /** 브로드캐스트·Realtime·signal 공통 — 터미널만 처리, 프리뷰·실세션을 sessionId / tmp / room+발신자+종류로 매칭 후 제거 */
  const handleCallTerminalEvent = useCallback(
    (raw: Record<string, unknown>, sourceTag: string, opts?: { skipSeal?: boolean }) => {
    const sessionId = typeof raw.sessionId === "string" ? raw.sessionId.trim() : "";
    const tmpSessionId = typeof raw.tmpSessionId === "string" ? raw.tmpSessionId.trim() : "";
    const roomId = typeof raw.roomId === "string" ? raw.roomId.trim() : "";
    const initiatorUserId = typeof raw.initiatorUserId === "string" ? raw.initiatorUserId.trim() : "";
    const callKind: CommunityMessengerCallKind | null =
      raw.callKind === "video" || raw.callKind === "voice" ? raw.callKind : null;
    const statusNorm =
      typeof raw.status === "string"
        ? raw.status.trim().toLowerCase()
        : typeof raw.terminalStatus === "string"
          ? String(raw.terminalStatus).trim().toLowerCase()
          : "cancelled";

    if (!isTerminalIncomingCallStatus(statusNorm)) {
      return;
    }

    const terminalSid = sessionId || tmpSessionId || "";
    if (!opts?.skipSeal && terminalSid) {
      sealIncomingCallTerminal(
        terminalSid,
        mapTerminalStatusToConsumedReason(statusNorm),
        hardClearedIncomingSessionsAtRef.current,
        sourceTag
      );
    }

    console.info("[call-flow] terminal_event_received", {
      sessionId: sessionId || null,
      callId: sessionId || null,
      roomId: roomId || null,
      status: statusNorm,
      source: sourceTag,
    });

    const answeredAtRaw =
      typeof raw.answeredAt === "string"
        ? raw.answeredAt.trim()
        : typeof raw.answered_at === "string"
          ? raw.answered_at.trim()
          : null;
    const hangupReasonRaw =
      (typeof raw.reason === "string" && raw.reason.trim()) ||
      (typeof raw.hangupReason === "string" && raw.hangupReason.trim()) ||
      (typeof raw.hangup_reason === "string" && raw.hangup_reason.trim()) ||
      null;
    const endedReasonRaw =
      typeof raw.endedReason === "string"
        ? raw.endedReason.trim()
        : typeof raw.ended_reason === "string"
          ? raw.ended_reason.trim()
          : null;
    const recipientUserIdRaw =
      typeof raw.recipientUserId === "string"
        ? raw.recipientUserId.trim()
        : typeof raw.recipient_user_id === "string"
          ? raw.recipient_user_id.trim()
          : "";

    if (roomId && initiatorUserId && callKind) {
      appendLocalCallChatMessageFromTerminalSession({
        roomId,
        sessionId: sessionId || null,
        tmpSessionId: tmpSessionId || null,
        initiatorUserId,
        recipientUserId: recipientUserIdRaw || undefined,
        callKind,
        status: statusNorm,
        answeredAt: answeredAtRaw,
        hangupReason: hangupReasonRaw,
        endedReason: endedReasonRaw,
      });
    }

    const baseQuery = callIncomingTerminalQueryFromEvent({
      sessionId: sessionId || null,
      tmpSessionId: tmpSessionId || null,
      roomId: roomId || null,
      initiatorUserId: initiatorUserId || null,
      callKind,
      reason: typeof raw.reason === "string" ? raw.reason.trim() : null,
    });
    const q: CallIncomingTerminalQuery = { ...baseQuery, status: statusNorm };

    if (sessionId) {
      dibayCallSealTerminal(sessionId);
      clearNativeCalleeAcceptPending(sessionId);
      suppressMissedSoundRef.current.add(sessionId);
      clearIncomingMissedTimer(ringMissedScheduleRef, sessionId);
      markIncomingCallSurfaceConsumed(
        sessionId,
        statusNorm === "rejected"
          ? "rejected"
          : statusNorm === "missed"
            ? "missed"
            : statusNorm === "cancelled"
              ? "cancelled"
              : "ended",
        sourceTag,
      );
    }
    if (tmpSessionId) {
      markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, tmpSessionId);
      suppressMissedSoundRef.current.add(tmpSessionId);
      clearIncomingMissedTimer(ringMissedScheduleRef, tmpSessionId);
    }
    if (sessionId) {
      activeIncomingCallIdsRef.current.delete(sessionId);
      resetIncomingCallActionGuards(sessionId);
      incomingUiSurfaceLoggedRef.current.delete(sessionId);
      releaseCallActionLock(`terminal_${sourceTag}`);
      void releaseLocalCallSession(sessionId, statusNorm);
      clearDibayCallPendingRoute();
    }
    if (tmpSessionId) activeIncomingCallIdsRef.current.delete(tmpSessionId);

    dispatchRemoteCallSessionTerminalHandoff({
      sessionId: sessionId || undefined,
      tmpSessionId: tmpSessionId || undefined,
      roomId: roomId || undefined,
      initiatorUserId: initiatorUserId || undefined,
      callKind: callKind ?? undefined,
      status: statusNorm,
      sourceTag,
    });
    if (sessionId) {
      setMinimizedSessionId((m) => (m === sessionId ? null : m));
    }

    setSessions((prev) => {
      const { next, removed, matchedBy } = filterRemoveIncomingSessionsMatchingTerminal(prev, q);
      if (removed.length === 0) {
        return prev;
      }

      if (isDebugMessengerEnabled()) {
        console.log("[CALL TERMINAL APPLY]", {
          sessionId: sessionId || undefined,
          tmpSessionId: tmpSessionId || undefined,
          removed: true,
        });
      }

      const uid = viewerUserIdRef.current?.trim() ?? "";
      const overlayBefore =
        uid ? prev.find((s) => isRingingIncomingOverlayCandidate(s, uid)) : undefined;
      const closedOverlay = Boolean(
        uid &&
          overlayBefore &&
          removed.some((r) => r.id === overlayBefore.id)
      );

      for (const r of removed) {
        markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, r.id);
        suppressMissedSoundRef.current.add(r.id);
        clearIncomingMissedTimer(ringMissedScheduleRef, r.id);
      }

      if (statusNorm === "cancelled") {
        if (isDebugMessengerEnabled()) {
          console.info("[cm-call-state] incoming_cancel_received", {
            sessionId: sessionId || undefined,
            sourceTag,
          });
        }
      } else if (statusNorm === "rejected") {
        if (isDebugMessengerEnabled()) {
          console.info("[cm-call-state] incoming_reject_received", {
            sessionId: sessionId || undefined,
            sourceTag,
          });
        }
      }

      const afterDismissed = filterIncomingSessionsRespectingDismissed(next, dismissedIncomingSessionsAtRef.current);
      const afterHard = filterIncomingSessionsRespectingHardClear(
        afterDismissed,
        hardClearedIncomingSessionsAtRef.current
      );

      queueMicrotask(() => {
        setMinimizedSessionId((m) => (m && removed.some((r) => r.id === m) ? null : m));
        if (isDebugMessengerEnabled()) {
          console.info("[cm-call-terminal-received]", {
            sessionId,
            tmpSessionId,
            status: statusNorm,
            matchedBy,
            removedPreviewCount: removed.filter((r) => r.isPreview).length,
            closedOverlay,
            closedCallScreen: removed.length > 0,
            sourceTag,
          });
          for (const r of removed) {
            if (r.isPreview) {
              console.info("[cm-call-preview-removed]", { sessionId: r.id, reason: statusNorm });
            }
          }
        }
      });

      return filterIncomingSessionsRespectingConsumed(afterHard);
    });
  }, []);

  /** 폴링·가시성 핸들러에서 최신 `refresh`/`queueVisibilityRefreshBurst` 를 쓰되, effect 의존 배열은 `[userId]` 만 둔다(길이 불변·React 19 런타임 검증 통과). */
  const refreshRef = useRef(refresh);
  const queueVisibilityRefreshBurstRef = useRef(queueVisibilityRefreshBurst);
  /** Realtime subscribe effect deps 축소용: 콜백은 ref로 최신화 */
  const bumpIncomingListFastSyncRef = useRef<() => void>(() => undefined);
  const handleCallTerminalEventRef = useRef(handleCallTerminalEvent);
  const scheduleRealtimeIncomingRefreshRef = useRef<() => void>(() => undefined);
  const syncIncomingRealtimeHealthRef = useRef<() => void>(() => undefined);
  const syncIncomingRealtimeHealth = useCallback(() => {
    const healthy = isCommunityMessengerRealtimeScopeHealthy(INCOMING_CALL_REALTIME_SCOPE, {
      silentAfterMs: INCOMING_CALL_REALTIME_SILENT_AFTER_MS,
    });
    incomingRealtimeOkRef.current = healthy;
    setIncomingRealtimeOk((prev) => (prev === healthy ? prev : healthy));
  }, []);
  useEffect(() => {
    refreshRef.current = refresh;
    queueVisibilityRefreshBurstRef.current = queueVisibilityRefreshBurst;
    bumpIncomingListFastSyncRef.current = bumpIncomingListFastSync;
    handleCallTerminalEventRef.current = handleCallTerminalEvent;
    scheduleRealtimeIncomingRefreshRef.current = scheduleRealtimeIncomingRefresh;
    syncIncomingRealtimeHealthRef.current = syncIncomingRealtimeHealth;
    syncIncomingRealtimeHealth();
  }, [refresh, queueVisibilityRefreshBurst, syncIncomingRealtimeHealth]);

  /**
   * 수신자가 `/community-messenger/calls/:id` 에 없을 때도 링 타임아웃 후 DB `missed` 보장.
   * 전용 통화 라우트에서는 `CommunityMessengerCallClient` 가 동일 PATCH 를 스케줄 — 여기서는 타이머 생략만 하고 중복 PATCH 는 서버 ringing 가드로 무해.
   */
  useEffect(() => {
    const onDedicatedCallRoute =
      typeof pathname === "string" && pathname.startsWith("/community-messenger/calls/");
    const uid = userId?.trim();
    if (!uid || onDedicatedCallRoute) {
      for (const meta of ringMissedScheduleRef.current.values()) {
        window.clearTimeout(meta.timerId);
      }
      ringMissedScheduleRef.current.clear();
      return;
    }
    const hasRingingCallee = sessions.some(
      (s) =>
        s.sessionMode === "direct" &&
        s.status === "ringing" &&
        !s.isMineInitiator &&
        s.recipientUserId &&
        uid &&
        messengerUserIdsEqual(s.recipientUserId, uid)
    );
    if (hasRingingCallee) {
      if (isStoreOwnerAdminPathname()) {
        runNowOrScheduleOnStoreOwnerAdmin(
          async () => {
            await fetchMessengerCallSoundConfig();
          },
          OWNER_HUB_SECONDARY_AFTER_MS.messengerCallSound,
          "messenger-call-sound"
        );
      } else {
        void fetchMessengerCallSoundConfig();
      }
    }
    const timeoutMs = incomingRingTimeoutMsFromConfig(getMessengerCallSoundConfigCache());
    const now = Date.now();
    const wanted = new Map<string, number>();
    for (const s of sessions) {
      if (s.sessionMode !== "direct" || s.status !== "ringing") continue;
      if (s.isMineInitiator) continue;
      if (!s.recipientUserId || !messengerUserIdsEqual(s.recipientUserId, uid)) continue;
      const startMs = s.startedAt ? new Date(s.startedAt).getTime() : NaN;
      if (!Number.isFinite(startMs)) continue;
      wanted.set(s.id, startMs + timeoutMs);
    }
    for (const [sid, meta] of [...ringMissedScheduleRef.current.entries()]) {
      if (!wanted.has(sid)) {
        window.clearTimeout(meta.timerId);
        ringMissedScheduleRef.current.delete(sid);
      }
    }
    for (const [sid, deadline] of wanted.entries()) {
      const prev = ringMissedScheduleRef.current.get(sid);
      if (prev && prev.deadline === deadline) continue;
      if (prev) window.clearTimeout(prev.timerId);
      const delay = Math.max(0, deadline - now);
      const timerId = window.setTimeout(() => {
        ringMissedScheduleRef.current.delete(sid);
        const sess = sessions.find((x) => x.id === sid);
        void patchCommunityMessengerCallMissedOnce(
          sid,
          sess
            ? {
                sessionStatus: sess.status,
                isInitiator: sess.isMineInitiator,
                endedReason: sess.endedReason ?? null,
              }
            : { sessionStatus: "ringing", isInitiator: false, endedReason: null }
        ).then(() => {
          sealIncomingCallTerminal(sid, "missed", hardClearedIncomingSessionsAtRef.current, "missed_timeout");
          activeIncomingCallIdsRef.current.delete(sid);
          logCallFlow("call_cleanup_done", { sessionId: sid, reason: "missed_timeout" });
          void refresh(true, { incomingTerminalListSync: true });
        });
      }, delay);
      ringMissedScheduleRef.current.set(sid, { deadline, timerId });
    }
  }, [pathname, refresh, sessions, userId]);

  useEffect(() => {
    return () => {
      for (const meta of ringMissedScheduleRef.current.values()) {
        window.clearTimeout(meta.timerId);
      }
      ringMissedScheduleRef.current.clear();
    };
  }, []);

  /**
   * 경로가 바뀔 때마다 폴링 effect 전체를 갈아엎지 않고, 가시성 burst 꼬리만 정리 후 필요 시 1회 burst.
   * (`schedulePoll` 은 매 틱 `pathnameRef` 를 읽어 백업 GET 게이트를 맞춘다.)
   */
  useEffect(() => {
    if (!userId) return;
    const cur = pathname ?? null;
    const prev = incomingCallPathBurstPrevRef.current;
    incomingCallPathBurstPrevRef.current = cur;
    if (prev === null) return;
    if (prev === cur) return;
    for (const timerId of refreshTimerIdsRef.current) {
      window.clearTimeout(timerId);
    }
    refreshTimerIdsRef.current = [];
    if (pendingBurstTimerRef.current != null) {
      window.clearTimeout(pendingBurstTimerRef.current);
      pendingBurstTimerRef.current = null;
    }
    if (
      shouldRunIncomingCallBackupHttpRequest({
        pathname: cur,
        hasRingingDirectCallee: ringingDirectCalleeRef.current,
        realtimeOk: incomingRealtimeOkRef.current,
      })
    ) {
      queueVisibilityRefreshBurstRef.current();
    }
  }, [pathname, userId]);

  /**
   * 타 메신저의 “힌트 → 스냅샷 1회” 패턴: 즉시 `force` 1회 + 짧은 구간 내 추가 힌트는 꼬리 1회로만 합침.
   * (기존 다중 setTimeout 은 postgres INSERT·Broadcast·폴링과 겹쳐 동일 세션에 대한 GET 폭주·429 유발)
   */
  const bumpIncomingListFastSync = useCallback(() => {
    void refreshRef.current(true, { source: "manual" });
    if (incomingListFastSyncTrailRef.current != null) {
      window.clearTimeout(incomingListFastSyncTrailRef.current);
    }
    incomingListFastSyncTrailRef.current = window.setTimeout(() => {
      incomingListFastSyncTrailRef.current = null;
      void refreshRef.current(true, { source: "manual" });
    }, MESSENGER_INCOMING_CALL_WAKE_TRAIL_MS);
  }, []);

  /** Native tombstone hydrate + pending terminal queue drain (mount/resume). */
  const syncNativeIncomingCallState = useCallback(async () => {
    await hydrateDibayCallConsumedFromNative(hardClearedIncomingSessionsAtRef.current);
    const pending = await drainPendingTerminalEventsFromNative();
    for (const item of pending) {
      const rowMatch = sessionsRef.current.find(
        (s) => s.id === item.sessionId || (typeof s.tmpSessionId === "string" && s.tmpSessionId.trim() === item.sessionId)
      );
      handleCallTerminalEventRef.current(
        rowMatch
          ? {
              sessionId: rowMatch.id,
              tmpSessionId: rowMatch.tmpSessionId ?? undefined,
              roomId: rowMatch.roomId,
              initiatorUserId: rowMatch.initiatorUserId,
              callKind: rowMatch.callKind,
              status: item.status,
            }
          : { sessionId: item.sessionId, status: item.status },
        "native_terminal_queue_drain"
      );
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void syncNativeIncomingCallState();
  }, [userId, syncNativeIncomingCallState]);

  useEffect(() => {
    if (!userId || !isCapacitorNativePlatform()) return;
    let disposed = false;
    let removeListener: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (disposed) return;
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void syncNativeIncomingCallState();
        });
        removeListener = () => {
          void handle.remove();
        };
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [userId, syncNativeIncomingCallState]);

  /**
   * 폴링은 `realtime 미정상` 또는 `직통 ringing` 때만 켠다.
   * Realtime 이 정상이고 현재 창이 foreground 이면 같은 데이터에 대해 HTTP 백업 GET 을 중복으로 돌리지 않는다.
   *
   * HTTP GET 백업만 `shouldRunIncomingCallBackupHttpPoll` 로 게이트 — 홈·비채팅 표면에서는
   * 타이머만 긴 tail 로 유지하고 GET 은 생략(Realtime·Broadcast·SW·포커스 burst 는 그대로).
   */
  useEffect(() => {
    if (!userId) return;
    const allowBurst = shouldRunIncomingCallBackupHttpRequest({
      pathname: pathnameRef.current,
      hasRingingDirectCallee: ringingDirectCalleeRef.current,
      realtimeOk: incomingRealtimeOkRef.current,
    });
    if (allowBurst) {
      queueVisibilityRefreshBurstRef.current();
    }
    let pollTimer: number | null = null;
    let cancelled = false;

    const schedulePoll = () => {
      if (cancelled) return;
      const allowNetworkPoll = shouldRunIncomingCallBackupHttpRequest({
        pathname: pathnameRef.current,
        hasRingingDirectCallee: ringingDirectCalleeRef.current,
        realtimeOk: incomingRealtimeOkRef.current,
      });
      const ms = allowNetworkPoll
        ? ringingDirectCalleeRef.current
          ? MESSENGER_INCOMING_CALL_POLL_DURING_RING_MS
          : INCOMING_CALL_POLL_FALLBACK_VISIBLE_MS
        : !isIncomingCallWindowForeground() && ringingDirectCalleeRef.current
          ? MESSENGER_INCOMING_CALL_POLL_WHEN_HIDDEN_MS
          : INCOMING_CALL_BACKUP_HTTP_POLL_SUPPRESSED_TAIL_MS;
      pollTimer = window.setTimeout(() => {
        pollTimer = null;
        if (
          !cancelled &&
          shouldRunIncomingCallBackupHttpRequest({
            pathname: pathnameRef.current,
            hasRingingDirectCallee: ringingDirectCalleeRef.current,
            realtimeOk: incomingRealtimeOkRef.current,
          })
        ) {
          void refreshRef.current(true, { source: "poll" });
        }
        schedulePoll();
      }, ms);
    };
    schedulePoll();

    const onVisible = () => {
      if (document.visibilityState === "visible") queueVisibilityRefreshBurstRef.current();
    };
    const onPageShow = () => {
      queueVisibilityRefreshBurstRef.current();
    };
    const onOnline = () => {
      queueVisibilityRefreshBurstRef.current();
    };
    /** 배포 Chrome: 다른 탭/창에서 돌아올 때 visibility 가 안 오는 경우 보완 */
    const onWindowFocus = () => {
      if (document.visibilityState === "visible") queueVisibilityRefreshBurstRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onWindowFocus);
      /** `pathname`·`userId` 재실행 시에도 가시성 burst 타이머가 남지 않게(전역 unmount 전용 effect 외 보강). */
      for (const timerId of refreshTimerIdsRef.current) {
        window.clearTimeout(timerId);
      }
      refreshTimerIdsRef.current = [];
      if (pendingBurstTimerRef.current != null) {
        window.clearTimeout(pendingBurstTimerRef.current);
        pendingBurstTimerRef.current = null;
      }
    };
  }, [incomingRealtimeOk, ringingDirectCallee, userId]);

  /** 발신 측 Broadcast·푸시(SW) 힌트 — DB Realtime 보다 빠르게 수신 목록 재조회 */
  useEffect(() => {
    if (!userId) return;
    /** 2s 는 장시간 체류 시 불필요한 깨임이 잦음 — 구독 상태 점검만으로는 8s 로 충분 */
    const timerId = window.setInterval(() => {
      syncIncomingRealtimeHealth();
    }, 8000);
    syncIncomingRealtimeHealth();
    return () => {
      window.clearInterval(timerId);
    };
  }, [syncIncomingRealtimeHealth, userId]);

  useEffect(() => {
    if (!userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    let cancelled = false;
    const ch = subscribeCommunityMessengerCallInviteBroadcast(sb, userId, {
      onRing: (payload) => {
        if (cancelled) return;
        const sid = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
        const now = Date.now();
        pruneHardClearedIncomingSessionIds(hardClearedIncomingSessionsAtRef.current);
        const tombstone = buildCallTombstoneContext(hardClearedIncomingSessionsAtRef.current);
        if (sid && !canShowIncoming(sid, tombstone, now)) {
          if (isDibayCallConsumed(sid, now)) {
            logDibayCall("incoming_ignored_consumed", { sessionId: sid, callId: sid, source: "broadcast_ring" });
          }
          return;
        }
        if (sid) {
          cmCallIncomingTraceMergeFromStorage(sid);
          cmCallIncomingTracePatch(sid, { receiver_signal_received_ms: now }, { onlyIfUnset: true });
          logCallLatencyCmInviteRingReceived({
            sessionId: sid,
            source: "broadcast_ring",
            roomId: typeof payload.roomId === "string" ? payload.roomId : undefined,
            callKind: payload.callKind === "video" || payload.callKind === "voice" ? payload.callKind : undefined,
          });
        }
        const optimistic = communityMessengerIncomingSessionFromInviteBroadcast(userId, payload);
        if (optimistic) {
          setSessions((prev) => {
            const next = [optimistic, ...prev.filter((s) => s.id !== optimistic.id)];
            const afterDismissed = filterIncomingSessionsRespectingDismissed(
              next,
              dismissedIncomingSessionsAtRef.current
            );
            return filterIncomingSessionsRespectingConsumed(
              filterIncomingSessionsRespectingHardClear(
                afterDismissed,
                hardClearedIncomingSessionsAtRef.current
              )
            );
          });
        }
        bumpIncomingListFastSync();
      },
      onHangup: (payload) => {
        if (cancelled) return;
        const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
        if (roomId) postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId, at: Date.now() });
        const sid = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
        const tmpFromPayload = typeof payload.tmpSessionId === "string" ? payload.tmpSessionId.trim() : "";
        const lookupKey = sid || tmpFromPayload;
        let merged: Record<string, unknown> = { ...payload };
        if (lookupKey) {
          const row = sessionsRef.current.find(
            (s) => s.id === lookupKey || (typeof s.tmpSessionId === "string" && s.tmpSessionId.trim() === lookupKey)
          );
          if (row) {
            merged = {
              ...merged,
              sessionId: row.id,
              ...(row.tmpSessionId ? { tmpSessionId: row.tmpSessionId } : {}),
              roomId: merged.roomId ?? row.roomId,
              initiatorUserId: merged.initiatorUserId ?? row.initiatorUserId,
              callKind: merged.callKind ?? row.callKind,
            };
          }
        }
        const st =
          typeof merged.status === "string"
            ? merged.status
            : typeof merged.terminalStatus === "string"
              ? merged.terminalStatus
              : "cancelled";
        const terminalQuery = callIncomingTerminalQueryFromEvent({
          sessionId: typeof merged.sessionId === "string" ? merged.sessionId : sid || null,
          tmpSessionId: typeof merged.tmpSessionId === "string" ? merged.tmpSessionId : tmpFromPayload || null,
          roomId: typeof merged.roomId === "string" ? merged.roomId : roomId || null,
          initiatorUserId: typeof merged.initiatorUserId === "string" ? merged.initiatorUserId : null,
          callKind:
            merged.callKind === "video" || merged.callKind === "voice" ? merged.callKind : null,
        });
        const hadLocalMatch = hasIncomingCallSessionMatchingTerminal(
          sessionsRef.current,
          { ...terminalQuery, status: st }
        );
        handleCallTerminalEvent({ ...merged, status: st }, "broadcast_hangup");
        if (!hadLocalMatch) {
          void refreshRef.current(true, { incomingTerminalListSync: true });
        }
      },
    });
    return () => {
      cancelled = true;
      try {
        void sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [userId, bumpIncomingListFastSync, handleCallTerminalEvent]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sw = navigator.serviceWorker;
    if (!sw?.addEventListener) return;
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: unknown; sessionId?: unknown } | null;
      if (!d) return;
      if (d.type === "samarket_messenger_incoming_call_wake") {
        const sid = typeof d.sessionId === "string" ? d.sessionId.trim() : "";
        void (async () => {
          const hard = hardClearedIncomingSessionsAtRef.current;
          const tombstone = buildCallTombstoneContext(hard);
          const uid = viewerUserIdRef.current?.trim();
          const roomId =
            typeof (d as { roomId?: unknown }).roomId === "string" ? (d as { roomId: string }).roomId.trim() : "";
          const callerId =
            typeof (d as { callerId?: unknown }).callerId === "string"
              ? (d as { callerId: string }).callerId.trim()
              : "";
          const callKindRaw =
            typeof (d as { callKind?: unknown }).callKind === "string" ? (d as { callKind: string }).callKind : "";
          const callKind =
            callKindRaw === "video" ? "video" : callKindRaw === "voice" || callKindRaw === "audio" ? "voice" : undefined;

          if (sid) activeIncomingCallIdsRef.current.add(sid);
          if (sid) setIncomingWakeIdsTick((t) => t + 1);
          if (uid && sid) {
            const optimistic = buildForegroundIncomingWakeOptimisticSession(
              uid,
              { sessionId: sid, roomId, callKind, callerId },
              hard
            );
            if (optimistic) {
              writeCallAcceptHydratePeerFromSession(optimistic, "sw_incoming_wake");
              setSessions((prev) => mergeForegroundIncomingWakeSession(prev, optimistic));
            }
          }

          const wake = await resolveIncomingCallWake(sid, tombstone, isCallConsumedIncludingNative);
          if (!wake.proceed) {
            if (wake.reason === "terminal_tombstone") {
              stopIncomingCallRing("sw_wake_tombstone", sid);
            }
            if (sid) {
              activeIncomingCallIdsRef.current.delete(sid);
              setSessions((prev) => prev.filter((s) => s.id !== sid));
            }
            return;
          }
          if (sid) {
            logDibayCall("incoming_received", { sessionId: sid, callId: sid, source: "sw_wake" });
          }
          bumpIncomingListFastSync();
        })();
        return;
      }
      if (d.type === "samarket_messenger_call_canceled_wake" || d.type === "samarket_messenger_call_terminal_wake") {
        const sid = typeof d.sessionId === "string" ? d.sessionId.trim() : "";
        if (sid) {
          const terminalKindRaw =
            typeof (d as { terminalKind?: unknown }).terminalKind === "string"
              ? (d as { terminalKind: string }).terminalKind.trim()
              : "";
          const terminalKind =
            terminalKindRaw === "rejected" || terminalKindRaw === "ended" || terminalKindRaw === "missed"
              ? terminalKindRaw
              : "cancelled";
          const status =
            terminalKind === "rejected"
              ? "rejected"
              : terminalKind === "ended"
                ? "ended"
                : terminalKind === "missed"
                  ? "missed"
                  : "cancelled";
          sealFcmTerminalEvent(
            { action: "terminal", callId: sid, terminalKind, fcmType: `call_${terminalKind}` },
            hardClearedIncomingSessionsAtRef.current,
            d.type === "samarket_messenger_call_terminal_wake" ? "sw_terminal_wake" : "sw_cancel_wake"
          );
          const rowMatch = sessionsRef.current.find(
            (s) => s.id === sid || (typeof s.tmpSessionId === "string" && s.tmpSessionId.trim() === sid)
          );
          handleCallTerminalEvent(
            rowMatch
              ? {
                  sessionId: rowMatch.id,
                  tmpSessionId: rowMatch.tmpSessionId ?? undefined,
                  roomId: rowMatch.roomId,
                  initiatorUserId: rowMatch.initiatorUserId,
                  callKind: rowMatch.callKind,
                  status,
                }
              : { sessionId: sid, status },
            d.type === "samarket_messenger_call_terminal_wake" ? "sw_terminal_wake" : "sw_cancel_wake",
            { skipSeal: true }
          );
        }
        void refreshRef.current(true, { incomingTerminalListSync: true });
      }
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener("message", onMessage);
  }, [bumpIncomingListFastSync, handleCallTerminalEvent]);

  useEffect(() => {
    return installDibayFcmCallBridge({
      onIncomingWake: (detail) => {
        void (async () => {
          const sid = detail.sessionId?.trim() ?? "";
          const hard = hardClearedIncomingSessionsAtRef.current;
          const tombstone = buildCallTombstoneContext(hard);
          const uid = viewerUserIdRef.current?.trim();

          if (sid) activeIncomingCallIdsRef.current.add(sid);
          if (sid) setIncomingWakeIdsTick((t) => t + 1);
          if (uid && sid) {
            const optimistic = buildForegroundIncomingWakeOptimisticSession(uid, detail, hard);
            if (optimistic) {
              writeCallAcceptHydratePeerFromSession(optimistic, "fcm_incoming_wake");
              setSessions((prev) => mergeForegroundIncomingWakeSession(prev, optimistic));
            }
          }

          const wake = await resolveIncomingCallWake(sid, tombstone, isCallConsumedIncludingNative);
          if (!wake.proceed) {
            if (wake.reason === "terminal_tombstone") {
              stopIncomingCallRing("fcm_wake_tombstone", sid);
            }
            if (sid) {
              activeIncomingCallIdsRef.current.delete(sid);
              setSessions((prev) => prev.filter((s) => s.id !== sid));
            }
            return;
          }
          if (sid) {
            logDibayCall("incoming_received", { sessionId: sid, callId: sid, source: "fcm_wake" });
            if (typeof document !== "undefined" && document.visibilityState !== "visible") {
              claimIncomingCallSurface(sid, "native_fullscreen", "fcm_wake_background");
            } else {
              claimIncomingCallSurface(sid, "web_foreground_overlay", "fcm_wake_foreground");
            }
          }
          bumpIncomingListFastSync();
        })();
      },
      onFcmTerminal: ({ callId, terminalKind, bridgeSource }) => {
        const sid = callId.trim();
        if (!sid) return;
        const sourceTag = bridgeSource === "call_canceled" ? "fcm_cancel_wake" : "fcm_terminal_wake";
        sealFcmTerminalEvent(
          { action: "terminal", callId: sid, terminalKind, fcmType: bridgeSource },
          hardClearedIncomingSessionsAtRef.current,
          sourceTag
        );
        const status = fcmTerminalKindToSessionStatus(terminalKind);
        const rowMatch = sessionsRef.current.find(
          (s) => s.id === sid || (typeof s.tmpSessionId === "string" && s.tmpSessionId.trim() === sid)
        );
        handleCallTerminalEvent(
          rowMatch
            ? {
                sessionId: rowMatch.id,
                tmpSessionId: rowMatch.tmpSessionId ?? undefined,
                roomId: rowMatch.roomId,
                initiatorUserId: rowMatch.initiatorUserId,
                callKind: rowMatch.callKind,
                status,
              }
            : { sessionId: sid, status },
          sourceTag,
          { skipSeal: true }
        );
        void refreshRef.current(true, { incomingTerminalListSync: true });
      },
      onLockIncomingUi: ({ sessionId, visible }) => {
        const sid = sessionId.trim();
        if (!sid) return;
        if (visible) {
          releaseIncomingCallSurface(sid, "web_foreground_overlay", "lock_incoming_ui_visible");
          claimIncomingCallSurface(sid, "native_fullscreen", "lock_incoming_ui");
        } else {
          releaseIncomingCallSurface(sid, "native_fullscreen", "lock_incoming_ui_hidden");
        }
        setIncomingWakeIdsTick((t) => t + 1);
      },
    });
  }, [bumpIncomingListFastSync, handleCallTerminalEvent]);

  useEffect(() => {
    if (!userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    incomingRealtimeOkRef.current = false;
    setIncomingRealtimeOk(false);
    let markRealtimeSignal = () => {};
    const sub = acquireIncomingCallRealtimeSubscription({
      sb,
      name: `community-messenger-incoming-call:${userId}`,
      scope: INCOMING_CALL_REALTIME_SCOPE,
      isCancelled: () => cancelled,
      silentAfterMs: INCOMING_CALL_REALTIME_SILENT_AFTER_MS,
      onStatus: (status) => {
        void status;
        syncIncomingRealtimeHealthRef.current();
      },
      /** 원격망에서 WS 재연결 실패 시에도 HTTP 로 수신 목록·종료 상태를 맞춤 */
      onAfterSubscribeFailure: () => {
        void refreshRef.current(true);
      },
      build: (channel) =>
        channel
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_call_sessions",
              filter: `recipient_user_id=eq.${userId}`,
            },
            (payload) => {
              markRealtimeSignal();
              const p = payload as {
                eventType?: string;
                new?: Record<string, unknown> | null;
                old?: Record<string, unknown> | null;
              };
              if (p.eventType === "INSERT" && p.new && typeof p.new.id === "string") {
                const insertSid = String(p.new.id).trim();
                if (insertSid) {
                  cmCallIncomingTraceMergeFromStorage(insertSid);
                  cmCallIncomingTracePatch(
                    insertSid,
                    { receiver_signal_received_ms: Date.now() },
                    { onlyIfUnset: true }
                  );
                }
              }
              if (p.eventType === "UPDATE" && p.new && isTerminalIncomingCallStatus(p.new.status)) {
                const nr = p.new;
                handleCallTerminalEventRef.current(
                  {
                    sessionId: typeof nr.id === "string" ? nr.id : "",
                    roomId: typeof nr.room_id === "string" ? nr.room_id : "",
                    initiatorUserId: typeof nr.initiator_user_id === "string" ? nr.initiator_user_id : "",
                    callKind:
                      nr.call_kind === "video" || nr.call_kind === "voice" ? nr.call_kind : undefined,
                    status: typeof nr.status === "string" ? nr.status : "cancelled",
                  },
                  "realtime_session_row"
                );
              }
              if (p.eventType === "DELETE" && p.old && typeof (p.old as { id?: unknown }).id === "string") {
                handleCallTerminalEventRef.current(
                  {
                    sessionId: String((p.old as { id: string }).id),
                    status: "cancelled",
                  },
                  "realtime_session_delete"
                );
              }
              setSessions((prev) => {
                const merged = applyIncomingCallSessionsRealtimeEvent(prev, userId, {
                  eventType: p.eventType,
                  new: p.new ?? null,
                  old: p.old ?? null,
                });
                /* 거절 직후 stale UPDATE(ring) 이 오면 오버레이가 부활·카운트다운이 이어지는 것을 막음 */
                const afterDismissed = filterIncomingSessionsRespectingDismissed(
                  merged,
                  dismissedIncomingSessionsAtRef.current
                );
                return filterSessionsRespectingTerminalLatch(
                  filterIncomingSessionsRespectingConsumed(
                    filterIncomingSessionsRespectingHardClear(
                      afterDismissed,
                      hardClearedIncomingSessionsAtRef.current
                    )
                  ),
                  buildCallTombstoneContext(hardClearedIncomingSessionsAtRef.current),
                  Date.now(),
                  "realtime"
                );
              });
              const newRow = p.new ?? null;
              const nextStatus = typeof newRow?.status === "string" ? String(newRow.status).trim() : "";
              if (p.eventType === "UPDATE" && nextStatus.length > 0 && nextStatus !== "ringing") {
                const sid = typeof newRow?.id === "string" ? newRow.id.trim() : "";
                if (sid) {
                  suppressMissedSoundRef.current.add(sid);
                  activeIncomingCallIdsRef.current.delete(sid);
                  const hard = hardClearedIncomingSessionsAtRef.current;
                  if (nextStatus === "active") {
                    sealIncomingCallTerminal(sid, "accepted", hard, "realtime_update_active");
                  } else if (isTerminalIncomingCallStatus(nextStatus)) {
                    sealIncomingCallTerminal(
                      sid,
                      mapTerminalStatusToConsumedReason(nextStatus),
                      hard,
                      "realtime_update_terminal"
                    );
                  } else {
                    markIncomingCallHardClearedSession(hard, sid);
                    dibayIncomingLaneStopRing("realtime_left_ringing", sid);
                  }
                }
              }
              const terminal = isTerminalIncomingCallStatus(newRow?.status) || p.eventType === "DELETE";
              const leftRinging =
                p.eventType === "UPDATE" && nextStatus.length > 0 && nextStatus !== "ringing";
              if (terminal) {
                const sid =
                  typeof newRow?.id === "string"
                    ? newRow.id
                    : typeof (p.old as Record<string, unknown> | null)?.id === "string"
                      ? String((p.old as Record<string, unknown>).id)
                      : "";
                if (sid) {
                  const hard = hardClearedIncomingSessionsAtRef.current;
                  if (p.eventType === "DELETE") {
                    sealIncomingCallTerminal(sid, "cancelled", hard, "realtime_terminal");
                  } else if (!leftRinging && isTerminalIncomingCallStatus(nextStatus)) {
                    sealIncomingCallTerminal(
                      sid,
                      mapTerminalStatusToConsumedReason(nextStatus),
                      hard,
                      "realtime_terminal"
                    );
                  }
                  suppressMissedSoundRef.current.add(sid);
                  activeIncomingCallIdsRef.current.delete(sid);
                }
                if (realtimeDebounceTimerRef.current != null) {
                  window.clearTimeout(realtimeDebounceTimerRef.current);
                  realtimeDebounceTimerRef.current = null;
                }
                void refreshRef.current(true, { incomingTerminalListSync: true });
              } else if (p.eventType === "INSERT") {
                if (realtimeDebounceTimerRef.current != null) {
                  window.clearTimeout(realtimeDebounceTimerRef.current);
                  realtimeDebounceTimerRef.current = null;
                }
                bumpIncomingListFastSyncRef.current();
              } else if (leftRinging) {
                /* 수락→active 등: 디바운스 대기 없이 목록·오버레이를 즉시 서버와 맞춤 */
                if (realtimeDebounceTimerRef.current != null) {
                  window.clearTimeout(realtimeDebounceTimerRef.current);
                  realtimeDebounceTimerRef.current = null;
                }
                void refreshRef.current(true);
              } else {
                scheduleRealtimeIncomingRefreshRef.current();
              }
            }
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "community_messenger_call_signals",
              filter: `to_user_id=eq.${userId}`,
            },
            (payload) => {
              markRealtimeSignal();
              const row = payload.new as Record<string, unknown> | undefined;
              if (!row) return;
              if (String(row.signal_type ?? "") !== "hangup") return;
              const sid = row.session_id == null ? "" : String(row.session_id).trim();
              if (!sid) return;
              const rowMatch = sessionsRef.current.find(
                (s) => s.id === sid || (typeof s.tmpSessionId === "string" && s.tmpSessionId.trim() === sid)
              );
              handleCallTerminalEventRef.current(
                rowMatch
                  ? {
                      sessionId: rowMatch.id,
                      tmpSessionId: rowMatch.tmpSessionId ?? undefined,
                      roomId: rowMatch.roomId,
                      initiatorUserId: rowMatch.initiatorUserId,
                      callKind: rowMatch.callKind,
                      status: "cancelled",
                    }
                  : { sessionId: sid, status: "cancelled" },
                "realtime_hangup_signal"
              );
              if (realtimeDebounceTimerRef.current != null) {
                window.clearTimeout(realtimeDebounceTimerRef.current);
                realtimeDebounceTimerRef.current = null;
              }
              void refreshRef.current(true, { incomingTerminalListSync: true });
            }
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_call_session_participants",
              filter: `user_id=eq.${userId}`,
            },
            () => {
              markRealtimeSignal();
              scheduleRealtimeIncomingRefreshRef.current();
            }
          ),
    });
    markRealtimeSignal = sub.markSignal;

    return () => {
      cancelled = true;
      if (realtimeDebounceTimerRef.current != null) {
        window.clearTimeout(realtimeDebounceTimerRef.current);
        realtimeDebounceTimerRef.current = null;
      }
      if (incomingListFastSyncTrailRef.current != null) {
        window.clearTimeout(incomingListFastSyncTrailRef.current);
        incomingListFastSyncTrailRef.current = null;
      }
      sub.stop();
      incomingRealtimeOkRef.current = false;
      setIncomingRealtimeOk(false);
    };
  }, [userId]);

  useEffect(() => {
    return () => {
      for (const timerId of refreshTimerIdsRef.current) {
        window.clearTimeout(timerId);
      }
      refreshTimerIdsRef.current = [];
      if (pendingBurstTimerRef.current != null) {
        window.clearTimeout(pendingBurstTimerRef.current);
        pendingBurstTimerRef.current = null;
      }
      if (realtimeDebounceTimerRef.current != null) {
        window.clearTimeout(realtimeDebounceTimerRef.current);
        realtimeDebounceTimerRef.current = null;
      }
      if (incomingListFastSyncTrailRef.current != null) {
        window.clearTimeout(incomingListFastSyncTrailRef.current);
        incomingListFastSyncTrailRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const nextIds = new Set<string>();
    for (const session of sessions) {
      nextIds.add(session.id);
      if (!seenIdsRef.current.has(session.id) && incomingCallSoundEnabled && !incomingCallBannerEnabled) {
        playNotificationSound();
      }
    }
    seenIdsRef.current = nextIds;
  }, [incomingCallBannerEnabled, incomingCallSoundEnabled, sessions]);

  useEffect(() => {
    if (!minimizedSessionId) return;
    if (!sessions.some((session) => session.id === minimizedSessionId)) {
      setMinimizedSessionId(null);
    }
  }, [minimizedSessionId, sessions]);

  useEffect(() => {
    if (!userId) return;

    for (const session of sessions) {
      if (session.status !== "ringing") continue;
      if (session.isMineInitiator) continue;
      if (!session.recipientUserId || !messengerUserIdsEqual(session.recipientUserId, userId)) continue;
      if (incomingCallBrowserNotifiedIdsRef.current.has(session.id)) continue;
      if (isCapacitorNativePlatform()) continue;
      if (
        !shouldUseIncomingCallBrowserNotification({
          visibilityState: incomingVisibilityState,
          currentPathname: pathname,
          isAppForeground: incomingVisibilityState === "visible",
          sessionStatus: session.status,
          callKind: session.callKind,
        })
      ) {
        continue;
      }
      const suppressed = getMessengerCallSoundConfigCache()?.suppress_incoming_local_notifications === true;
      const shown = showIncomingCallBrowserNotification({
        sessionId: session.id,
        peerLabel: session.peerLabel,
        callKind: session.callKind,
        suppressed,
      });
      /* 거부·관리자 억제 시에만 세션당 1회로 고정; granted 전(default)에는 이후 권한 허용 시 재시도 */
      if (shown || suppressed || (typeof Notification !== "undefined" && Notification.permission === "denied")) {
        incomingCallBrowserNotifiedIdsRef.current.add(session.id);
      }
    }

    for (const id of [...incomingCallBrowserNotifiedIdsRef.current]) {
      const stillRinging = sessions.some((s) => s.id === id && s.status === "ringing");
      if (!stillRinging) incomingCallBrowserNotifiedIdsRef.current.delete(id);
    }
  }, [incomingVisibilityState, pathname, sessions, userId]);

  /** ringing 이 목록에서 사라졌을 때(타임아웃 부재 등) 부재 사운드 — 사용자가 거절/수락한 경우는 제외 */
  useEffect(() => {
    const nowRinging = new Set(sessions.filter((s) => s.status === "ringing").map((s) => s.id));
    for (const id of prevRingingIdsRef.current) {
      if (!nowRinging.has(id)) {
        requestCloseMessengerCallNotifications(id);
      }
    }
    prevRingingIdsRef.current = nowRinging;
  }, [sessions]);

  useEffect(() => {
    const syncVisibility = () => setIncomingVisibilityState(readIncomingCallVisibilityState());
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("focus", syncVisibility);
    window.addEventListener("blur", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("focus", syncVisibility);
      window.removeEventListener("blur", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const current = new Set(sessions.filter((s) => s.status === "ringing").map((s) => s.id));
    const prev = prevIncomingRingingIdsRef.current;
    for (const id of prev) {
      if (!current.has(id)) {
        if (suppressMissedSoundRef.current.has(id)) {
          suppressMissedSoundRef.current.delete(id);
        } else if (incomingCallSoundEnabled) {
          void playCommunityMessengerCallSignalSound("missed", { dedupeSessionId: id });
        }
      }
    }
    prevIncomingRingingIdsRef.current = current;
  }, [sessions, userId, incomingCallSoundEnabled]);

  /** 오버레이는 `ringing` 직통 수신만 — `active` 만 다른 라이브 통화로 본다 (stale `ringing` 이 연속 수신·벨을 막지 않게). */
  const viewerLiveSessionId = useMemo(() => {
    const uid = userId?.trim();
    if (!uid) return null;
    const tombstone = buildCallTombstoneContext(hardClearedIncomingSessionsAtRef.current);
    for (const s of sessions) {
      if (s.sessionMode !== "direct") continue;
      if (s.status !== "active") continue;
      if (s.endedAt || s.cancelledAt) continue;
      if (isCallTerminal(s.id, tombstone)) continue;
      const isParty =
        messengerUserIdsEqual(s.initiatorUserId, uid) ||
        (s.recipientUserId != null && messengerUserIdsEqual(s.recipientUserId, uid));
      if (isParty) return s.id;
    }
    return null;
  }, [sessions, userId]);

  const clientLiveCallSessionId = useSyncExternalStore(
    subscribeActiveCallSession,
    getActiveCallSessionCallIdForIncomingBusy,
    () => null,
  );
  const effectiveViewerLiveSessionId = viewerLiveSessionId ?? clientLiveCallSessionId;

  const inMessengerRoom =
    typeof pathname === "string" && pathname.startsWith("/community-messenger/rooms/");

  const { isLeader: incomingTabLeaderRaw } = useIncomingCallTabLeader(Boolean(userId));
  const incomingTabLeader = isCapacitorNativePlatform() ? true : incomingTabLeaderRaw;

  const foregroundWakeSessionIds = useMemo(
    () => new Set(activeIncomingCallIdsRef.current),
    [sessions, incomingWakeIdsTick]
  );

  const foregroundPresentation = useMemo(
    () =>
      resolveForegroundIncomingPresentation({
        sessions,
        pathname,
        viewerUserId: userId,
        viewerLiveSessionId: effectiveViewerLiveSessionId,
        tombstone: buildCallTombstoneContext(hardClearedIncomingSessionsAtRef.current),
        incomingTabLeader,
        visibilityState: incomingVisibilityState,
        isAppForeground: incomingVisibilityState === "visible",
        foregroundWakeSessionIds,
      }),
    [
      foregroundWakeSessionIds,
      incomingTabLeader,
      incomingVisibilityState,
      pathname,
      sessions,
      userId,
      effectiveViewerLiveSessionId,
    ]
  );

  const bannerSession =
    foregroundPresentation.shouldRender && incomingCallBannerEnabled
      ? foregroundPresentation.session
      : null;
  const bannerSessionId = bannerSession?.id ?? null;
  const nativeIncomingSession = bannerSession;
  const incomingUiSurfaceLoggedRef = useRef<Set<string>>(new Set());

  /** 수신 오버레이·알림 딥링크 진입 시 CallClient 첫 페인트용 시드 */
  useLayoutEffect(() => {
    if (!bannerSession) return;
    primeCommunityMessengerCallNavigationSeed(bannerSession.id, bannerSession);
  }, [bannerSession]);

  useLayoutEffect(() => {
    if (!bannerSessionId || !bannerSession) return;
    const hasMinimal =
      Boolean(bannerSession.peerUserId?.trim()) &&
      (bannerSession.callKind === "voice" || bannerSession.callKind === "video") &&
      Boolean(bannerSession.id?.trim());
    if (!hasMinimal) return;
    if (incomingUiSurfaceLoggedRef.current.has(bannerSessionId)) return;
    incomingUiSurfaceLoggedRef.current.add(bannerSessionId);
    cmCallIncomingTraceMergeFromStorage(bannerSessionId);
    cmCallIncomingTracePatch(bannerSessionId, { receiver_incoming_ui_open_ms: Date.now() });
    cmCallIncomingTraceRegisterRingingRoom(bannerSessionId, bannerSession.roomId);
    cmCallFlow("incoming_received", { sessionId: bannerSessionId });
    logDibayCall("incoming_render", { sessionId: bannerSessionId, surface: "top-banner" });
    cmCallIncomingTraceLogTable(bannerSessionId);
  }, [bannerSession, bannerSessionId]);
  useEffect(() => {
    if (!bannerSession?.roomId) return;
    const rid = bannerSession.roomId.trim();
    return () => {
      cmCallIncomingTraceClearRingingRoom(rid);
    };
  }, [bannerSession?.id, bannerSession?.roomId]);
  const _bridgeStatus = getCommunityMessengerIncomingCallBridgeStatus();

  /** 배너 UI 끄기와 무관하게, 직통 수신 ringing 이면 벨은 울려야 함 */
  const directRingingCalleeSession = useMemo(() => {
    if (!userId) return null;
    for (const s of sessions) {
      if (!isDirectRingingCalleeForSound(s, userId)) continue;
      return s;
    }
    return null;
  }, [sessions, userId]);

  const incomingPresenterDecisionLogKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const payload = buildIncomingPresenterDecisionPayload({
      pathname,
      userId,
      incomingTabLeader,
      incomingTabLeaderRaw,
      incomingVisibilityState,
      isCapacitorNative: isCapacitorNativePlatform(),
      sessions,
      viewerLiveSessionId: effectiveViewerLiveSessionId,
      firstRingingCalleeSession:
        foregroundPresentation.selectedRingingSessionId != null
          ? sessions.find((s) => s.id === foregroundPresentation.selectedRingingSessionId) ??
            foregroundPresentation.session
          : null,
      directRingingCalleeSession,
      visibleSession: bannerSession,
      incomingSurface: foregroundPresentation.shouldRender ? "top-banner" : null,
      renderIncomingBanner: foregroundPresentation.shouldRender,
      hardClearedAt: hardClearedIncomingSessionsAtRef.current,
    });
    const hasRinging = payload.ringingSessionIds.length > 0;
    const onCallRoute =
      typeof pathname === "string" && pathname.startsWith("/community-messenger/calls/");
    if (!hasRinging && !onCallRoute) return;

    const logKey = JSON.stringify({
      callId: payload.callId,
      pathname: payload.pathname,
      visibleSessionId: payload.visibleSessionId,
      renderIncomingBanner: payload.renderIncomingBanner,
      incomingSurface: payload.incomingSurface,
      reason: payload.reason,
      ringingSessionIds: payload.ringingSessionIds,
    });
    if (incomingPresenterDecisionLogKeyRef.current === logKey) return;
    incomingPresenterDecisionLogKeyRef.current = logKey;
    logIncomingPresenterDecision(payload);
  }, [
    bannerSession,
    directRingingCalleeSession,
    foregroundPresentation.reason,
    foregroundPresentation.selectedRingingSessionId,
    foregroundPresentation.shouldRender,
    incomingTabLeader,
    incomingTabLeaderRaw,
    incomingVisibilityState,
    pathname,
    sessions,
    userId,
    viewerLiveSessionId,
  ]);

  useEffect(() => {
    if (!bannerSessionId) return;
    return () => {
      releaseIncomingCallSurface(bannerSessionId, "web_foreground_overlay", "banner_unmount");
    };
  }, [bannerSessionId]);

  useEffect(() => {
    if (!incomingTabLeader || !incomingCallSoundEnabled) {
      syncIncomingCallRing(null);
      return;
    }
    const s = directRingingCalleeSession;
    if (!s || s.status !== "ringing") {
      syncIncomingCallRing(null);
      return;
    }
    const sid = s.id.trim();
    if (!canShowIncoming(sid, buildCallTombstoneContext(hardClearedIncomingSessionsAtRef.current))) {
      syncIncomingCallRing(null);
      return;
    }
    if (!activeIncomingCallIdsRef.current.has(sid)) {
      activeIncomingCallIdsRef.current.add(sid);
      setIncomingWakeIdsTick((t) => t + 1);
      logCallFlow("call_incoming_received", { sessionId: sid, source: "direct_ringing", callKind: s.callKind });
      logDibayCall("incoming_received", { sessionId: sid, callId: sid, source: "direct_ringing" });
    } else {
      logCallFlow("call_incoming_deduped", { sessionId: sid, source: "direct_ringing_ring" });
    }
    syncIncomingCallRing({
      sessionId: sid,
      callKind: s.callKind,
      hardClearedAt: hardClearedIncomingSessionsAtRef.current,
      source: "direct_ringing",
    });
  }, [
    directRingingCalleeSession?.id,
    directRingingCalleeSession?.status,
    directRingingCalleeSession?.callKind,
    incomingCallSoundEnabled,
    incomingTabLeader,
  ]);

  useEffect(() => {
    const uid = userId?.trim();
    if (!uid) return;
    const ringingIds = new Set(
      sessions.filter((item) => isDirectRingingCalleeForSound(item, uid)).map((item) => item.id)
    );
    for (const id of [...activeIncomingCallIdsRef.current]) {
      if (!ringingIds.has(id)) {
        const row = sessions.find((item) => item.id === id);
        if (!row) continue;
        activeIncomingCallIdsRef.current.delete(id);
      }
    }
  }, [sessions, userId]);

  useEffect(() => {
    if (typeof pathname !== "string" || !pathname.startsWith("/community-messenger/calls/")) return;
    setBusyId(null);
  }, [pathname]);

  useEffect(() => {
    const uid = userId?.trim();
    if (!uid || !effectiveViewerLiveSessionId) return;
    const hard = hardClearedIncomingSessionsAtRef.current;
    const tombstone = buildCallTombstoneContext(hard);
    const autoRejectIds: string[] = [];
    for (const s of sessions) {
      if (s.status !== "ringing") continue;
      if (s.id === effectiveViewerLiveSessionId) continue;
      if (activeIncomingCallIdsRef.current.has(s.id)) continue;
      if (!isRingingIncomingOverlayCandidate(s, uid)) continue;
      const busy = evaluateIncomingCallBusyPolicy({
        incoming: s,
        otherLiveSessionId: resolveOverlayBusyLiveSessionId({
          viewerLiveSessionId: effectiveViewerLiveSessionId,
          pathname,
          incomingSessionId: s.id,
        }),
      });
      if (!busy.shouldAutoReject) continue;
      const sid = s.id.trim();
      if (!sid || !canShowIncoming(sid, tombstone)) continue;
      autoRejectIds.push(sid);
    }
    if (autoRejectIds.length === 0) return;

    const rejected = new Set(autoRejectIds);
    for (const sid of autoRejectIds) {
      const s = sessions.find((item) => item.id === sid);
      if (!s) continue;
      sealIncomingCallTerminal(sid, "declined", hard, "busy_auto_reject");
      suppressMissedSoundRef.current.add(sid);
      dismissAllIncomingCallNotificationsFireAndForget(sid);
      activeIncomingCallIdsRef.current.delete(sid);
      void runIncomingCallReject({ sessionId: sid, source: "incoming_overlay_reject" }).then(() =>
        refresh(true, { incomingTerminalListSync: true })
      );
    }
    setSessions((prev) => prev.filter((item) => !rejected.has(item.id)));
  }, [effectiveViewerLiveSessionId, pathname, refresh, sessions, userId]);

  useEffect(() => {
    syncCommunityMessengerNativeIncomingCall(nativeIncomingSession);
    return () => {
      if (nativeIncomingSession) {
        syncCommunityMessengerNativeIncomingCall(null);
      }
    };
  }, [nativeIncomingSession]);

  const rejectCall = useCallback(async (sessionId: string) => {
    logCallFlow("call_reject_pressed", { sessionId });
    if (busyId === `reject:${sessionId}` || busyId === `accept:${sessionId}`) return;

    logCallFlow("call_cleanup_start", { sessionId, reason: "reject" });
    const hard = hardClearedIncomingSessionsAtRef.current;
    sealIncomingCallTerminal(sessionId, "declined", hard, "reject_pressed");
    suppressMissedSoundRef.current.add(sessionId);
    dismissAllIncomingCallNotificationsFireAndForget(sessionId);
    activeIncomingCallIdsRef.current.delete(sessionId);
    const session = sessions.find((item) => item.id === sessionId) ?? null;
    setSessions((prev) => prev.filter((item) => item.id !== sessionId));
    setBusyId(`reject:${sessionId}`);
    dispatchRemoteCallSessionTerminalHandoff({
      sessionId,
      roomId: session?.roomId ?? undefined,
      initiatorUserId: session?.initiatorUserId ?? undefined,
      callKind: session?.callKind ?? undefined,
      status: "rejected",
      sourceTag: "reject_pressed",
    });
    if (session?.sessionMode === "direct") {
      appendLocalCallChatMessageFromTerminalSession({
        roomId: session.roomId,
        sessionId: session.id,
        tmpSessionId: undefined,
        initiatorUserId: session.initiatorUserId,
        recipientUserId: session.recipientUserId ?? undefined,
        callKind: session.callKind,
        status: "rejected",
        answeredAt: session.answeredAt ?? null,
        hangupReason: "reject",
        endedReason: session.endedReason ?? null,
      });
    }
    try {
      if (session?.peerUserId?.trim()) {
        /** PATCH·DB 반영보다 먼저 — 발신 탭이 `cm_invite_terminal` 로 즉시 종료 */
        void notifyCommunityMessengerCallInviteHangupBestEffort(session.peerUserId.trim(), sessionId, {
          roomId: session.roomId,
          initiatorUserId: session.initiatorUserId,
          callKind: session.callKind,
          terminalStatus: "rejected",
        });
      }
      if (session?.peerUserId) {
        void postCommunityMessengerCallHangupSignal({
          sessionId,
          toUserId: session.peerUserId,
          reason: "reject",
        }).catch(() => {});
      }
      const patchResult = await runIncomingCallReject({ sessionId, source: "incoming_banner_reject" });
      if (!patchResult.ok) {
        showMessengerSnackbar(MESSENGER_CALL_USER_MSG.sessionRejectFailed, { variant: "error" });
        return;
      }
      logCallFlow("call_reject_sent", { sessionId });
      setMinimizedSessionId((prev) => (prev === sessionId ? null : prev));
      void refresh(true, { incomingTerminalListSync: true, bypassDevSafeIncomingThrottle: true });
    } finally {
      setBusyId(null);
      logCallFlow("call_cleanup_done", { sessionId, reason: "reject" });
    }
  }, [busyId, refresh, sessions]);

  const blockIncomingCall = useCallback(
    async (session: CommunityMessengerCallSession) => {
      const peerUserId = session.peerUserId?.trim();
      if (!peerUserId || busyId) return;
      await rejectCall(session.id);
      await fetch("/api/community-messenger/relations/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: peerUserId,
          roomId: session.roomId,
          blockSource: "incoming_call",
        }),
      });
    },
    [busyId, rejectCall]
  );

  const acceptCall = useCallback(
    (session: CommunityMessengerCallSession) => {
      logCallFlow("call_accept_pressed", { sessionId: session.id });
      if (busyId === `accept:${session.id}` || busyId === `reject:${session.id}`) return;

      rememberCallNavigationReturnPath();
      unlockCommunityMessengerCallPlaybackFromUserGesture();

      if (session.sessionMode === "group") {
        setBusyId(`accept:${session.id}`);
        const groupUrl = `/community-messenger/rooms/${encodeURIComponent(session.roomId)}?callAction=accept&sessionId=${encodeURIComponent(session.id)}`;
        void (async () => {
          try {
            const result = await acceptIncomingCallOnce({
              session,
              router,
              source: "incoming_banner_accept",
              hrefOverride: groupUrl,
              markNativeAcceptPending: false,
            });
            if (!result.ok) {
              if (result.reason === "permission_denied") {
                showMessengerSnackbar(t(getCallMediaPermissionBlockedMessageKey(session.callKind)), { variant: "error" });
              } else {
                await refresh(true, { bypassDevSafeIncomingThrottle: true });
                showMessengerSnackbar(MESSENGER_CALL_USER_MSG.sessionActionFailed, { variant: "error" });
              }
              return;
            }
            logCallFlow("call_accept_sent", { sessionId: session.id, mode: "group" });
            cmCallFlow("incoming_accepted", { sessionId: session.id });
            dismissIncomingPresenterAfterAccept({
              sessionId: session.id,
              dismissedAt: dismissedIncomingSessionsAtRef.current,
              hardClearedAt: hardClearedIncomingSessionsAtRef.current,
              activeIncomingCallIds: activeIncomingCallIdsRef.current,
              suppressMissedSound: suppressMissedSoundRef.current,
              ringStopSource: "group_accept",
              removeSessionFromIncomingList: (sid) =>
                setSessions((prev) => prev.filter((item) => item.id !== sid)),
            });
            logCallFlow("call_navigate_to_call_screen", { sessionId: session.id, source: "global_group_accept" });
            void refresh(true, { bypassDevSafeIncomingThrottle: true });
          } finally {
            setBusyId(null);
          }
        })();
        return;
      }

      /**
       * 1:1 — gateway PATCH 1회 후 영상은 ActiveCallHost in-place, 음성은 PATCH 완료 라우트만.
       */
      setBusyId(`accept:${session.id}`);
      void (async () => {
        try {
          const isVideoDirect = session.sessionMode === "direct" && session.callKind === "video";
          const result = await acceptIncomingCallOnce({
            session,
            router,
            source: "incoming_banner_accept",
            skipRouteReplace: isVideoDirect,
            hrefOverride: isVideoDirect ? undefined : buildPostAcceptActiveCallHref(session.id),
            markNativeAcceptPending: false,
          });
          if (!result.ok) {
            if (result.reason === "permission_denied") {
              showMessengerSnackbar(t(getCallMediaPermissionBlockedMessageKey(session.callKind)), { variant: "error" });
            } else if (result.reason !== "already_consumed") {
              await refresh(true, { bypassDevSafeIncomingThrottle: true });
              showMessengerSnackbar(MESSENGER_CALL_USER_MSG.sessionActionFailed, { variant: "error" });
            }
            return;
          }
          logCallFlow("call_accept_sent", { sessionId: session.id, mode: "direct" });
          cmCallFlow("incoming_accepted", { sessionId: session.id });
          dismissIncomingPresenterAfterAccept({
            sessionId: session.id,
            dismissedAt: dismissedIncomingSessionsAtRef.current,
            hardClearedAt: hardClearedIncomingSessionsAtRef.current,
            activeIncomingCallIds: activeIncomingCallIdsRef.current,
            suppressMissedSound: suppressMissedSoundRef.current,
            ringStopSource: "banner_accept",
            removeSessionFromIncomingList: (sid) =>
              setSessions((prev) => prev.filter((item) => item.id !== sid)),
          });
          void refresh(true, { bypassDevSafeIncomingThrottle: true });
        } finally {
          setBusyId(null);
        }
      })();
    },
    [busyId, refresh, router, t]
  );

  const ringTimeoutSeconds =
    getMessengerCallSoundConfigCache()?.incoming_ring_timeout_seconds ??
    DEFAULT_INCOMING_RING_TIMEOUT_SECONDS;

  if (!bannerSession) {
    if (incomingListError) {
      return (
        <div
          className="pointer-events-auto fixed inset-x-0 bottom-[max(8px,var(--safe-bottom))] z-[61] px-3"
          role="alert"
        >
          <div className="rounded-ui-rect border border-sam-border bg-sam-ink/95 px-3 py-2.5 sam-text-body-secondary text-white shadow-sam-elevated backdrop-blur-sm">
            <p className="leading-snug">{incomingListError}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-ui-rect bg-white/15 px-3 py-1.5 sam-text-helper font-semibold text-white active:bg-white/25"
                onClick={() => {
                  setIncomingListError((prev) => (prev === null ? prev : null));
                  void refresh(true);
                }}
              >
                {MESSENGER_CALL_USER_MSG.incomingListRetry}
              </button>
              <button
                type="button"
                className="rounded-ui-rect px-3 py-1.5 sam-text-helper font-medium text-white/75 underline-offset-2 active:text-white"
                onClick={() => setIncomingListError((prev) => (prev === null ? prev : null))}
              >
                {t("nav_close")}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <CommunityMessengerIncomingCallUi
      session={bannerSession}
      viewerUserId={userId ?? ""}
      ringTimeoutSeconds={ringTimeoutSeconds}
      busyReject={busyId === `reject:${bannerSession.id}`}
      busyAccept={busyId === `accept:${bannerSession.id}`}
      busyBlock={false}
      onReject={() => void rejectCall(bannerSession.id)}
      onAccept={() => acceptCall(bannerSession)}
      onBlock={() => void blockIncomingCall(bannerSession)}
    />
  );
}

