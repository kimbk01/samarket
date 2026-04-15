"use client";

/**
 * 수신 통화 전용 — 발신 진입점은 `lib/community-messenger/outgoing-call-surfaces.ts` 참고.
 * 폴링·`runSingleFlight` 키: `docs/messenger-realtime-policy.md`
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
import { showLocalIncomingCallNotificationIfEligible } from "@/lib/call/call-notification";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import { applyIncomingCallSessionsRealtimeEvent } from "@/lib/community-messenger/incoming-call-realtime-preview";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  getIncomingCallPollIntervalMs,
  MESSENGER_INCOMING_CALL_BURST_MIN_GAP_MS,
  MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS,
  MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS,
  MESSENGER_INCOMING_CALL_VISIBILITY_RETRY_MS,
} from "@/lib/community-messenger/messenger-latency-config";
import {
  getCommunityMessengerIncomingCallBridgeStatus,
  syncCommunityMessengerNativeIncomingCall,
} from "@/lib/community-messenger/native-call-receive";
import { messengerMonitorCallFlowPhase } from "@/lib/community-messenger/monitoring/client";
import { logClientPerf } from "@/lib/performance/samarket-perf";

const INCOMING_CALL_TIER = getPublicDeployTier();
const INCOMING_CALL_FETCH_FLIGHT_KEY = "community-messenger:incoming-calls:directOnly";

function isTerminalCallSessionStatusValue(status: unknown): boolean {
  const s = typeof status === "string" ? status : "";
  return s === "ended" || s === "cancelled" || s === "rejected" || s === "missed";
}

export function GlobalCommunityMessengerIncomingCall() {
  const { t } = useI18n();
  const { messengerRoomIdFromPath } = useCommunityCallSurface();
  const [userId, setUserId] = useState<string | null>(() =>
    typeof window !== "undefined" ? getCurrentUser()?.id?.trim() || null : null
  );
  const [sessions, setSessions] = useState<CommunityMessengerCallSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [minimizedSessionId, setMinimizedSessionId] = useState<string | null>(null);
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useState(true);
  const [incomingCallBannerEnabled, setIncomingCallBannerEnabled] = useState(true);
  /** 수신 목록 GET 실패(이전 목록은 유지). 세션 거절 등 액션 실패는 별도 */
  const [incomingListError, setIncomingListError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerIdsRef = useRef<number[]>([]);
  const lastRefreshAtRef = useRef(0);
  const lastBurstAtRef = useRef(0);
  const pendingBurstTimerRef = useRef<number | null>(null);
  const realtimeDebounceTimerRef = useRef<number | null>(null);
  /** 직전 폴링까지 수신 목록에 있던 ringing 세션 id (directOnly — 전부 ringing) */
  const prevIncomingRingingIdsRef = useRef<Set<string>>(new Set());
  /** 거절·수락·차단·메시지거절 등 사용자가 끊은 세션은 부재 톤 제외 */
  const suppressMissedSoundRef = useRef<Set<string>>(new Set());
  /** Realtime 수신이 살아 있으면 폴링은 백업 역할만(간격은 기존 로직 유지, 강제 refresh는 줄임) */
  const incomingRealtimeOkRef = useRef(false);
  /** 수신 목록에 세션이 처음 잡힌 시각(서버 startedAt 대비) — 발신→수신 체감 지연 */
  const incomingSurfaceLoggedRef = useRef<Set<string>>(new Set());
  /** 백그라운드 탭에서 동일 세션에 대한 로컬 Notification 중복 방지 */
  const backgroundNotifiedIdsRef = useRef<Set<string>>(new Set());
  const [soundPolicyEpoch, setSoundPolicyEpoch] = useState(0);

  const viewerUserIdRef = useRef<string | null>(null);
  viewerUserIdRef.current = userId;

  useEffect(() => {
    void getCurrentUserIdForDb().then((value) => {
      setUserId(value);
    });
  }, []);

  useEffect(() => {
    incomingSurfaceLoggedRef.current.clear();
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
          setSessions((prev) => mergeIncomingCallSessionsAfterFetch(viewerUserIdRef.current, serverList, prev));
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
   * 폴링 간격은 `sessions.length` 에 따라 바꾸지 않는다.
   * 그렇게 하면 수신 목록이 갱신될 때마다 effect 가 재실행되어 interval 재설정·`queueVisibilityRefreshBurst` 중복 호출로 GET 이 폭증할 수 있다.
   * 벨 지연은 Supabase Realtime + 가시성 시 burst 가 담당하고, 폴링은 일정한 백업 주기만 유지한다.
   */
  useEffect(() => {
    if (!userId) return;
    queueVisibilityRefreshBurstRef.current();
    const pollMs = getIncomingCallPollIntervalMs(INCOMING_CALL_TIER, false);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      /**
       * Realtime 이 정상(SUBSCRIBED)인 동안에는 polling 은 “백업”만 담당한다.
       * - 메신저가 오래 켜져 있을수록 불필요 GET 누적 → 체감 느려짐/배터리 소모
       * - Realtime 끊김 시에는 기존 pollMs 주기로 즉시 복구
       */
      if (incomingRealtimeOkRef.current) return;
      void refreshRef.current(true);
    }, pollMs);
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
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    incomingRealtimeOkRef.current = false;
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-incoming-call:${userId}`,
      scope: "community-messenger-incoming-call",
      isCancelled: () => cancelled,
      onStatus: (status) => {
        incomingRealtimeOkRef.current = status === "SUBSCRIBED";
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
              setSessions((prev) =>
                applyIncomingCallSessionsRealtimeEvent(prev, userId, {
                  eventType: p.eventType,
                  new: p.new ?? null,
                  old: p.old ?? null,
                })
              );
              const newRow = p.new ?? null;
              const terminal = isTerminalCallSessionStatusValue(newRow?.status) || p.eventType === "DELETE";
              if (terminal) {
                const sid =
                  typeof newRow?.id === "string"
                    ? newRow.id
                    : typeof (p.old as Record<string, unknown> | null)?.id === "string"
                      ? String((p.old as Record<string, unknown>).id)
                      : "";
                if (sid) suppressMissedSoundRef.current.add(sid);
                stopCommunityMessengerCallFeedback();
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
              const row = payload.new as Record<string, unknown> | undefined;
              if (!row) return;
              if (String(row.signal_type ?? "") !== "hangup") return;
              const sid = row.session_id == null ? "" : String(row.session_id).trim();
              if (!sid) return;
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
      sub.stop();
      incomingRealtimeOkRef.current = false;
    };
  }, [scheduleRealtimeIncomingRefresh, userId]);

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
    const hidden = document.visibilityState !== "visible" || document.hidden;
    if (!hidden) return;

    for (const session of sessions) {
      if (session.status !== "ringing") continue;
      if (session.isMineInitiator) continue;
      if (!session.recipientUserId || !messengerUserIdsEqual(session.recipientUserId, userId)) continue;
      if (backgroundNotifiedIdsRef.current.has(session.id)) continue;
      backgroundNotifiedIdsRef.current.add(session.id);
      showLocalIncomingCallNotificationIfEligible({
        sessionId: session.id,
        peerLabel: session.peerLabel,
        callKind: session.callKind,
        suppressed: getMessengerCallSoundConfigCache()?.suppress_incoming_local_notifications === true,
      });
    }

    for (const id of [...backgroundNotifiedIdsRef.current]) {
      const stillRinging = sessions.some((s) => s.id === id && s.status === "ringing");
      if (!stillRinging) backgroundNotifiedIdsRef.current.delete(id);
    }
  }, [sessions, userId]);

  /** ringing 이 목록에서 사라졌을 때(타임아웃 부재 등) 부재 사운드 — 사용자가 거절/수락한 경우는 제외 */
  useEffect(() => {
    if (!userId) return;
    const current = new Set(sessions.map((s) => s.id));
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
  const bridgeStatus = getCommunityMessengerIncomingCallBridgeStatus();

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
    setBusyId(`reject:${sessionId}`);
    try {
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
        setSessionActionError(MESSENGER_CALL_USER_MSG.sessionRejectFailed);
        return;
      }
      setSessionActionError(null);
      setMinimizedSessionId((prev) => (prev === sessionId ? null : prev));
      await refresh();
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

/** GET 수신 목록이 Realtime INSERT 보다 빨리(또는 빈 배열로) 돌아올 때 낙관적 세션을 지우지 않도록 합친다. */
const INCOMING_OPTIMISTIC_KEEP_MS = 55_000;

function mergeIncomingCallSessionsAfterFetch(
  viewerUserId: string | null,
  serverList: CommunityMessengerCallSession[],
  previous: CommunityMessengerCallSession[]
): CommunityMessengerCallSession[] {
  if (!viewerUserId) return serverList;

  const serverIds = new Set(serverList.map((s) => s.id));
  const now = Date.now();
  const optimisticExtras = previous.filter((s) => {
    if (serverIds.has(s.id)) return false;
    if (s.status !== "ringing" || s.sessionMode !== "direct" || s.isMineInitiator) return false;
    if (!messengerUserIdsEqual(s.recipientUserId, viewerUserId)) return false;
    const started = new Date(s.startedAt).getTime();
    if (!Number.isFinite(started) || now - started > INCOMING_OPTIMISTIC_KEEP_MS) return false;
    return true;
  });

  if (optimisticExtras.length === 0) return serverList;

  return [...serverList, ...optimisticExtras].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
