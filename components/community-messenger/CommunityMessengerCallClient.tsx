"use client";

import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IRemoteVideoTrack } from "agora-rtc-sdk-ng";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  closeCommunityMessengerAgoraTracks,
  createCommunityMessengerAgoraClient,
  createCommunityMessengerAgoraLocalTracks,
  joinCommunityMessengerAgoraChannel,
  publishCommunityMessengerAgoraTracks,
  type CommunityMessengerAgoraLocalTracks,
} from "@/lib/community-messenger/call-provider/client";
import {
  getCommunityMessengerPermissionGuide,
  openCommunityMessengerPermissionSettings,
  primeCommunityMessengerDevicePermissionFromUserGesture,
} from "@/lib/community-messenger/call-permission";
import { getCommunityMessengerMediaErrorMessage } from "@/lib/community-messenger/media-errors";
import type {
  CommunityMessengerCallSession,
  CommunityMessengerManagedCallConnection,
} from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";

type SessionResponse = { ok?: boolean; session?: CommunityMessengerCallSession; error?: string };
type TokenResponse = { ok?: boolean; connection?: CommunityMessengerManagedCallConnection; error?: string };

function isTerminalCallSessionStatus(status: CommunityMessengerCallSession["status"]): boolean {
  return status === "ended" || status === "cancelled" || status === "rejected" || status === "missed";
}

/** 폴링으로 객체 참조만 바뀌는 경우 effect·리렌더 난사를 막는다 */
function sessionsMeaningfullyEqual(
  a: CommunityMessengerCallSession | null,
  b: CommunityMessengerCallSession | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.answeredAt === b.answeredAt &&
    a.endedAt === b.endedAt &&
    a.startedAt === b.startedAt &&
    a.callKind === b.callKind &&
    a.roomId === b.roomId &&
    a.peerLabel === b.peerLabel &&
    a.isMineInitiator === b.isMineInitiator &&
    a.sessionMode === b.sessionMode &&
    a.initiatorUserId === b.initiatorUserId &&
    a.recipientUserId === b.recipientUserId
  );
}

