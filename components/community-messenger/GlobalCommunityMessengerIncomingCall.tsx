"use client";

/**
 * 수신 통화 전용 — 발신 진입점은 `lib/community-messenger/outgoing-call-surfaces.ts` 참고.
 * 폴링·`runSingleFlight` 키: `docs/messenger-realtime-policy.md`
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  playCommunityMessengerCallSignalSound,
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallFeedback,
} from "@/lib/community-messenger/call-feedback-sound";
import {
  fetchMessengerCallSoundConfig,
  getMessengerCallSoundConfigCache,
} from "@/lib/community-messenger/messenger-call-sound-config-client";
import { useCommunityCallSurface } from "@/contexts/CommunityCallSurfaceContext";
import { primeCommunityMessengerDevicePermissionFromUserGesture } from "@/lib/community-messenger/call-permission";
import {
  COMMUNITY_MESSENGER_PREFERENCE_EVENT,
  isCommunityMessengerIncomingCallBannerEnabled,
  isCommunityMessengerIncomingCallSoundEnabled,
} from "@/lib/community-messenger/preferences";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { playNotificationSound } from "@/lib/notifications/play-notification-sound";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { CommunityMessengerIncomingCallOverlay } from "@/components/messenger/call/CallOverlay";
import { IncomingCallBanner } from "@/components/messenger/call/IncomingCallBanner";
import { patchCommunityMessengerCallSession, postCommunityMessengerCallHangupSignal } from "@/lib/call/call-actions";
import { showIncomingCallBrowserNotification } from "@/lib/call/call-notification";
import { requestCloseMessengerCallNotifications } from "@/lib/push/push-manager";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import { applyIncomingCallSessionsRealtimeEvent } from "@/lib/community-messenger/incoming-call-realtime-preview";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  getIncomingCallPollIntervalMs,
  MESSENGER_INCOMING_CALL_BURST_MIN_GAP_MS,
  MESSENGER_INCOMING_CALL_POLL_DURING_RING_MS,
  MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS,
  MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS,
  MESSENGER_INCOMING_CALL_VISIBILITY_RETRY_MS,
  MESSENGER_INCOMING_CALL_WAKE_TRAIL_MS,
} from "@/lib/community-messenger/messenger-latency-config";
import {
  notifyCommunityMessengerCallInviteHangupBestEffort,
  subscribeCommunityMessengerCallInviteBroadcast,
} from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  getCommunityMessengerIncomingCallBridgeStatus,
  syncCommunityMessengerNativeIncomingCall,
} from "@/lib/community-messenger/native-call-receive";
import { messengerMonitorCallFlowPhase } from "@/lib/community-messenger/monitoring/client";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import {
  INCOMING_CALL_BACKUP_HTTP_POLL_SUPPRESSED_TAIL_MS,
  shouldRunIncomingCallBackupHttpPoll,
} from "@/lib/layout/incoming-call-backup-poll-policy";

const INCOMING_CALL_TIER = getPublicDeployTier();
const INCOMING_CALL_FETCH_FLIGHT_KEY = "community-messenger:incoming-calls:directOnly";

/** GET 수신 목록이 Realtime INSERT 보다 빨리(또는 빈 배열로) 돌아올 때 낙관적 세션을 지우지 않도록 합친다. */
const INCOMING_OPTIMISTIC_KEEP_MS = 55_000;
/** 사용자가 거절한 세션을 merge·Realtime 이 다시 살리지 못하게 함 */
const INCOMING_USER_DISMISSED_KEEP_MS = 120_000;
/**
 * 발신 취소·hangup 직후 GET/폴링이 `ringing` 스냅샷을 한 번 더 주는 레이스에서
 * 수신 벨이 잠깐 멈췄다가 다시 울리는 현상을 막는다(서버는 이미 종료, 클라만 오래된 행을 본 경우).
 */
const INCOMING_REMOTE_HARD_CLEAR_KEEP_MS = 120_000;

function pruneDismissedIncomingSessionIds(dismissedAtBySessionId: Map<string, number>) {
  const now = Date.now();
  for (const [id, at] of [...dismissedAtBySessionId.entries()]) {
    if (now - at > INCOMING_USER_DISMISSED_KEEP_MS) dismissedAtBySessionId.delete(id);
  }
}

