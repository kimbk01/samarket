"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
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

export function GlobalCommunityMessengerIncomingCall() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CommunityMessengerCallSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useState(true);
  const [incomingCallBannerEnabled, setIncomingCallBannerEnabled] = useState(true);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerIdsRef = useRef<number[]>([]);

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

  const refresh = useCallback(async () => {
    const res = await fetch("/api/community-messenger/calls/sessions/incoming", {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      sessions?: CommunityMessengerCallSession[];
    };
    setSessions(res.ok && json.ok ? json.sessions ?? [] : []);
  }, []);

  const queueRefreshBurst = useCallback(() => {
    void refresh();
    for (const timerId of refreshTimerIdsRef.current) {
      window.clearTimeout(timerId);
    }
    refreshTimerIdsRef.current = [150, 500, 1000].map((delay) =>
      window.setTimeout(() => {
        void refresh();
      }, delay)
    );
  }, [refresh]);

  useEffect(() => {
    queueRefreshBurst();
  }, [queueRefreshBurst]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 1000);
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

  const acceptCall = useCallback(
    (session: CommunityMessengerCallSession) => {
      if (session.sessionMode === "group") {
        window.alert("그룹 통화는 현재 준비 중입니다. 다음 단계에서 다시 연결하겠습니다.");
        return;
      }
      setBusyId(`accept:${session.id}`);
      setSessions((prev) => prev.filter((item) => item.id !== session.id));
      const url = `/community-messenger/calls/${encodeURIComponent(session.id)}?action=accept`;
      void (async () => {
        let permissionFailed = false;
        try {
          await Promise.race([
            primeCommunityMessengerDevicePermissionFromUserGesture(session.callKind),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error("prime_timeout")), 5_000);
            }),
          ]);
        } catch {
          permissionFailed = true;
        } finally {
          setBusyId(null);
          if (permissionFailed) {
            window.alert(
              session.callKind === "video"
                ? "카메라/마이크 권한 확인이 지연되어 통화방으로 먼저 이동합니다. 방 안에서 다시 수락하면 바로 연결됩니다."
                : "마이크 권한 확인이 지연되어 통화방으로 먼저 이동합니다. 방 안에서 다시 수락하면 바로 연결됩니다."
            );
          }
          window.location.assign(url);
        }
      })();
    },
    []
  );

  if (!visibleSession) return null;

  return (
    <div className="fixed inset-x-0 top-20 z-40 mx-auto w-[min(92vw,420px)]">
      <div className="rounded-[28px] border border-[#06C755]/20 bg-white p-4 shadow-[0_20px_48px_rgba(17,24,39,0.22)]">
        <p className="text-[12px] font-semibold text-[#06C755]">수신 통화</p>
        <h2 className="mt-1 text-[18px] font-semibold text-gray-900">{visibleSession.peerLabel}</h2>
        <p className="mt-1 text-[13px] text-gray-500">
          {visibleSession.sessionMode === "group"
            ? `${visibleSession.callKind === "video" ? "그룹 영상 통화" : "그룹 음성 통화"} 초대가 왔습니다.`
            : `${visibleSession.callKind === "video" ? "영상 통화" : "음성 통화"}가 왔습니다.`}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void rejectCall(visibleSession.id)}
            disabled={busyId === `reject:${visibleSession.id}`}
            className="cursor-pointer touch-manipulation rounded-2xl border border-gray-200 px-4 py-3 text-[14px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755]/40 focus-visible:ring-offset-2"
          >
            거절
          </button>
          <button
            type="button"
            onClick={() => void acceptCall(visibleSession)}
            disabled={busyId === `accept:${visibleSession.id}` || visibleSession.sessionMode === "group"}
            className="flex-1 cursor-pointer touch-manipulation select-none rounded-2xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white shadow-md transition-[transform,colors] duration-150 hover:bg-[#05b34c] hover:shadow-lg active:scale-[95%] active:bg-[#049c42] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:ring-offset-2"
          >
            {visibleSession.sessionMode === "group"
              ? "그룹 통화 준비 중"
              : busyId === `accept:${visibleSession.id}`
                ? "준비 중..."
                : "수락"}
          </button>
        </div>
      </div>
    </div>
  );
}
