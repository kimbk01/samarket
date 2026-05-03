"use client";

/**
 * 수신 통화 전용 — 발신 진입점은 `lib/community-messenger/outgoing-call-surfaces.ts` 참고.
 * 폴링·`runSingleFlight` 키: `docs/messenger-realtime-policy.md`
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  playCommunityMessengerCallSignalSound,
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallTone,
} from "@/lib/community-messenger/call-feedback-sound";
import {
  fetchMessengerCallSoundConfig,
  getMessengerCallSoundConfigCache,
} from "@/lib/community-messenger/messenger-call-sound-config-client";
import { useCommunityCallSurface } from "@/contexts/CommunityCallSurfaceContext";
import { primeCommunityMessengerDevicePermissionFromUserGesture } from "@/lib/community-messenger/call-permission";
import {
  primeCommunityMessengerCallNavigationSeed,
  rememberCallNavigationReturnPath,
} from "@/lib/community-messenger/call-session-navigation-seed";
import {
  COMMUNITY_MESSENGER_PREFERENCE_EVENT,
  isCommunityMessengerIncomingCallBannerEnabled,
  isCommunityMessengerIncomingCallSoundEnabled,
} from "@/lib/community-messenger/preferences";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { playNotificationSound } from "@/lib/notifications/play-notification-sound";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { isCommunityMessengerRealtimeScopeHealthy } from "@/lib/community-messenger/realtime/community-messenger-realtime-health";
import { CommunityMessengerIncomingCallOverlay } from "@/components/messenger/call/CallOverlay";
import { IncomingCallBanner } from "@/components/messenger/call/IncomingCallBanner";
import { patchCommunityMessengerCallSession, postCommunityMessengerCallHangupSignal } from "@/lib/call/call-actions";
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
import { appendLocalCallChatMessageFromTerminalSession } from "@/lib/community-messenger/call-chat-local-append";
import {
  callIncomingTerminalQueryFromEvent,
  filterRemoveIncomingSessionsMatchingTerminal,
  type CallIncomingTerminalQuery,
  isDirectRingingCalleeForSound,
  isRingingIncomingOverlayCandidate,
  isTerminalIncomingCallStatus,
} from "@/lib/community-messenger/call-incoming-terminal";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { incomingRingTimeoutMsFromConfig } from "@/lib/community-messenger/messenger-call-ring-timeout";
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
const INCOMING_CALL_REALTIME_SCOPE = "community-messenger-incoming-call";
const INCOMING_CALL_REALTIME_SILENT_AFTER_MS = 12_000;

/** GET 수신 목록이 Realtime INSERT 보다 빨리(또는 빈 배열로) 돌아올 때 낙관적 세션을 지우지 않도록 합친다. */
const INCOMING_OPTIMISTIC_KEEP_MS = 55_000;
/** 사용자가 거절한 세션을 merge·Realtime 이 다시 살리지 못하게 함 */
const INCOMING_USER_DISMISSED_KEEP_MS = 120_000;
/**
 * 발신 취소·hangup 직후 GET/폴링이 `ringing` 스냅샷을 한 번 더 주는 레이스에서
 * 수신 벨이 잠깐 멈췄다가 다시 울리는 현상을 막는다(서버는 이미 종료, 클라만 오래된 행을 본 경우).
 */
const INCOMING_REMOTE_HARD_CLEAR_KEEP_MS = 120_000;

/** 터미널 직후 목록 GET: 쿨다운·진행 중 단일 비행을 우회해 stale 응답에 묶이지 않게 함 */
type IncomingCallsRefreshOpts = {
  incomingTerminalListSync?: boolean;
};

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
  /**
   * 수신 통화는 사용자 표면에서 "항상" 보장돼야 하므로
   * Realtime 정상 여부와 무관하게 백업 HTTP 경로를 유지한다.
   * (silent subscription / auth race 시에도 수신 누락 방지)
   */
  if (args.hasRingingDirectCallee) return true;
  void args.realtimeOk;
  return true;
}