function isUserDismissedIncomingSession(id: string, dismissedAtBySessionId: Map<string, number>, now: number): boolean {
  const at = dismissedAtBySessionId.get(id);
  return at != null && now - at <= INCOMING_USER_DISMISSED_KEEP_MS;
}

function filterIncomingSessionsRespectingDismissed(
  list: CommunityMessengerCallSession[],
  dismissedAtBySessionId: Map<string, number>
): CommunityMessengerCallSession[] {
  const now = Date.now();
  pruneDismissedIncomingSessionIds(dismissedAtBySessionId);
  return list.filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now));
}

function pruneHardClearedIncomingSessionIds(hardClearedAtBySessionId: Map<string, number>) {
  const now = Date.now();
  for (const [id, at] of [...hardClearedAtBySessionId.entries()]) {
    if (now - at > INCOMING_REMOTE_HARD_CLEAR_KEEP_MS) hardClearedAtBySessionId.delete(id);
  }
}

function isHardClearedIncomingSession(id: string, hardClearedAtBySessionId: Map<string, number>, now: number): boolean {
  const at = hardClearedAtBySessionId.get(id);
  return at != null && now - at <= INCOMING_REMOTE_HARD_CLEAR_KEEP_MS;
}

function filterIncomingSessionsRespectingHardClear(
  list: CommunityMessengerCallSession[],
  hardClearedAtBySessionId: Map<string, number>
): CommunityMessengerCallSession[] {
  const now = Date.now();
  pruneHardClearedIncomingSessionIds(hardClearedAtBySessionId);
  return list.filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now));
}

function markIncomingCallHardClearedSession(hardClearedAtBySessionId: Map<string, number>, sessionId: string) {
  const sid = sessionId.trim();
  if (!sid) return;
  hardClearedAtBySessionId.set(sid, Date.now());
}

function isTerminalCallSessionStatusValue(status: unknown): boolean {
  const s = typeof status === "string" ? status : "";
  return s === "ended" || s === "cancelled" || s === "rejected" || s === "missed";
}

function isIncomingCallWindowForeground(): boolean {
  if (typeof document === "undefined") return true;
  if (document.visibilityState !== "visible" || document.hidden) return false;
  return typeof document.hasFocus === "function" ? document.hasFocus() : true;
}

function shouldRunIncomingCallBackupHttpRequest(args: {
  pathname: string | null;
  hasRingingDirectCallee: boolean;
  realtimeOk: boolean;
}): boolean {
  if (!shouldRunIncomingCallBackupHttpPoll(args.pathname, args.hasRingingDirectCallee)) return false;
  if (!isIncomingCallWindowForeground()) return false;
  if (args.hasRingingDirectCallee) return true;
  return !args.realtimeOk;
}

