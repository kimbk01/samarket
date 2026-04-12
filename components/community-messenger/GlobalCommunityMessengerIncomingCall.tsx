"use client";

/**
 * 수신 통화 전용 — 발신 진입점은 `lib/community-messenger/outgoing-call-surfaces.ts` 참고.
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

const INCOMING_CALL_REFRESH_INTERVAL_MS = 20_000;
const INCOMING_CALL_REFRESH_COOLDOWN_MS = 2_500;
/** Realtime·포커스가 연속으로 터질 때 수신 통화 GET 폭주 방지 */
const INCOMING_CALL_BURST_MIN_GAP_MS = 4_000;
/** postgres_changes 가 잦을 때 동일 버스트가 반복되지 않게 */
const REALTIME_REFRESH_DEBOUNCE_MS = 900;
/** 탭 복귀 시 1회 확인 + 짧은 재시도 1회 (기존 3연타 완화) */
const VISIBILITY_RETRY_MS = 1_200;
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
  const seenIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerIdsRef = useRef<number[]>([]);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
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
    if (!force && now - lastRefreshAtRef.current < INCOMING_CALL_REFRESH_COOLDOWN_MS) {
      return;
    }
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }
    const task = (async () => {
      const res = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sessions?: CommunityMessengerCallSession[];
      };
      setSessions(res.ok && json.ok ? json.sessions ?? [] : []);
      lastRefreshAtRef.current = Date.now();
    })().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = task;
    await task;
  }, []);

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
        }, VISIBILITY_RETRY_MS),
      ];
    };
    const now = Date.now();
    const gap = now - lastBurstAtRef.current;
    if (gap >= INCOMING_CALL_BURST_MIN_GAP_MS) {
      runBurst();
      return;
    }
    if (pendingBurstTimerRef.current != null) return;
    pendingBurstTimerRef.current = window.setTimeout(runBurst, INCOMING_CALL_BURST_MIN_GAP_MS - gap);
  }, [refresh]);

  /** Supabase Realtime: 디바운스 후 1회만(연속 INSERT/UPDATE 시 GET 폭주 방지). */
  const scheduleRealtimeIncomingRefresh = useCallback(() => {
    if (realtimeDebounceTimerRef.current != null) {
      window.clearTimeout(realtimeDebounceTimerRef.current);
    }
    realtimeDebounceTimerRef.current = window.setTimeout(() => {
      realtimeDebounceTimerRef.current = null;
      void refresh(true);
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    queueVisibilityRefreshBurst();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, INCOMING_CALL_REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") queueVisibilityRefreshBurst();
    };
    const onPageShow = () => {
      queueVisibilityRefreshBurst();
    };
    const onOnline = () => {
      queueVisibilityRefreshBurst();
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
  }, [queueVisibilityRefreshBurst, refresh, userId]);

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
        () => {
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
  const isMinimized = Boolean(visibleSession && minimizedSessionId === visibleSession.id);

  useEffect(() => {
    if (visibleSessionStatus !== "ringing") return;
    let cancelled = false;
    let tone: { stop: () => void } | null = null;
    void startCommunityMessengerCallTone("incoming", {
      callKind: visibleSession?.callKind ?? "voice",
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
  }, [visibleSessionId, visibleSessionStatus, visibleSession?.callKind]);

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
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
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
          window.alert(
            session.callKind === "video"
              ? "카메라/마이크 권한을 허용하지 못했습니다. 통화 화면에서 「수락」을 한 번 더 눌러 주세요."
              : "마이크 권한을 허용하지 못했습니다. 통화 화면에서 「수락」을 한 번 더 눌러 주세요."
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
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      }).catch(() => undefined);
      const res = await fetch("/api/community/block-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: session.peerUserId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        window.alert("차단 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
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
        window.alert(messageJson.error ?? "응답 메시지를 전송하지 못했습니다.");
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
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      }).catch(() => undefined);
      setReplySheetSessionId(null);
      setMinimizedSessionId((prev) => (prev === session.id ? null : prev));
      setSessions((prev) => prev.filter((item) => item.id !== session.id));
      await refresh(true);
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  if (!visibleSession) return null;

  const callTypeLabel = visibleSession.callKind === "video" ? "영상 통화" : "음성 통화";

  return (
    <CallScreenShell surfaceClassName="bg-transparent" className="min-h-[100dvh]">
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {isMinimized ? (
          <div className="mx-3 mt-[max(12px,env(safe-area-inset-top))] flex items-center gap-3 rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-2 shadow-[var(--ui-shadow-card)]">
            <button
              type="button"
              onClick={() => setMinimizedSessionId(null)}
              className="min-w-0 flex-1 touch-manipulation text-left"
            >
              <p className="truncate text-[13px] font-semibold text-ui-fg">{visibleSession.peerLabel}</p>
              <p className="truncate text-[11px] text-ui-muted">{callTypeLabel} 수신</p>
            </button>
            <button
              type="button"
              onClick={() => void rejectCall(visibleSession.id)}
              disabled={busyId === `reject:${visibleSession.id}` || busyId === `block:${visibleSession.id}`}
              className="touch-manipulation rounded-ui-rect border border-ui-border px-3 py-2 text-[12px] font-medium text-ui-fg disabled:opacity-40"
            >
              거절
            </button>
            <button
              type="button"
              onClick={() => void acceptCall(visibleSession)}
              disabled={busyId === `accept:${visibleSession.id}`}
              className="touch-manipulation rounded-ui-rect border border-ui-border bg-ui-fg px-3 py-2 text-[12px] font-semibold text-ui-surface disabled:opacity-40"
            >
              수락
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-between border-t border-ui-border bg-ui-surface px-5 pb-[max(20px,calc(env(safe-area-inset-bottom)+12px))] pt-[max(16px,calc(env(safe-area-inset-top)+8px))]">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-ui-rect border border-ui-border px-2 py-1 text-[11px] font-medium text-ui-muted">
                  {t("nav_incoming_call")}
                </span>
                <button
                  type="button"
                  onClick={() => setMinimizedSessionId(visibleSession.id)}
                  className="rounded-ui-rect border border-ui-border px-3 py-2 text-[12px] font-medium text-ui-fg"
                >
                  최소화
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-10 text-center">
                <IncomingAvatar label={visibleSession.peerLabel} />
                <h2 className="mt-5 text-[22px] font-semibold tracking-tight text-ui-fg">{visibleSession.peerLabel}</h2>
                <p className="mt-2 text-[13px] text-ui-muted">수신 통화</p>
                <p className="mt-1 text-[14px] font-medium text-ui-fg">{callTypeLabel}</p>
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
                  className="rounded-ui-rect border border-ui-border px-4 py-3 text-[13px] font-medium text-ui-fg disabled:opacity-40"
                >
                  메시지 응답
                </button>
                <button
                  type="button"
                  onClick={() => void blockCaller(visibleSession)}
                  disabled={busyId === `block:${visibleSession.id}`}
                  className="rounded-ui-rect border border-ui-border bg-ui-surface px-4 py-3 text-[13px] font-medium text-ui-fg disabled:opacity-40"
                >
                  {busyId === `block:${visibleSession.id}` ? "차단 중..." : "차단"}
                </button>
              </div>
              {replySheetSessionId === visibleSession.id ? (
                <div className="rounded-ui-rect border border-ui-border bg-ui-page p-2">
                  <p className="px-1 pb-2 text-[11px] font-medium text-ui-muted">메시지 후 거절</p>
                  <div className="grid gap-2">
                    {QUICK_REPLY_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => void sendQuickReplyAndReject(visibleSession, option)}
                        disabled={busyId === `reply:${visibleSession.id}`}
                        className="rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-2 text-left text-[12px] text-ui-fg disabled:opacity-40"
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
    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-ui-hover text-[32px] font-semibold text-ui-muted">
      {initial}
    </div>
  );
}