export function CommunityMessengerCallClient({
  sessionId,
  initialSession = null,
}: {
  sessionId: string;
  /** RSC에서 미리 조회해 첫 페인트·클라이언트 중복 요청을 줄인다 */
  initialSession?: CommunityMessengerCallSession | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAction = searchParams.get("action");
  const [session, setSession] = useState<CommunityMessengerCallSession | null>(() => initialSession ?? null);
  const [loading, setLoading] = useState(() => initialSession == null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [localVideoReady, setLocalVideoReady] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<CommunityMessengerAgoraLocalTracks | null>(null);
  const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);
  const joinedRef = useRef(false);
  const joiningRef = useRef(false);
  const autoAcceptRef = useRef(false);
  const prefetchedConnectionRef = useRef<CommunityMessengerManagedCallConnection | null>(null);
  const initialSessionRef = useRef(initialSession);
  initialSessionRef.current = initialSession;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const autoJoinBlockedRef = useRef(false);

  const permissionGuide = session ? getCommunityMessengerPermissionGuide(session.callKind) : null;

  const refreshSession = useCallback(
    async (silent = false): Promise<CommunityMessengerCallSession | null> => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as SessionResponse;
        const nextSession = res.ok && json.ok && json.session ? json.session : null;
        setSession((prev) => (sessionsMeaningfullyEqual(prev, nextSession) ? prev : nextSession));
        if (!nextSession && !silent) {
          setErrorMessage("통화 세션을 찾지 못했습니다.");
        }
        return nextSession;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sessionId]
  );

  const cleanupClient = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    joinedRef.current = false;
    joiningRef.current = false;
    setJoined(false);
    setRemoteJoined(false);
    setLocalVideoReady(false);
    setRemoteVideoReady(false);
    remoteVideoTrackRef.current?.stop();
    remoteVideoTrackRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = "";
    if (localVideoRef.current) localVideoRef.current.innerHTML = "";
    await closeCommunityMessengerAgoraTracks(localTracksRef.current);
    localTracksRef.current = null;
    if (client) {
      try {
        await client.leave();
      } catch {
        /* ignore */
      }
      client.removeAllListeners();
    }
  }, []);

  const fetchConnection = useCallback(async (): Promise<CommunityMessengerManagedCallConnection> => {
    const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/token`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !json.ok || !json.connection) {
      const error = json.error ?? "call_provider_not_configured";
      if (error === "call_provider_not_configured") {
        throw new Error("Agora 설정이 아직 연결되지 않았습니다. `NEXT_PUBLIC_COMMUNITY_MESSENGER_AGORA_APP_ID`와 서버 인증값을 확인해 주세요.");
      }
      throw new Error("통화 연결 정보를 불러오지 못했습니다.");
    }
    return json.connection;
  }, [sessionId]);

  useEffect(() => {
    prefetchedConnectionRef.current = null;
    if (!session) return;
    if (session.sessionMode !== "direct" || !session.isMineInitiator) return;
    if (session.status !== "ringing" && session.status !== "active") return;
    let cancelled = false;
    void fetchConnection()
      .then((connection) => {
        if (!cancelled) prefetchedConnectionRef.current = connection;
      })
      .catch(() => {
        if (!cancelled) prefetchedConnectionRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [fetchConnection, session?.id, session?.isMineInitiator, session?.sessionMode, session?.status]);

  const bindRemoteVideoTrack = useCallback((track: IRemoteVideoTrack | null) => {
    remoteVideoTrackRef.current?.stop();
    remoteVideoTrackRef.current = track;
    if (remoteVideoRef.current) remoteVideoRef.current.innerHTML = "";
    if (track && remoteVideoRef.current) {
      track.play(remoteVideoRef.current, { fit: "contain", mirror: false });
      setRemoteVideoReady(true);
      return;
    }
    setRemoteVideoReady(false);
  }, []);

  const bindLocalVideoTrack = useCallback(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.innerHTML = "";
    const videoTrack = localTracksRef.current?.videoTrack ?? null;
    if (!videoTrack) {
      setLocalVideoReady(false);
      return;
    }
    videoTrack.play(localVideoRef.current, { fit: "cover", mirror: true });
    setLocalVideoReady(true);
  }, []);

  /* 영상 통화: join 직후 ref 가 붙기 전일 수 있어 iOS 등에서 로컬 미리보기가 비는 경우 보정 */
  useLayoutEffect(() => {
    if (!session || session.callKind !== "video" || !joined) return;
    bindLocalVideoTrack();
  }, [bindLocalVideoTrack, joined, session?.callKind, session?.id]);

  const joinCall = useCallback(
    async (targetSession: CommunityMessengerCallSession) => {
      if (joinedRef.current || joiningRef.current) return;
      joiningRef.current = true;
      setBusy("join");
      setErrorMessage(null);
      try {
        const connection = prefetchedConnectionRef.current ?? (await fetchConnection());
        prefetchedConnectionRef.current = null;
        const client = createCommunityMessengerAgoraClient();
        clientRef.current = client;
        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "audio" && user.audioTrack) {
            user.audioTrack.play();
            setRemoteJoined(true);
          }
          if (mediaType === "video" && user.videoTrack) {
            bindRemoteVideoTrack(user.videoTrack);
            setRemoteJoined(true);
          }
        });
        /* iOS 등에서 일시 unpublish 가 오면 '통화 중' 이 깜빡이며 join 재시도·권한 루프가 난다 — 영상 UI 만 정리 */
        client.on("user-unpublished", (_user, mediaType) => {
          if (mediaType === "video") {
            bindRemoteVideoTrack(null);
          }
        });
        client.on("user-left", () => {
          bindRemoteVideoTrack(null);
          setRemoteJoined(false);
          void refreshSession(true);
        });
        client.on("connection-state-change", (cur) => {
          if (cur === "DISCONNECTED" || cur === "DISCONNECTING") {
            void refreshSession(true);
          }
        });

        await joinCommunityMessengerAgoraChannel({
          client,
          appId: connection.appId,
          channelName: connection.channelName,
          token: connection.token,
          uid: connection.uid,
        });
        const tracks = await createCommunityMessengerAgoraLocalTracks(targetSession.callKind);
        localTracksRef.current = tracks;
        bindLocalVideoTrack();
        await publishCommunityMessengerAgoraTracks({
          client,
          tracks,
        });
        joinedRef.current = true;
        setJoined(true);
      } catch (error) {
        autoJoinBlockedRef.current = true;
        await cleanupClient();
        setErrorMessage(
          error instanceof Error && error.message.includes("Agora 설정")
            ? error.message
            : getCommunityMessengerMediaErrorMessage(error, targetSession.callKind)
        );
      } finally {
        joiningRef.current = false;
        setBusy(null);
      }
    },
    [bindLocalVideoTrack, bindRemoteVideoTrack, cleanupClient, fetchConnection, refreshSession]
  );

  const acceptIncoming = useCallback(async (): Promise<CommunityMessengerCallSession | null> => {
    const s = sessionRef.current;
    if (!s) return null;
    setBusy("accept");
    setErrorMessage(null);
    try {
      try {
        await primeCommunityMessengerDevicePermissionFromUserGesture(s.callKind);
      } catch {
        /* continue and let Agora/local device path report the real media error */
      }
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(s.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const json = (await res.json().catch(() => ({}))) as SessionResponse;
      if (!res.ok || !json.ok || !json.session) {
        setErrorMessage("통화 수락 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return null;
      }
      setSession(json.session);
      return json.session;
    } finally {
      setBusy(null);
    }
  }, []);

  const rejectIncoming = useCallback(async () => {
    if (!session) return;
    setBusy("reject");
    try {
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      await cleanupClient();
      router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`);
    } finally {
      setBusy(null);
    }
  }, [cleanupClient, router, session]);

  const endCall = useCallback(async () => {
    if (!session) return;
    setBusy("end");
    try {
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: session.status === "ringing" ? "cancel" : "end", durationSeconds: elapsedSeconds }),
      });
      await cleanupClient();
      router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`);
    } finally {
      setBusy(null);
    }
  }, [cleanupClient, elapsedSeconds, router, session]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const fromServer = initialSessionRef.current;
      const sessionUrl = `/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`;
      const tokenUrl = `/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/token`;

      const storeToken = async (res: Response) => {
        const json = (await res.json().catch(() => ({}))) as TokenResponse;
        if (res.ok && json.ok && json.connection) {
          prefetchedConnectionRef.current = json.connection;
        }
      };

      if (fromServer != null) {
        setSession(fromServer);
        setLoading(false);
        void fetch(tokenUrl, { cache: "no-store" }).then((r) => {
          if (!cancelled) void storeToken(r);
        });
        await refreshSession(true);
        return;
      }

      setLoading(true);
      try {
        const [sessionRes, tokenRes] = await Promise.all([
          fetch(sessionUrl, { cache: "no-store" }),
          fetch(tokenUrl, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const json = (await sessionRes.json().catch(() => ({}))) as SessionResponse;
        const nextSession = sessionRes.ok && json.ok && json.session ? json.session : null;
        setSession(nextSession);
        if (!nextSession) {
          setErrorMessage("통화 세션을 찾지 못했습니다.");
        }
        await storeToken(tokenRes);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
      void cleanupClient();
    };
  }, [cleanupClient, refreshSession, sessionId]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb || !sessionId) return;
    let channel: RealtimeChannel | null = null;
    channel = sb
      .channel(`community-messenger-call-session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => {
          void refreshSession(true);
        }
      )
      .subscribe();

    return () => {
      if (channel) void sb.removeChannel(channel);
    };
  }, [refreshSession, sessionId]);

  useEffect(() => {
    autoJoinBlockedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    if (!isTerminalCallSessionStatus(session.status)) return;
    void cleanupClient();
    router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`);
  }, [cleanupClient, router, session?.id, session?.roomId, session?.status]);

  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    if (isTerminalCallSessionStatus(s.status)) return;
    if (s.sessionMode !== "direct") {
      setErrorMessage("그룹 통화는 현재 준비 중입니다.");
      return;
    }
    const shouldAutoAccept = requestedAction === "accept" && !s.isMineInitiator && s.status === "ringing";
    if (shouldAutoAccept && !autoAcceptRef.current) {
      autoAcceptRef.current = true;
      void acceptIncoming().then((nextSession) => {
        if (nextSession) {
          void joinCall(nextSession);
        }
      });
      return;
    }
    if (autoJoinBlockedRef.current) return;
    if (s.isMineInitiator || s.status === "active") {
      void joinCall(s);
    }
  }, [
    acceptIncoming,
    joinCall,
    requestedAction,
    session?.id,
    session?.isMineInitiator,
    session?.sessionMode,
    session?.status,
  ]);

  useEffect(() => {
    if (!session || !joined || !session.answeredAt) return;
    const startedAt = new Date(session.answeredAt).getTime();
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [joined, session?.answeredAt]);

  useEffect(() => {
    if (!session) return;
    let ms = 2000;
    if (session.sessionMode === "direct") {
      if (session.status === "ringing") ms = 500;
      else if (session.status === "active" && joined && remoteJoined) ms = 2800;
      else if (session.status === "active" && joined) ms = 500;
      else if (session.status === "active") ms = 650;
    }
    const timer = window.setInterval(() => {
      void refreshSession(true);
    }, ms);
    return () => window.clearInterval(timer);
  }, [joined, refreshSession, remoteJoined, session?.id, session?.sessionMode, session?.status]);

  const statusLabel = useMemo(() => {
    if (!session) return "통화 준비 중";
    if (session.status === "ringing") {
      return session.isMineInitiator ? "상대방 연결 대기 중" : "수신 전화";
    }
    if (joined && remoteJoined) return "통화 중";
    if (joined) return "연결 중";
    return "통화 준비 중";
  }, [joined, remoteJoined, session]);

  if (loading && !session) {
    return (
      <div className="flex min-h-full min-h-0 flex-1 flex-col items-center justify-center bg-[#020617] px-4 text-[14px] text-white/55">
        통화방을 여는 중입니다…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[18px] font-semibold text-gray-900">통화 세션을 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={() => router.replace("/community-messenger")}
          className="rounded-2xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
        >
          메신저로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full min-h-0 flex-1 flex-col bg-[#020617] text-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[520px] flex-1 flex-col px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
      <header className="flex shrink-0 items-center justify-between py-4">
        <button
          type="button"
          onClick={() => router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`)}
          className="rounded-full border border-white/15 px-3 py-2 text-[12px] font-medium text-white/85"
        >
          채팅으로
        </button>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold">
          {session.callKind === "video" ? "영상 통화" : "음성 통화"}
        </span>
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="shrink-0 pt-4 text-center">
          <p className="text-[30px] font-semibold">{session.peerLabel}</p>
          <p className="mt-2 text-[14px] text-white/70">{statusLabel}</p>
          {joined && session.status === "active" ? (
            <p className="mt-3 text-[13px] font-semibold text-[#86EFAC]">{formatDuration(elapsedSeconds)}</p>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 items-center justify-center py-4 sm:py-6">
          {session.callKind === "video" ? (
            <div className="grid w-full gap-3">
              <div className="overflow-hidden rounded-[28px] bg-black">
                <div ref={remoteVideoRef} className="h-[280px] w-full bg-black" />
                {!remoteVideoReady ? (
                  <div className="-mt-[280px] flex h-[280px] items-center justify-center bg-[radial-gradient(circle_at_top,#1f2937,#020617)] text-[13px] text-white/70">
                    {remoteJoined ? "상대 영상 연결 중..." : "상대방 참여를 기다리는 중입니다."}
                  </div>
                ) : null}
              </div>
              <div className="overflow-hidden rounded-[24px] bg-black">
                <div ref={localVideoRef} className="h-[120px] w-full bg-black" />
                {!localVideoReady ? (
                  <div className="-mt-[120px] flex h-[120px] items-center justify-center bg-[radial-gradient(circle_at_top,#1f2937,#020617)] text-[12px] text-white/65">
                    내 카메라 준비 중
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex h-[min(52vw,280px)] w-[min(52vw,280px)] min-h-[200px] min-w-[200px] items-center justify-center rounded-full bg-[#06C755]/20 text-[clamp(28px,9vw,44px)] font-semibold text-[#86EFAC]">
              MIC
            </div>
          )}
        </div>
      </main>

      <div className="mx-auto w-full max-w-[420px] shrink-0 border-t border-white/[0.06] bg-[#020617] pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+5.5rem))] pt-3">
        {errorMessage ? (
          <div className="mb-4 rounded-3xl bg-white/10 p-4">
            <p className="text-[13px] font-semibold text-[#FECACA]">{errorMessage}</p>
            <p className="mt-2 text-[12px] leading-5 text-white/70">{permissionGuide?.description}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!session) return;
                  autoJoinBlockedRef.current = false;
                  void acceptIncoming().then((nextSession) => {
                    if (nextSession) {
                      void joinCall(nextSession);
                    }
                  });
                }}
                disabled={busy === "accept" || busy === "join"}
                className="flex-1 rounded-2xl bg-white px-4 py-3 text-[13px] font-semibold text-[#111827] disabled:opacity-40"
              >
                다시 시도
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!openCommunityMessengerPermissionSettings()) {
                    window.alert("브라우저 주소창 왼쪽 사이트 설정에서 카메라/마이크 권한을 허용해 주세요.");
                  }
                }}
                className="rounded-2xl border border-white/15 px-4 py-3 text-[13px] font-medium text-white"
              >
                권한 안내
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          {!session.isMineInitiator && session.status === "ringing" && !joined ? (
            <>
              <button
                type="button"
                onClick={() => void rejectIncoming()}
                disabled={busy === "reject"}
                className="rounded-2xl border border-white/15 px-4 py-3 text-[14px] font-medium text-white/80 disabled:opacity-40"
              >
                거절
              </button>
              <button
                type="button"
                onClick={() => {
                  autoJoinBlockedRef.current = false;
                  void acceptIncoming().then((nextSession) => {
                    if (nextSession) {
                      void joinCall(nextSession);
                    }
                  });
                }}
                disabled={busy === "accept" || busy === "join"}
                className="flex-1 rounded-2xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
              >
                {busy === "accept" || busy === "join" ? "연결 중..." : "수락"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void endCall()}
              disabled={busy === "end"}
              className="flex-1 rounded-2xl bg-[#ef4444] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
            >
              통화 종료
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function formatDuration(value: number) {
  const total = Math.max(0, Math.floor(value));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
