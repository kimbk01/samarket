"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { startCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import {
  COMMUNITY_MESSENGER_PREFERENCE_EVENT,
  isCommunityMessengerIncomingCallBannerEnabled,
  isCommunityMessengerIncomingCallSoundEnabled,
} from "@/lib/community-messenger/preferences";
import {
  getCommunityMessengerPermissionGuide,
  primeCommunityMessengerDevicePermission,
} from "@/lib/community-messenger/call-permission";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { getCommunityMessengerMediaErrorMessage } from "@/lib/community-messenger/media-errors";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { playNotificationSound } from "@/lib/notifications/play-notification-sound";
import { getSupabaseClient } from "@/lib/supabase/client";

export function GlobalCommunityMessengerIncomingCall() {
  const pathname = usePathname();
  const router = useRouter();
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
    refreshTimerIdsRef.current = [250, 900, 1800].map((delay) =>
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
    }, 2500);
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
      if (!seenIdsRef.current.has(session.id)) {
        if (
          incomingCallSoundEnabled &&
          !incomingCallBannerEnabled &&
          pathname !== `/community-messenger/rooms/${session.roomId}`
        ) {
          playNotificationSound();
        }
      }
    }
    seenIdsRef.current = nextIds;
  }, [incomingCallBannerEnabled, incomingCallSoundEnabled, pathname, sessions]);

  const visibleSession =
    incomingCallBannerEnabled
      ? sessions.find((session) => pathname !== `/community-messenger/rooms/${session.roomId}`) ?? null
      : null;

  useEffect(() => {
    if (!visibleSession) return;
    const tone = startCommunityMessengerCallTone("incoming");
    return () => {
      tone.stop();
    };
  }, [visibleSession?.id]);

  const rejectCall = useCallback(async (sessionId: string) => {
    setBusyId(`reject:${sessionId}`);
    try {
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const acceptCall = useCallback(async (session: CommunityMessengerCallSession) => {
    setBusyId(`accept:${session.id}`);
    try {
      try {
        await primeCommunityMessengerDevicePermission(session.callKind);
      } catch (error) {
        alert(
          `${getCommunityMessengerMediaErrorMessage(error, session.callKind)}\n\n${getCommunityMessengerPermissionGuide(session.callKind).description}`
        );
      }
      router.push(
        `/community-messenger/rooms/${encodeURIComponent(session.roomId)}?callAction=accept&sessionId=${encodeURIComponent(session.id)}`
      );
    } finally {
      setBusyId(null);
    }
  }, [router]);

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
            className="rounded-2xl border border-gray-200 px-4 py-3 text-[14px] font-medium text-gray-700"
          >
            거절
          </button>
          <button
            type="button"
            onClick={() => void acceptCall(visibleSession)}
            disabled={busyId === `accept:${visibleSession.id}`}
            className="flex-1 rounded-2xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
          >
            {busyId === `accept:${visibleSession.id}` ? "준비 중..." : "수락"}
          </button>
        </div>
      </div>
    </div>
  );
}
