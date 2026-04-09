"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { startCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
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

const INCOMING_CALL_REFRESH_INTERVAL_MS = 12_000;
const INCOMING_CALL_REFRESH_COOLDOWN_MS = 2_500;

export function GlobalCommunityMessengerIncomingCall() {
  const { t } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CommunityMessengerCallSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useState(true);
  const [incomingCallBannerEnabled, setIncomingCallBannerEnabled] = useState(true);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerIdsRef = useRef<number[]>([]);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    void getCurrentUserIdForDb().then((value) => {
      setUserId(value);
    });
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

  const queueRefreshBurst = useCallback(() => {
    void refresh(true);
    for (const timerId of refreshTimerIdsRef.current) {
      window.clearTimeout(timerId);
    }
    refreshTimerIdsRef.current = [900, 2400].map((delay) =>
      window.setTimeout(() => {
        void refresh(true);
      }, delay)
    );
  }, [refresh]);

  useEffect(() => {
    queueRefreshBurst();
  }, [queueRefreshBurst]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, INCOMING_CALL_REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") queueRefreshBurst();
    };
    const onPageShow = () => {
      queueRefreshBurst();
    };
    const onFocus = () => {
      queueRefreshBurst();
    };
    const onOnline = () => {
      queueRefreshBurst();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [queueRefreshBurst, refresh, userId]);

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
          queueRefreshBurst();
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
          queueRefreshBurst();
        }
      )
      .subscribe();

    return () => {
      if (channel) void sb.removeChannel(channel);
    };
  }, [queueRefreshBurst, userId]);

  useEffect(() => {
    return () => {
      for (const timerId of refreshTimerIdsRef.current) {
        window.clearTimeout(timerId);
      }
      refreshTimerIdsRef.current = [];
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

  const visibleSession = incomingCallBannerEnabled ? sessions[0] ?? null : null;

  useEffect(() => {
    if (!visibleSession) return;
    const tone = startCommunityMessengerCallTone("incoming");
    return () => {
      tone.stop();
    };
  }, [visibleSession?.id]);

  const rejectCall = useCallback(async (sessionId: string) => {
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
      await refresh();
    } finally {
      setBusyId(null);
    }
  }, [refresh, sessions]);

  const acceptCall = useCallback((session: CommunityMessengerCallSession) => {
    if (session.sessionMode === "group") {
      window.alert("그룹 통화는 현재 준비 중입니다. 다음 단계에서 다시 연결하겠습니다.");
      return;
    }
    setBusyId(`accept:${session.id}`);
    setSessions((prev) => prev.filter((item) => item.id !== session.id));
    const url = `/community-messenger/calls/${encodeURIComponent(session.id)}?action=accept`;
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

  if (!visibleSession) return null;

  return (
    <div className="fixed inset-x-0 top-20 z-40 mx-auto w-[min(92vw,420px)]">
      <div className="rounded-ui-rect border border-[#06C755]/20 bg-white p-4 shadow-[0_20px_48px_rgba(17,24,39,0.22)]">
        <p className="text-[12px] font-semibold text-[#06C755]">{t("nav_incoming_call")}</p>
        <h2 className="mt-1 text-[18px] font-semibold text-gray-900">{visibleSession.peerLabel}</h2>
        <p className="mt-1 text-[13px] text-gray-500">
          {visibleSession.sessionMode === "group"
            ? visibleSession.callKind === "video"
              ? t("nav_group_video_call_invite")
              : t("nav_group_voice_call_invite")
            : visibleSession.callKind === "video"
              ? t("nav_video_call_incoming")
              : t("nav_voice_call_incoming")}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void rejectCall(visibleSession.id)}
            disabled={busyId === `reject:${visibleSession.id}`}
            className="cursor-pointer touch-manipulation rounded-ui-rect border border-gray-200 px-4 py-3 text-[14px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755]/40 focus-visible:ring-offset-2"
          >
            {t("common_reject")}
          </button>
          <button
            type="button"
            onClick={() => void acceptCall(visibleSession)}
            disabled={busyId === `accept:${visibleSession.id}` || visibleSession.sessionMode === "group"}
            className="flex-1 cursor-pointer touch-manipulation select-none rounded-ui-rect bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white shadow-md transition-[transform,colors] duration-150 hover:bg-[#05b34c] hover:shadow-lg active:scale-[95%] active:bg-[#049c42] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:ring-offset-2"
          >
            {visibleSession.sessionMode === "group"
              ? t("nav_group_call_coming_soon")
              : busyId === `accept:${visibleSession.id}`
                ? `${t("common_loading")}`
                : t("common_accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