export function GlobalCommunityMessengerIncomingCall() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef<string | null>(null);
  pathnameRef.current = pathname ?? null;
  /** `pathname` 전용 burst 보강 — 최초(userId 확정 직후)는 폴링 effect 가 burst 담당 */
  const incomingCallPathBurstPrevRef = useRef<string | null>(null);
  const { messengerRoomIdFromPath } = useCommunityCallSurface();
  const [userId, setUserId] = useState<string | null>(() =>
    typeof window !== "undefined" ? getCurrentUser()?.id?.trim() || null : null
  );
  const [sessions, setSessions] = useState<CommunityMessengerCallSession[]>([]);
  const sessionsRef = useRef<CommunityMessengerCallSession[]>([]);
  sessionsRef.current = sessions;
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
  /** Realtime health 여부 — silent subscription 감지 포함 */
  const incomingRealtimeOkRef = useRef(false);
  /** 수신 목록에 세션이 처음 잡힌 시각(서버 startedAt 대비) — 발신→수신 체감 지연 */
  const incomingSurfaceLoggedRef = useRef<Set<string>>(new Set());
  /** 시스템 Notification(API) — 세션당 1회 (포그라운드·백그라운드 공통, tag 로 브라우저도 중복 완화) */
  const incomingCallBrowserNotifiedIdsRef = useRef<Set<string>>(new Set());
  /** 직전 렌더에서 ringing 이었던 세션 — 링 종료 시 SW/로컬 수신 알림 정리 */
  const prevRingingIdsRef = useRef<Set<string>>(new Set());
  /** 홈·목록 등 전역 표면: `incoming_ring_timeout_seconds` 데드라인에 맞춰 `PATCH missed` (전용 `/calls/*` 는 CallClient 와 중복 방지로 여기서 스킵) */
  const ringMissedScheduleRef = useRef<Map<string, { deadline: number; timerId: number }>>(new Map());

  const viewerUserIdRef = useRef<string | null>(null);
  viewerUserIdRef.current = userId;
  /** direct 수신 ringing — 백업 폴링을 더 촘촘히 */
  const ringingDirectCalleeRef = useRef(false);
  const uidForRingPoll = userId?.trim() ?? "";
  const ringingDirectCallee =
    Boolean(uidForRingPoll) && sessions.some((s) => isDirectRingingCalleeForSound(s, uidForRingPoll));
  ringingDirectCalleeRef.current = ringingDirectCallee;

  useEffect(() => {
    void getCurrentUserIdForDb().then((value) => {
      setUserId((prev) => (prev === value ? prev : value));
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
    const now = Date.now();
    const bypassCooldown = force || Boolean(opts?.incomingTerminalListSync);
    if (!bypassCooldown && now - lastRefreshAtRef.current < MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS) {
      return;
    }
    if (opts?.incomingTerminalListSync) {
      forgetSingleFlight(INCOMING_CALL_FETCH_FLIGHT_KEY);
    }
    try {
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

  /** 브로드캐스트·Realtime·signal 공통 — 터미널만 처리, 프리뷰·실세션을 sessionId / tmp / room+발신자+종류로 매칭 후 제거 */
  const handleCallTerminalEvent = useCallback((raw: Record<string, unknown>, sourceTag: string) => {
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

    setSessions((prev) => {
      const { next, removed, matchedBy } = filterRemoveIncomingSessionsMatchingTerminal(prev, q);
      if (removed.length === 0) {
        return prev;
      }

      console.log("[CALL TERMINAL APPLY]", {
        sessionId: sessionId || undefined,
        tmpSessionId: tmpSessionId || undefined,
        removed: true,
      });

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
        const meta = ringMissedScheduleRef.current.get(r.id);
        if (meta) {
          window.clearTimeout(meta.timerId);
          ringMissedScheduleRef.current.delete(r.id);
        }
      }
      stopCommunityMessengerCallTone();

      if (statusNorm === "cancelled") {
        console.info("[cm-call-state] incoming_cancel_received", {
          sessionId: sessionId || undefined,
          sourceTag,
        });
      } else if (statusNorm === "rejected") {
        console.info("[cm-call-state] incoming_reject_received", {
          sessionId: sessionId || undefined,
          sourceTag,
        });
      }

      const afterDismissed = filterIncomingSessionsRespectingDismissed(next, dismissedIncomingSessionsAtRef.current);
      const afterHard = filterIncomingSessionsRespectingHardClear(
        afterDismissed,
        hardClearedIncomingSessionsAtRef.current
      );

      queueMicrotask(() => {
        setMinimizedSessionId((m) => (m && removed.some((r) => r.id === m) ? null : m));
        postCommunityMessengerBusEvent({
          type: "cm.call.session_terminal",
          sessionId: sessionId || undefined,
          tmpSessionId: tmpSessionId || undefined,
          roomId: roomId || undefined,
          initiatorUserId: initiatorUserId || undefined,
          callKind: callKind ?? undefined,
          status: statusNorm,
          at: Date.now(),
        });
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
      });

      return afterHard;
    });
  }, []);

  /** 폴링·가시성 핸들러에서 최신 `refresh`/`queueVisibilityRefreshBurst` 를 쓰되, effect 의존 배열은 `[userId]` 만 둔다(길이 불변·React 19 런타임 검증 통과). */
  const refreshRef = useRef(refresh);
  const queueVisibilityRefreshBurstRef = useRef(queueVisibilityRefreshBurst);
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
    void fetchMessengerCallSoundConfig();
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
        void patchCommunityMessengerCallSession(
          sid,
          "missed",
          undefined,
          sess
            ? {
                sessionStatus: sess.status,
                isInitiator: sess.isMineInitiator,
                endedReason: sess.endedReason ?? null,
              }
            : { sessionStatus: "ringing", isInitiator: false, endedReason: null }
        ).then(() => {
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
        if (sid && isHardClearedIncomingSession(sid, hardClearedIncomingSessionsAtRef.current, now)) return;
        if (sid) {
          cmCallIncomingTraceMergeFromStorage(sid);
          cmCallIncomingTracePatch(sid, { receiver_signal_received_ms: now }, { onlyIfUnset: true });
        }
        const optimistic = communityMessengerIncomingSessionFromInviteBroadcast(userId, payload);
        if (optimistic) {
          setSessions((prev) => {
            const next = [optimistic, ...prev.filter((s) => s.id !== optimistic.id)];
            const afterDismissed = filterIncomingSessionsRespectingDismissed(
              next,
              dismissedIncomingSessionsAtRef.current
            );
            return filterIncomingSessionsRespectingHardClear(
              afterDismissed,
              hardClearedIncomingSessionsAtRef.current
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
        handleCallTerminalEvent({ ...merged, status: st }, "broadcast_hangup");
        void refreshRef.current(true, { incomingTerminalListSync: true });
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
        bumpIncomingListFastSync();
        return;
      }
      if (d.type === "samarket_messenger_call_canceled_wake") {
        const sid = typeof d.sessionId === "string" ? d.sessionId.trim() : "";
        if (sid) {
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
                  status: "cancelled",
                }
              : { sessionId: sid, status: "cancelled" },
            "sw_cancel_wake"
          );
        }
        void refreshRef.current(true, { incomingTerminalListSync: true });
      }
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener("message", onMessage);
  }, [bumpIncomingListFastSync, handleCallTerminalEvent]);

  useEffect(() => {
    if (!userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    incomingRealtimeOkRef.current = false;
    setIncomingRealtimeOk(false);
    let markRealtimeSignal = () => {};
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-incoming-call:${userId}`,
      scope: INCOMING_CALL_REALTIME_SCOPE,
      isCancelled: () => cancelled,
      silentAfterMs: INCOMING_CALL_REALTIME_SILENT_AFTER_MS,
      onStatus: (status) => {
        void status;
        syncIncomingRealtimeHealth();
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
                handleCallTerminalEvent(
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
                handleCallTerminalEvent(
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
                /* 터미널 전이라도 링 종료면 즉시 벨·WebAudio 정지(취소 후 연결음 잔류 방지) */
                stopCommunityMessengerCallTone();
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
                  markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, sid);
                  suppressMissedSoundRef.current.add(sid);
                }
                stopCommunityMessengerCallTone();
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
                bumpIncomingListFastSync();
              } else if (leftRinging) {
                /* 수락→active 등: 디바운스 대기 없이 목록·오버레이를 즉시 서버와 맞춤 */
                if (realtimeDebounceTimerRef.current != null) {
                  window.clearTimeout(realtimeDebounceTimerRef.current);
                  realtimeDebounceTimerRef.current = null;
                }
                void refreshRef.current(true);
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
              markRealtimeSignal();
              const row = payload.new as Record<string, unknown> | undefined;
              if (!row) return;
              if (String(row.signal_type ?? "") !== "hangup") return;
              const sid = row.session_id == null ? "" : String(row.session_id).trim();
              if (!sid) return;
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
              scheduleRealtimeIncomingRefresh();
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
  }, [
    bumpIncomingListFastSync,
    handleCallTerminalEvent,
    scheduleRealtimeIncomingRefresh,
    syncIncomingRealtimeHealth,
    userId,
  ]);

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

  /**
   * 전용 통화 라우트(`/calls/*`)에서는 풀페이지 `CallClient` 만 쓴다.
   * 전역 수신 오버레이를 겹쳐 띄우면 수락 직후 「벨 화면 + 통화 화면」이 동시에 보인다.
   */
  const hideGlobalIncomingOverlay =
    typeof pathname === "string" && pathname.startsWith("/community-messenger/calls/");
  /** 오버레이는 `ringing` 직통 수신만 — active·ended 등은 목록 정렬과 무관하게 표시하지 않음 */
  const firstRingingCalleeSession = useMemo(() => {
    const uid = userId?.trim();
    if (!uid) return null;
    for (const s of sessions) {
      if (s.status !== "ringing") continue;
      if (s.endedAt || s.cancelledAt) continue;
      if (!isRingingIncomingOverlayCandidate(s, uid)) continue;
      return s;
    }
    return null;
  }, [sessions, userId]);
  /** 수신 링 UI — room bootstrap·GET 보강을 기다리지 않음(배너 설정과 무관하게 직통 ringing 은 표시). */
  const visibleSession = hideGlobalIncomingOverlay ? null : firstRingingCalleeSession;
  const visibleSessionId = visibleSession?.id ?? null;
  const incomingUiSurfaceLoggedRef = useRef<Set<string>>(new Set());
  useLayoutEffect(() => {
    if (!visibleSessionId || !visibleSession) return;
    const hasMinimal =
      Boolean(visibleSession.peerUserId?.trim()) &&
      (visibleSession.callKind === "voice" || visibleSession.callKind === "video") &&
      Boolean(visibleSession.id?.trim());
    if (!hasMinimal) return;
    if (incomingUiSurfaceLoggedRef.current.has(visibleSessionId)) return;
    incomingUiSurfaceLoggedRef.current.add(visibleSessionId);
    cmCallIncomingTraceMergeFromStorage(visibleSessionId);
    cmCallIncomingTracePatch(visibleSessionId, { receiver_incoming_ui_open_ms: Date.now() });
    cmCallIncomingTraceRegisterRingingRoom(visibleSessionId, visibleSession.roomId);
    cmCallFlow("incoming_received", { sessionId: visibleSessionId });
    cmCallIncomingTraceLogTable(visibleSessionId);
  }, [visibleSession, visibleSessionId]);
  useEffect(() => {
    if (!visibleSession?.roomId) return;
    const rid = visibleSession.roomId.trim();
    return () => {
      cmCallIncomingTraceClearRingingRoom(rid);
    };
  }, [visibleSession?.id, visibleSession?.roomId]);
  const isMinimized = Boolean(visibleSession && minimizedSessionId === visibleSession.id);
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

  useEffect(() => {
    if (directRingingCalleeSession?.status !== "ringing") return;
    if (!incomingCallSoundEnabled) return;
    let cancelled = false;
    let tone: { stop: () => void } | null = null;
    void startCommunityMessengerCallTone("incoming", {
      callKind: directRingingCalleeSession.callKind === "video" ? "video" : "voice",
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
  }, [directRingingCalleeSession?.id, directRingingCalleeSession?.status, directRingingCalleeSession?.callKind, incomingCallSoundEnabled]);

  useEffect(() => {
    syncCommunityMessengerNativeIncomingCall(visibleSession);
    return () => {
      if (visibleSession) syncCommunityMessengerNativeIncomingCall({ ...visibleSession, status: "missed" });
    };
  }, [visibleSession]);

  const rejectCall = useCallback(async (sessionId: string) => {
    if (busyId === `reject:${sessionId}` || busyId === `accept:${sessionId}`) return;
    suppressMissedSoundRef.current.add(sessionId);
    stopCommunityMessengerCallTone();
    const session = sessions.find((item) => item.id === sessionId) ?? null;
    dismissedIncomingSessionsAtRef.current.set(sessionId, Date.now());
    setSessions((prev) => prev.filter((item) => item.id !== sessionId));
    setBusyId(`reject:${sessionId}`);
    try {
      if (session?.peerUserId?.trim()) {
        /** PATCH·DB 반영보다 먼저 — 발신 탭이 `cm_invite_hangup` 으로 즉시 새로고침 */
        void notifyCommunityMessengerCallInviteHangupBestEffort(session.peerUserId.trim(), sessionId, {
          roomId: session.roomId,
          initiatorUserId: session.initiatorUserId,
          callKind: session.callKind,
          terminalStatus: "rejected",
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
      const patchJson = await patchCommunityMessengerCallSession(
        sessionId,
        "reject",
        undefined,
        session
          ? {
              sessionStatus: session.status,
              isInitiator: session.isMineInitiator,
              endedReason: session.endedReason ?? null,
            }
          : undefined
      );
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
        await refresh(true, { incomingTerminalListSync: true });
        return;
      }
      setSessionActionError(null);
      setMinimizedSessionId((prev) => (prev === sessionId ? null : prev));
      await refresh(true, { incomingTerminalListSync: true });
    } finally {
      setBusyId(null);
    }
  }, [busyId, refresh, sessions]);

  const acceptCall = useCallback(
    (session: CommunityMessengerCallSession) => {
      if (busyId === `accept:${session.id}` || busyId === `reject:${session.id}`) return;
      rememberCallNavigationReturnPath();
      setBusyId(`accept:${session.id}`);
      setSessionActionError(null);

      const groupUrl =
        session.sessionMode === "group"
          ? `/community-messenger/rooms/${encodeURIComponent(session.roomId)}?callAction=accept&sessionId=${encodeURIComponent(session.id)}`
          : null;
      /** 직통 1:1 — PATCH 수락 성공 후에만 이동. `?action=accept` 로 통화 화면에 지연 PATCH 맡기지 않음 */
      const directCallUrl = `/community-messenger/calls/${encodeURIComponent(session.id)}`;

      void (async () => {
        try {
          const patchJson = await patchCommunityMessengerCallSession(
            session.id,
            "accept",
            undefined,
            {
              sessionStatus: session.status,
              isInitiator: session.isMineInitiator,
              endedReason: session.endedReason ?? null,
            }
          );
          if (!patchJson.ok || !patchJson.session) {
            await refresh(true);
            setSessionActionError(MESSENGER_CALL_USER_MSG.sessionActionFailed);
            return;
          }

          cmCallFlow("incoming_accepted", { sessionId: session.id });

          /** 성공 즉시: 오버레이 제거 → 링 정지 → (시드·프라임) → 통화 라우트로 이동 */
          dismissedIncomingSessionsAtRef.current.set(session.id, Date.now());
          setSessions((prev) => prev.filter((item) => item.id !== session.id));
          stopCommunityMessengerCallTone();

          markIncomingCallHardClearedSession(hardClearedIncomingSessionsAtRef.current, session.id);
          suppressMissedSoundRef.current.add(session.id);

          if (!groupUrl && patchJson.session) {
            primeCommunityMessengerCallNavigationSeed(session.id, patchJson.session);
          }

          /** 링 중 getUserMedia 금지 — 서버가 active 일 때만 프라임 후 통화 화면으로 이동 */
          let permissionFailed = false;
          if (patchJson.session.status === "active") {
            try {
              await primeCommunityMessengerDevicePermissionFromUserGesture(patchJson.session.callKind);
            } catch {
              permissionFailed = true;
            }
          }

          router.replace(groupUrl ?? directCallUrl);
          if (permissionFailed) {
            showMessengerSnackbar(
              session.callKind === "video"
                ? "카메라/마이크 권한을 허용하지 못했습니다. 통화 화면에서 마이크·카메라를 허용해 주세요."
                : "마이크 권한을 허용하지 못했습니다. 통화 화면에서 마이크를 허용해 주세요.",
              { variant: "error" }
            );
          }
          void refresh(true);
        } finally {
          setBusyId(null);
        }
      })();
    },
    [busyId, refresh, router]
  );

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
        key={visibleSession.id}
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
    /** signal-first 프리뷰는 서버 목록에 없을 수 있음 — 취소 후 GET 이 빈 배열이면 여기서 유령 부활 금지 */
    if (s.isPreview === true || s.source === "invite_preview") return false;
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
