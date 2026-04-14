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
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { playNotificationSound } from "@/lib/notifications/play-notification-sound";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CallPrimaryButton } from "@/components/community-messenger/call-ui/CallButtons";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import { applyIncomingCallSessionsRealtimeEvent } from "@/lib/community-messenger/incoming-call-realtime-preview";
import {
  getIncomingCallPollIntervalMs,
  MESSENGER_INCOMING_CALL_BURST_MIN_GAP_MS,
  MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS,
  MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS,
  MESSENGER_INCOMING_CALL_VISIBILITY_RETRY_MS,
} from "@/lib/community-messenger/messenger-latency-config";

const INCOMING_CALL_TIER = getPublicDeployTier();
const INCOMING_CALL_FETCH_FLIGHT_KEY = "community-messenger:incoming-calls:directOnly";
const QUICK_REPLY_OPTIONS = [
  "지금 통화가 어려워요. 채팅으로 남겨 주세요.",
  "잠시 후 다시 연락드릴게요.",
  "회의 중입니다. 메시지 부탁드려요.",
] as const;

export function GlobalCommunityMessengerIncomingCall() {
  const { t } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
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
          setSessions(json.sessions ?? []);
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
      /* Realtime 폴백 시 쿨다운에 막히지 않도록 force — 간격은 pollMs 로만 제한 */
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

    let channel: RealtimeChannel | null = null;
    channel = sb
      .channel(`community-messenger-incoming-call:${userId}`)
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
      )
      .subscribe();

    return () => {
      if (realtimeDebounceTimerRef.current != null) {
        window.clearTimeout(realtimeDebounceTimerRef.current);
        realtimeDebounceTimerRef.current = null;
      }
      if (channel) void sb.removeChannel(channel);
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

  const callTypeLabel = visibleSession.callKind === "video" ? "영상 통화" : "음성 통화";

  return (
    <CallScreenShell className="min-h-[100dvh]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,24,0.35)_0%,transparent_55%)]" aria-hidden />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {(sessionActionError || incomingListError) ? (
          <div className="pointer-events-auto space-y-2 px-3 pt-[max(8px,env(safe-area-inset-top))]">
            {sessionActionError ? (
              <div
                className="rounded-ui-rect border border-amber-500/40 bg-amber-950/80 px-3 py-2 text-[12px] text-amber-50"
                role="alert"
              >
                <span>{sessionActionError}</span>
                <button
                  type="button"
                  className="ml-2 font-semibold underline underline-offset-2"
                  onClick={() => setSessionActionError(null)}
                >
                  닫기
                </button>
              </div>
            ) : null}
            {incomingListError ? (
              <div
                className="rounded-ui-rect border border-white/15 bg-black/35 px-3 py-2 text-[11px] text-white/85 backdrop-blur-sm"
                role="status"
              >
                {incomingListError}
                <button
                  type="button"
                  className="ml-2 font-semibold text-white underline underline-offset-2"
                  onClick={() => void refresh(true)}
                >
                  {MESSENGER_CALL_USER_MSG.incomingListRetry}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {isMinimized ? (
          <div className="mx-3 mt-[max(12px,env(safe-area-inset-top))] flex items-center gap-3 rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]/95 px-3 py-2 shadow-[var(--messenger-shadow-soft)] backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setMinimizedSessionId(null)}
              className="min-w-0 flex-1 touch-manipulation text-left"
            >
              <p className="truncate text-[13px] font-semibold" style={{ color: "var(--messenger-text)" }}>
                {visibleSession.peerLabel}
              </p>
              <p className="truncate text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
                {callTypeLabel} 수신
              </p>
            </button>
            <button
              type="button"
              onClick={() => void rejectCall(visibleSession.id)}
              disabled={busyId === `reject:${visibleSession.id}` || busyId === `block:${visibleSession.id}`}
              className="touch-manipulation rounded-[var(--messenger-radius-sm)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-2 text-[12px] font-medium disabled:opacity-40"
              style={{ color: "var(--messenger-text)" }}
            >
              거절
            </button>
            <button
              type="button"
              onClick={() => void acceptCall(visibleSession)}
              disabled={busyId === `accept:${visibleSession.id}`}
              className="touch-manipulation rounded-[var(--messenger-radius-sm)] border border-transparent bg-[color:var(--messenger-primary)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              수락
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-between rounded-t-[var(--messenger-radius-lg)] border-t border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-5 pb-[max(20px,calc(env(safe-area-inset-bottom)+12px))] pt-[max(16px,calc(env(safe-area-inset-top)+8px))] shadow-[0_-8px_32px_rgba(17,24,39,0.08)]">
            <div>
              <div className="flex items-center justify-between">
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    backgroundColor: "var(--messenger-primary-soft)",
                    color: "var(--messenger-primary)",
                  }}
                >
                  {t("nav_incoming_call")}
                </span>
                <button
                  type="button"
                  onClick={() => setMinimizedSessionId(visibleSession.id)}
                  className="rounded-[var(--messenger-radius-sm)] px-3 py-2 text-[12px] font-medium active:bg-[color:var(--messenger-primary-soft)]"
                  style={{ color: "var(--messenger-text)" }}
                >
                  최소화
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-10 text-center">
                <IncomingAvatar label={visibleSession.peerLabel} />
                <h2 className="mt-5 text-[22px] font-semibold tracking-tight" style={{ color: "var(--messenger-text)" }}>
                  {visibleSession.peerLabel}
                </h2>
                <p className="mt-2 text-[13px]" style={{ color: "var(--messenger-text-secondary)" }}>
                  수신 통화
                </p>
                <p className="mt-1 text-[14px] font-medium" style={{ color: "var(--messenger-text)" }}>
                  {callTypeLabel}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setReplySheetSessionId((prev) => (prev === visibleSession.id ? null : visibleSession.id))
                  }
                  disabled={busyId === `reply:${visibleSession.id}`}
                  className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-4 py-3 text-[13px] font-medium disabled:opacity-40 active:bg-[color:var(--messenger-primary-soft)]"
                  style={{ color: "var(--messenger-text)" }}
                >
                  메시지 응답
                </button>
                <button
                  type="button"
                  onClick={() => void blockCaller(visibleSession)}
                  disabled={busyId === `block:${visibleSession.id}`}
                  className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 text-[13px] font-medium disabled:opacity-40 active:bg-[color:var(--messenger-primary-soft)]"
                  style={{ color: "var(--messenger-text)" }}
                >
                  {busyId === `block:${visibleSession.id}` ? "차단 중..." : "차단"}
                </button>
              </div>
              {replySheetSessionId === visibleSession.id ? (
                <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] p-2">
                  <p className="px-1 pb-2 text-[11px] font-medium" style={{ color: "var(--messenger-text-secondary)" }}>
                    메시지 후 거절
                  </p>
                  <div className="grid gap-2">
                    {QUICK_REPLY_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => void sendQuickReplyAndReject(visibleSession, option)}
                        disabled={busyId === `reply:${visibleSession.id}`}
                        className="rounded-[var(--messenger-radius-sm)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-2 text-left text-[12px] disabled:opacity-40 active:bg-[color:var(--messenger-primary-soft)]"
                        style={{ color: "var(--messenger-text)" }}
                      >
                        {busyId === `reply:${visibleSession.id}` ? "전송 중..." : option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <CallPrimaryButton
                  variant="outline"
                  onClick={() => void rejectCall(visibleSession.id)}
                  disabled={busyId === `reject:${visibleSession.id}` || busyId === `block:${visibleSession.id}`}
                  className="!font-medium"
                >
                  {t("common_reject")}
                </CallPrimaryButton>
                <CallPrimaryButton
                  variant="solid"
                  onClick={() => void acceptCall(visibleSession)}
                  disabled={busyId === `accept:${visibleSession.id}`}
                >
                  {busyId === `accept:${visibleSession.id}` ? `${t("common_loading")}` : t("common_accept")}
                </CallPrimaryButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </CallScreenShell>
  );
}

function IncomingAvatar({ label }: { label: string }) {
  const initial = label.trim().slice(0, 1) || "?";
  return (
    <div
      className="flex h-24 w-24 items-center justify-center rounded-full text-[32px] font-semibold ring-4 ring-[color:var(--messenger-primary-soft-2)]"
      style={{
        backgroundColor: "var(--messenger-primary-soft)",
        color: "var(--messenger-primary)",
      }}
    >
      {initial}
    </div>
  );
}
