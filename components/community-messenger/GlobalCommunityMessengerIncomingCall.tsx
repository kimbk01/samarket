"use client";

/**
 * 수신 통화 전용 — 발신 진입점은 `lib/community-messenger/outgoing-call-surfaces.ts` 참고.
 * 폴링·`runSingleFlight` 키: `docs/messenger-realtime-policy.md`
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  playCommunityMessengerCallSignalSound,
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallFeedback,
} from "@/lib/community-messenger/call-feedback-sound";
import { fetchMessengerCallSoundConfig } from "@/lib/community-messenger/messenger-call-sound-config-client";
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
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
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

const INCOMING_CALL_TIER = getPublicDeployTier();
const INCOMING_CALL_FETCH_FLIGHT_KEY = "community-messenger:incoming-calls:directOnly";
const QUICK_REPLY_OPTIONS = [
  "지금 통화가 어려워요. 채팅으로 남겨 주세요.",
  "잠시 후 다시 연락드릴게요.",
  "회의 중입니다. 메시지 부탁드려요.",
] as const;

export function GlobalCommunityMessengerIncomingCall() {
  const { t } = useI18n();
  const [userId, setUserId] = useState<string | null>(() =>
    typeof window !== "undefined" ? getCurrentUser()?.id?.trim() || null : null
  );
  const [sessions, setSessions] = useState<CommunityMessengerCallSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [minimizedSessionId, setMinimizedSessionId] = useState<string | null>(null);
  const [replySheetSessionId, setReplySheetSessionId] = useState<string | null>(null);
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

  const viewerUserIdRef = useRef<string | null>(null);
  viewerUserIdRef.current = userId;

  useEffect(() => {
    void getCurrentUserIdForDb().then((value) => {
      setUserId(value);
    });
  }, []);

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

  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshAtRef.current < MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS) {
      return;
    }
    await runSingleFlight(INCOMING_CALL_FETCH_FLIGHT_KEY, async () => {
      try {
        const res = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
          cache: "no-store",
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
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
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
              scheduleRealtimeIncomingRefresh();
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
    if (!replySheetSessionId) return;
    if (!sessions.some((session) => session.id === replySheetSessionId)) {
      setReplySheetSessionId(null);
    }
  }, [replySheetSessionId, sessions]);

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
          await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toUserId: session.peerUserId,
              signalType: "hangup",
              payload: { reason: "reject" },
            }),
          });
        } catch {
          /* hangup 실패 시에도 PATCH 로 세션 종료 */
        }
      }
      const patchRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const patchJson = (await patchRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!patchRes.ok || !patchJson.ok) {
        setSessionActionError(MESSENGER_CALL_USER_MSG.sessionRejectFailed);
        return;
      }
      setSessionActionError(null);
      setMinimizedSessionId((prev) => (prev === sessionId ? null : prev));
      setReplySheetSessionId((prev) => (prev === sessionId ? null : prev));
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

  const blockCaller = useCallback(async (session: CommunityMessengerCallSession) => {
    suppressMissedSoundRef.current.add(session.id);
    stopCommunityMessengerCallFeedback();
    if (!session.peerUserId) return;
    if (!window.confirm(`${session.peerLabel}님을 차단할까요?`)) {
      return;
    }
    setBusyId(`block:${session.id}`);
    try {
      try {
        await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}/signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toUserId: session.peerUserId,
            signalType: "hangup",
            payload: { reason: "reject" },
          }),
        });
      } catch {
        /* ignore */
      }
      const preBlockRejectRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const preBlockRejectJson = (await preBlockRejectRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!preBlockRejectRes.ok || !preBlockRejectJson.ok) {
        showMessengerSnackbar(MESSENGER_CALL_USER_MSG.sessionRejectFailed, { variant: "error" });
        return;
      }
      const res = await fetch("/api/community/block-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: session.peerUserId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        showMessengerSnackbar("차단 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.", { variant: "error" });
        return;
      }
      setSessions((prev) => prev.filter((item) => item.id !== session.id));
      setMinimizedSessionId((prev) => (prev === session.id ? null : prev));
      setReplySheetSessionId((prev) => (prev === session.id ? null : prev));
      await refresh(true);
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const sendQuickReplyAndReject = useCallback(async (session: CommunityMessengerCallSession, content: string) => {
    suppressMissedSoundRef.current.add(session.id);
    stopCommunityMessengerCallFeedback();
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    setBusyId(`reply:${session.id}`);
    try {
      const messageRes = await fetch(
        `/api/community-messenger/rooms/${encodeURIComponent(session.roomId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmedContent }),
        }
      );
      const messageJson = (await messageRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!messageRes.ok || !messageJson.ok) {
        showMessengerSnackbar(messageJson.error ?? "응답 메시지를 전송하지 못했습니다.", { variant: "error" });
        return;
      }
      if (session.peerUserId) {
        try {
          await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}/signals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toUserId: session.peerUserId,
              signalType: "hangup",
              payload: { reason: "reject" },
            }),
          });
        } catch {
          /* ignore */
        }
      }
      const rejectAfterReplyRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const rejectAfterReplyJson = (await rejectAfterReplyRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!rejectAfterReplyRes.ok || !rejectAfterReplyJson.ok) {
        showMessengerSnackbar(MESSENGER_CALL_USER_MSG.sessionRejectFailed, { variant: "error" });
        return;
      }
      setReplySheetSessionId(null);
      setMinimizedSessionId((prev) => (prev === session.id ? null : prev));
      setSessions((prev) => prev.filter((item) => item.id !== session.id));
      await refresh(true);
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  if (visibleSession) {
    const callTypeLabel = visibleSession.callKind === "video" ? "영상 통화" : "음성 통화";
    const incomingVm: CallScreenViewModel = {
      mode: visibleSession.callKind === "video" ? "video" : "voice",
      direction: "incoming",
      phase: "ringing",
      peerLabel: visibleSession.peerLabel,
      peerAvatarUrl: null,
      statusText: callTypeLabel,
      subStatusText: sessionActionError ?? incomingListError ?? "수락 또는 거절을 선택해 주세요.",
      topLabel: t("nav_incoming_call"),
      footerNote: "실제 통화 시간은 연결 완료 후부터 시작됩니다.",
      mediaState: {
        micEnabled: true,
        speakerEnabled: true,
        cameraEnabled: visibleSession.callKind === "video",
        localVideoMinimized: true,
      },
      onBack: () => setMinimizedSessionId(visibleSession.id),
      primaryActions: [
        {
          id: "reject",
          label: busyId === `reject:${visibleSession.id}` ? "거절 중" : "거절",
          icon: "decline",
          tone: "danger",
          disabled:
            busyId === `reject:${visibleSession.id}` ||
            busyId === `block:${visibleSession.id}` ||
            busyId === `accept:${visibleSession.id}`,
          onClick: () => void rejectCall(visibleSession.id),
        },
        {
          id: "accept",
          label: busyId === `accept:${visibleSession.id}` ? "연결 중" : "수락",
          icon: "accept",
          tone: "accept",
          disabled: busyId === `accept:${visibleSession.id}`,
          onClick: () => void acceptCall(visibleSession),
        },
      ],
      secondaryActions: [
        {
          id: "message-reject",
          label: "메시지",
          icon: "message",
          disabled: busyId === `reply:${visibleSession.id}`,
          onClick: () =>
            void sendQuickReplyAndReject(
              visibleSession,
              QUICK_REPLY_OPTIONS[0]
            ),
        },
      ],
    };

    return <CallScreen vm={incomingVm} variant="overlay" />;
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