export function GlobalCommunityMessengerIncomingCall() {
  const { t } = useI18n();
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);
  pathnameRef.current = pathname ?? null;
  /** `pathname` 전용 burst 보강 — 최초(userId 확정 직후)는 폴링 effect 가 burst 담당 */
  const incomingCallPathBurstPrevRef = useRef<string | null>(null);
  const { messengerRoomIdFromPath } = useCommunityCallSurface();
  const [userId, setUserId] = useState<string | null>(() =>
    typeof window !== "undefined" ? getCurrentUser()?.id?.trim() || null : null
  );
  const [sessions, setSessions] = useState<CommunityMessengerCallSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [minimizedSessionId, setMinimizedSessionId] = useState<string | null>(null);
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useState(true);
  const [incomingCallBannerEnabled, setIncomingCallBannerEnabled] = useState(true);
  const [incomingRealtimeOk, setIncomingRealtimeOk] = useState(false);
  /** 수신 목록 GET 실패(이전 목록은 유지). 세션 거절 등 액션 실패는 별도 */
  const [incomingListError, setIncomingListError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerIdsRef = useRef<number[]>([]);
  const lastRefreshAtRef = useRef(0);
  const lastBurstAtRef = useRef(0);
  const pendingBurstTimerRef = useRef<number | null>(null);
  const realtimeDebounceTimerRef = useRef<number | null>(null);
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
  /** Realtime SUBSCRIBED 여부 — 백업 폴링 간격만 바꿈(폴링 완전 생략은 하지 않음) */
  const incomingRealtimeOkRef = useRef(false);
  /** 수신 목록에 세션이 처음 잡힌 시각(서버 startedAt 대비) — 발신→수신 체감 지연 */
  const incomingSurfaceLoggedRef = useRef<Set<string>>(new Set());
  /** 시스템 Notification(API) — 세션당 1회 (포그라운드·백그라운드 공통, tag 로 브라우저도 중복 완화) */
  const incomingCallBrowserNotifiedIdsRef = useRef<Set<string>>(new Set());
  /** 직전 렌더에서 ringing 이었던 세션 — 링 종료 시 SW/로컬 수신 알림 정리 */
  const prevRingingIdsRef = useRef<Set<string>>(new Set());
  const [soundPolicyEpoch, setSoundPolicyEpoch] = useState(0);

  const viewerUserIdRef = useRef<string | null>(null);
  viewerUserIdRef.current = userId;
  /** direct 수신 ringing — 백업 폴링을 더 촘촘히 */
  const ringingDirectCalleeRef = useRef(false);
  const ringingDirectCallee =
    Boolean(userId) &&
    sessions.some(
      (s) =>
        s.status === "ringing" &&
        s.sessionMode === "direct" &&
        !s.isMineInitiator &&
        Boolean(s.recipientUserId && userId && messengerUserIdsEqual(s.recipientUserId, userId))
    );
  ringingDirectCalleeRef.current = ringingDirectCallee;

  useEffect(() => {
    void getCurrentUserIdForDb().then((value) => {
      setUserId(value);
    });
  }, []);

  useEffect(() => {
    incomingSurfaceLoggedRef.current.clear();
    hardClearedIncomingSessionsAtRef.current.clear();
    incomingCallPathBurstPrevRef.current = null;
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
    }
  }, [sessions]);

  useEffect(() => {
    void fetchMessengerCallSoundConfig().then(() => setSoundPolicyEpoch((e) => e + 1));
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

  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshAtRef.current < MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS) {
      return;
    }
    await runSingleFlight(INCOMING_CALL_FETCH_FLIGHT_KEY, async () => {
      try {
        const res = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as {
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
          setSessions((prev) =>
            mergeIncomingCallSessionsAfterFetch(
              viewerUserIdRef.current,
              serverList,
              prev,
              dismissedIncomingSessionsAtRef.current,
              hardClearedIncomingSessionsAtRef.current
            )
          );
          setIncomingListError(null);
          setSessionActionError(null);
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
      } finally {
        lastRefreshAtRef.current = Date.now();
      }
    });
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
      void refresh(true);
      for (const timerId of refreshTimerIdsRef.current) {
        window.clearTimeout(timerId);
      }
      refreshTimerIdsRef.current = [
        window.setTimeout(() => {
          void refresh(true);
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
      void refresh(true);
    }, MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS);
  }, [refresh]);

  /** 폴링·가시성 핸들러에서 최신 `refresh`/`queueVisibilityRefreshBurst` 를 쓰되, effect 의존 배열은 `[userId]` 만 둔다(길이 불변·React 19 런타임 검증 통과). */
  const refreshRef = useRef(refresh);
  const queueVisibilityRefreshBurstRef = useRef(queueVisibilityRefreshBurst);
  useEffect(() => {
    refreshRef.current = refresh;
    queueVisibilityRefreshBurstRef.current = queueVisibilityRefreshBurst;
  }, [refresh, queueVisibilityRefreshBurst]);

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
    void refreshRef.current(true);
    if (incomingListFastSyncTrailRef.current != null) {
      window.clearTimeout(incomingListFastSyncTrailRef.current);
    }
    incomingListFastSyncTrailRef.current = window.setTimeout(() => {
      incomingListFastSyncTrailRef.current = null;
      void refreshRef.current(true);
    }, MESSENGER_INCOMING_CALL_WAKE_TRAIL_MS);
  }, []);

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
          : getIncomingCallPollIntervalMs(INCOMING_CALL_TIER, false)
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
          void refreshRef.current(true);
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
    const sb = getSupabaseClient();
    if (!sb) return;
    let cancelled = false;
    const ch = subscribeCommunityMessengerCallInviteBroadcast(sb, userId, {
      onRing: (payload) => {
        if (cancelled) return;
        const sid = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
        const now = Date.now();
        pruneHardClearedIncomingSessionIds(hardClearedIncomingSessionsAtRef.current);
        if (sid && isHardClearedIncomingSession(sid, hardClearedIncomingSessionsAtRef.current, now)) return;
        bumpIncomingListFastSync();
      },
      onHangup: (payload) => {
        if (cancelled) return;
        const sid = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
        const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
        if (roomId) postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId, at: Date.now() });
        if (sid) {
          markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, sid);
          suppressMissedSoundRef.current.add(sid);
          stopCommunityMessengerCallFeedback();
          setSessions((prev) => prev.filter((s) => s.id !== sid));
        }
        void refreshRef.current(true);
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
  }, [userId, bumpIncomingListFastSync]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sw = navigator.serviceWorker;
    if (!sw?.addEventListener) return;
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: unknown; sessionId?: unknown } | null;
      if (!d) return;
      if (d.type === "samarket_messenger_incoming_call_wake") {
        bumpIncomingListFastSync();
        return;
      }
      if (d.type === "samarket_messenger_call_canceled_wake") {
        const sid = typeof d.sessionId === "string" ? d.sessionId.trim() : "";
        if (sid) {
          markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, sid);
          suppressMissedSoundRef.current.add(sid);
          stopCommunityMessengerCallFeedback();
          setSessions((prev) => prev.filter((s) => s.id !== sid));
        }
        void refreshRef.current(true);
      }
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener("message", onMessage);
  }, [bumpIncomingListFastSync]);

  useEffect(() => {
    if (!userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    incomingRealtimeOkRef.current = false;
    setIncomingRealtimeOk(false);
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-incoming-call:${userId}`,
      scope: "community-messenger-incoming-call",
      isCancelled: () => cancelled,
      onStatus: (status) => {
        const ok = status === "SUBSCRIBED";
        incomingRealtimeOkRef.current = ok;
        setIncomingRealtimeOk(ok);
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
              const p = payload as {
                eventType?: string;
                new?: Record<string, unknown> | null;
                old?: Record<string, unknown> | null;
              };
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
                return filterIncomingSessionsRespectingHardClear(
                  afterDismissed,
                  hardClearedIncomingSessionsAtRef.current
                );
              });
              const newRow = p.new ?? null;
              const nextStatus = typeof newRow?.status === "string" ? String(newRow.status).trim() : "";
              if (p.eventType === "UPDATE" && nextStatus.length > 0 && nextStatus !== "ringing") {
                const sid = typeof newRow?.id === "string" ? newRow.id.trim() : "";
                if (sid) {
                  suppressMissedSoundRef.current.add(sid);
                  markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, sid);
                }
              }
              const terminal = isTerminalCallSessionStatusValue(newRow?.status) || p.eventType === "DELETE";
              if (terminal) {
                const sid =
                  typeof newRow?.id === "string"
                    ? newRow.id
                    : typeof (p.old as Record<string, unknown> | null)?.id === "string"
                      ? String((p.old as Record<string, unknown>).id)
                      : "";
                if (sid) {
                  markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, sid);
                  suppressMissedSoundRef.current.add(sid);
                }
                stopCommunityMessengerCallFeedback();
                if (realtimeDebounceTimerRef.current != null) {
                  window.clearTimeout(realtimeDebounceTimerRef.current);
                  realtimeDebounceTimerRef.current = null;
                }
                void refreshRef.current(true);
              } else if (p.eventType === "INSERT") {
                if (realtimeDebounceTimerRef.current != null) {
                  window.clearTimeout(realtimeDebounceTimerRef.current);
                  realtimeDebounceTimerRef.current = null;
                }
                bumpIncomingListFastSync();
              } else {
                scheduleRealtimeIncomingRefresh();
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
              const row = payload.new as Record<string, unknown> | undefined;
              if (!row) return;
              if (String(row.signal_type ?? "") !== "hangup") return;
              const sid = row.session_id == null ? "" : String(row.session_id).trim();
              if (!sid) return;
              markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, sid);
              suppressMissedSoundRef.current.add(sid);
              stopCommunityMessengerCallFeedback();
              setSessions((prev) => prev.filter((s) => s.id !== sid));
              if (realtimeDebounceTimerRef.current != null) {
                window.clearTimeout(realtimeDebounceTimerRef.current);
                realtimeDebounceTimerRef.current = null;
              }
              void refreshRef.current(true);
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
              scheduleRealtimeIncomingRefresh();
            }
          ),
    });

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
  }, [bumpIncomingListFastSync, scheduleRealtimeIncomingRefresh, userId]);

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
  }, [sessions, userId]);

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

  const visibleSession = incomingCallBannerEnabled ? sessions[0] ?? null : null;
  const visibleSessionId = visibleSession?.id ?? null;
  const visibleSessionStatus = visibleSession?.status ?? null;
  const visibleSessionCallKind = visibleSession?.callKind ?? null;
  const isMinimized = Boolean(visibleSession && minimizedSessionId === visibleSession.id);
  const _bridgeStatus = getCommunityMessengerIncomingCallBridgeStatus();

  useEffect(() => {
    if (visibleSessionStatus !== "ringing") return;
    let cancelled = false;
    let tone: { stop: () => void } | null = null;
    void startCommunityMessengerCallTone("incoming", {
      callKind: visibleSessionCallKind ?? "voice",
    }).then((t) => {
      if (cancelled) {
        t.stop();
        return;
      }
      tone = t;
    });
    return () => {
      cancelled = true;
      tone?.stop();
    };
  }, [visibleSessionId, visibleSessionStatus, visibleSessionCallKind]);

  useEffect(() => {
    syncCommunityMessengerNativeIncomingCall(visibleSession);
    return () => {
      if (visibleSession) syncCommunityMessengerNativeIncomingCall({ ...visibleSession, status: "missed" });
    };
  }, [visibleSession]);

  const rejectCall = useCallback(async (sessionId: string) => {
    suppressMissedSoundRef.current.add(sessionId);
    stopCommunityMessengerCallFeedback();
    const session = sessions.find((item) => item.id === sessionId) ?? null;
    dismissedIncomingSessionsAtRef.current.set(sessionId, Date.now());
    setSessions((prev) => prev.filter((item) => item.id !== sessionId));
    setBusyId(`reject:${sessionId}`);
    try {
      if (session?.peerUserId?.trim()) {
        /** PATCH·DB 반영보다 먼저 — 발신 탭이 `cm_invite_hangup` 으로 즉시 새로고침 */
        void notifyCommunityMessengerCallInviteHangupBestEffort(session.peerUserId.trim(), sessionId, {
          roomId: session.roomId,
        });
      }
      if (session?.peerUserId) {
        try {
          await postCommunityMessengerCallHangupSignal({
            sessionId,
            toUserId: session.peerUserId,
            reason: "reject",
          });
        } catch {
          /* hangup 실패 시에도 PATCH 로 세션 종료 */
        }
      }
      const patchJson = await patchCommunityMessengerCallSession(sessionId, "reject");
      if (!patchJson.ok) {
        const err = typeof patchJson.error === "string" ? patchJson.error : "";
        if (err === "bad_action") {
          markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, sessionId);
          suppressMissedSoundRef.current.add(sessionId);
          setSessionActionError(null);
        } else {
          dismissedIncomingSessionsAtRef.current.delete(sessionId);
          setSessionActionError(MESSENGER_CALL_USER_MSG.sessionRejectFailed);
        }
        await refresh(true);
        return;
      }
      setSessionActionError(null);
      setMinimizedSessionId((prev) => (prev === sessionId ? null : prev));
      await refresh(true);
    } finally {
      setBusyId(null);
    }
  }, [refresh, sessions]);

  const acceptCall = useCallback((session: CommunityMessengerCallSession) => {
    suppressMissedSoundRef.current.add(session.id);
    stopCommunityMessengerCallFeedback();
    setBusyId(`accept:${session.id}`);
    setSessions((prev) => prev.filter((item) => item.id !== session.id));
    const url =
      session.sessionMode === "group"
        ? `/community-messenger/rooms/${encodeURIComponent(session.roomId)}?callAction=accept&sessionId=${encodeURIComponent(session.id)}`
        : `/community-messenger/calls/${encodeURIComponent(session.id)}?action=accept`;
    /*
     * getUserMedia 는 클릭과 같은 동기 스택에서 시작해야 한다.
     * async IIFE 안에서만 prime 을 호출하면 제스처가 끊겨 NotAllowedError·여러 번 수락이 필요해진다.
     * 권한 팝업 대기 시간은 제한하지 않는다(5초 race 제거).
     */
    const primePromise = primeCommunityMessengerDevicePermissionFromUserGesture(session.callKind);
    void (async () => {
      let permissionFailed = false;
      try {
        await primePromise;
      } catch {
        permissionFailed = true;
      } finally {
        setBusyId(null);
        if (permissionFailed) {
          showMessengerSnackbar(
            session.callKind === "video"
              ? "카메라/마이크 권한을 허용하지 못했습니다. 통화 화면에서 「수락」을 한 번 더 눌러 주세요."
              : "마이크 권한을 허용하지 못했습니다. 통화 화면에서 「수락」을 한 번 더 눌러 주세요.",
            { variant: "error" }
          );
        }
        window.location.assign(url);
      }
    })();
  }, []);

  if (visibleSession && isMinimized) {
    return (
      <IncomingCallBanner
        peerLabel={visibleSession.peerLabel}
        callKind={visibleSession.callKind === "video" ? "video" : "voice"}
        busyReject={busyId === `reject:${visibleSession.id}` || busyId === `accept:${visibleSession.id}`}
        busyAccept={busyId === `accept:${visibleSession.id}`}
        onExpand={() => setMinimizedSessionId(null)}
        onReject={() => void rejectCall(visibleSession.id)}
        onAccept={() => void acceptCall(visibleSession)}
      />
    );
  }

  if (visibleSession) {
    const inRoomStrip =
      Boolean(messengerRoomIdFromPath) &&
      visibleSession.sessionMode === "direct" &&
      messengerUserIdsEqual(visibleSession.roomId, messengerRoomIdFromPath ?? "");
    return (
      <CommunityMessengerIncomingCallOverlay
        key={`${visibleSession.id}:${soundPolicyEpoch}`}
        session={visibleSession}
        busyId={busyId}
        sessionActionError={sessionActionError}
        incomingListError={incomingListError}
        onMinimize={() => setMinimizedSessionId(visibleSession.id)}
        onReject={rejectCall}
        onAccept={acceptCall}
        placement={inRoomStrip ? "in-room" : "global"}
        ringTimeoutSeconds={getMessengerCallSoundConfigCache()?.incoming_ring_timeout_seconds ?? 45}
      />
    );
  }

  if (!visibleSession) {
    if (incomingListError) {
      return (
        <div
          className="pointer-events-auto fixed inset-x-0 bottom-[max(8px,env(safe-area-inset-bottom))] z-[61] px-3"
          role="alert"
        >
          <div className="rounded-ui-rect border border-sam-border bg-sam-ink/95 px-3 py-2.5 text-[13px] text-white shadow-lg backdrop-blur-sm">
            <p className="leading-snug">{incomingListError}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-ui-rect bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white active:bg-white/25"
                onClick={() => {
                  setIncomingListError(null);
                  void refresh(true);
                }}
              >
                {MESSENGER_CALL_USER_MSG.incomingListRetry}
              </button>
              <button
                type="button"
                className="rounded-ui-rect px-3 py-1.5 text-[12px] font-medium text-white/75 underline-offset-2 active:text-white"
                onClick={() => setIncomingListError(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }
}

function mergeIncomingCallSessionsAfterFetch(
  viewerUserId: string | null,
  serverList: CommunityMessengerCallSession[],
  previous: CommunityMessengerCallSession[],
  dismissedAtBySessionId: Map<string, number>,
  hardClearedAtBySessionId: Map<string, number>
): CommunityMessengerCallSession[] {
  const now = Date.now();
  pruneDismissedIncomingSessionIds(dismissedAtBySessionId);
  pruneHardClearedIncomingSessionIds(hardClearedAtBySessionId);

  if (!viewerUserId) {
    return serverList
      .filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now))
      .filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now));
  }

  const serverFiltered = serverList
    .filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now))
    .filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now));
  const serverIds = new Set(serverFiltered.map((s) => s.id));
  const previousFiltered = previous
    .filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now))
    .filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now));
  const optimisticExtras = previousFiltered.filter((s) => {
    if (serverIds.has(s.id)) return false;
    if (s.status !== "ringing" || s.sessionMode !== "direct" || s.isMineInitiator) return false;
    if (!messengerUserIdsEqual(s.recipientUserId, viewerUserId)) return false;
    const started = new Date(s.startedAt).getTime();
    if (!Number.isFinite(started) || now - started > INCOMING_OPTIMISTIC_KEEP_MS) return false;
    return true;
  });

  if (optimisticExtras.length === 0) return serverFiltered;

  return [...serverFiltered, ...optimisticExtras].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
