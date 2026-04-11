"use client";

import type {
  ICameraVideoTrack,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalVideoTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  closeCommunityMessengerAgoraTracks,
  createCommunityMessengerAgoraClient,
  createCommunityMessengerAgoraLocalTracks,
  joinCommunityMessengerAgoraChannel,
  listCommunityMessengerCameras,
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
import {
  attachDetachedCommunityCall,
  takeDetachedCommunityCallCleanup,
} from "@/lib/community-messenger/direct-call-minimize";

type SessionResponse = { ok?: boolean; session?: CommunityMessengerCallSession; error?: string };
type TokenResponse = { ok?: boolean; connection?: CommunityMessengerManagedCallConnection; error?: string };

function isTerminalCallSessionStatus(status: CommunityMessengerCallSession["status"]): boolean {
  return status === "ended" || status === "cancelled" || status === "rejected" || status === "missed";
}

function isCameraVideoTrackWithDevice(track: ILocalVideoTrack | null): track is ICameraVideoTrack {
  return !!track && typeof (track as ICameraVideoTrack).setDevice === "function";
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
  const [layoutSwapped, setLayoutSwapped] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraSwitchSupported, setCameraSwitchSupported] = useState(false);
  /** PiP 드래그 후 픽셀 위치(null 이면 좌하단 기본 배치) */
  const [pipPixelPosition, setPipPixelPosition] = useState<{ left: number; top: number } | null>(null);
  const largeVideoRef = useRef<HTMLDivElement | null>(null);
  const smallVideoRef = useRef<HTMLDivElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const pipWrapRef = useRef<HTMLDivElement | null>(null);
  const pipDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const layoutSwappedRef = useRef(false);
  const useRearFacingRef = useRef(false);
  layoutSwappedRef.current = layoutSwapped;
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
  /** true면 채팅으로 돌아가기(미니화) 중이라 언마운트 시 Agora 정리를 하지 않는다 */
  const callMinimizeNavRef = useRef(false);
  /** silent 세션 GET 이 동시에 여러 번 호출될 때(폴링+Realtime) 한 번의 네트워크로 합친다 */
  const refreshSilentInFlightRef = useRef<Promise<CommunityMessengerCallSession | null> | null>(null);
  /** postgres_changes 연속 이벤트로 GET 이 폭주하지 않게 묶는다 */
  const sessionRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const permissionGuide = session ? getCommunityMessengerPermissionGuide(session.callKind) : null;

  const refreshSession = useCallback(
    async (silent = false): Promise<CommunityMessengerCallSession | null> => {
      if (silent && refreshSilentInFlightRef.current) {
        return refreshSilentInFlightRef.current;
      }
      const run = async (): Promise<CommunityMessengerCallSession | null> => {
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
      };
      if (silent) {
        const p = run();
        refreshSilentInFlightRef.current = p;
        void p.finally(() => {
          if (refreshSilentInFlightRef.current === p) refreshSilentInFlightRef.current = null;
        });
        return p;
      }
      return run();
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
    if (largeVideoRef.current) largeVideoRef.current.innerHTML = "";
    if (smallVideoRef.current) smallVideoRef.current.innerHTML = "";
    setLayoutSwapped(false);
    setCamOff(false);
    setMicMuted(false);
    setPipPixelPosition(null);
    useRearFacingRef.current = false;
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

  const disposeCallMedia = useCallback(async () => {
    const sid = sessionRef.current?.id;
    if (sid) {
      const taken = takeDetachedCommunityCallCleanup(sid);
      if (taken) {
        await taken();
        return;
      }
    }
    await cleanupClient();
  }, [cleanupClient]);

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
    const swapped = layoutSwappedRef.current;
    const remoteEl = swapped ? smallVideoRef.current : largeVideoRef.current;
    if (remoteEl) remoteEl.innerHTML = "";
    if (track && remoteEl) {
      /* 큰·작은 슬롯 모두 영역을 꽉 채움(상하 우선 시 좌우 크롭). */
      track.play(remoteEl, { fit: "cover", mirror: false });
      setRemoteVideoReady(true);
      return;
    }
    setRemoteVideoReady(false);
  }, []);

  const bindLocalVideoTrack = useCallback(() => {
    const videoTrack = localTracksRef.current?.videoTrack ?? null;
    const swapped = layoutSwappedRef.current;
    const localEl = swapped ? largeVideoRef.current : smallVideoRef.current;
    if (localEl) localEl.innerHTML = "";
    if (!videoTrack || !localEl) {
      setLocalVideoReady(false);
      return;
    }
    /* setEnabled(false) 직후에도 play 하면 마지막 프레임이 남을 수 있어 enabled 일 때만 붙인다 */
    if (!videoTrack.enabled) {
      setLocalVideoReady(false);
      return;
    }
    videoTrack.play(localEl, { fit: "cover", mirror: true });
    setLocalVideoReady(true);
  }, []);

  /* 레이아웃 전환·join 직후: 양쪽 슬롯에 트랙을 다시 붙인다 */
  useLayoutEffect(() => {
    if (!session || session.callKind !== "video" || !joined) return;
    const remote = remoteVideoTrackRef.current;
    const local = localTracksRef.current?.videoTrack ?? null;
    remote?.stop();
    local?.stop();
    const remoteEl = layoutSwapped ? smallVideoRef.current : largeVideoRef.current;
    const localEl = layoutSwapped ? largeVideoRef.current : smallVideoRef.current;
    if (remoteEl) remoteEl.innerHTML = "";
    if (localEl) localEl.innerHTML = "";
    if (remote && remoteEl) {
      remote.play(remoteEl, { fit: "cover", mirror: false });
      setRemoteVideoReady(true);
    } else {
      setRemoteVideoReady(false);
    }
    if (local && localEl) {
      if (local.enabled) {
        local.play(localEl, { fit: "cover", mirror: true });
        setLocalVideoReady(true);
      } else {
        setLocalVideoReady(false);
      }
    } else {
      setLocalVideoReady(false);
    }
  }, [layoutSwapped, joined, session?.callKind, session?.id]);

  const switchCameraFacing = useCallback(async () => {
    const v = localTracksRef.current?.videoTrack;
    if (!v || !isCameraVideoTrackWithDevice(v)) return;
    setBusy("camera");
    try {
      useRearFacingRef.current = !useRearFacingRef.current;
      await v.setDevice({ facingMode: useRearFacingRef.current ? "environment" : "user" });
    } catch {
      useRearFacingRef.current = !useRearFacingRef.current;
      try {
        const list = await listCommunityMessengerCameras();
        if (list.length < 2) return;
        const cur = v.getMediaStreamTrack().getSettings().deviceId;
        const next = list.find((d) => d.deviceId !== cur) ?? list[1];
        await v.setDevice(next.deviceId);
        /* deviceId 로 전환되면 실제 전후면과 facing 추적이 어긋날 수 있어 다음 번은 목록 기준으로만 맞춘다 */
        useRearFacingRef.current = false;
      } catch {
        /* ignore */
      }
    } finally {
      bindLocalVideoTrack();
      setBusy(null);
    }
  }, [bindLocalVideoTrack]);

  const toggleCamEnabled = useCallback(async () => {
    const v = localTracksRef.current?.videoTrack;
    if (!v) return;
    const nextOff = !camOff;
    setCamOff(nextOff);
    try {
      await v.setEnabled(!nextOff);
      bindLocalVideoTrack();
    } catch {
      setCamOff(!nextOff);
    }
  }, [bindLocalVideoTrack, camOff]);

  const toggleMicEnabled = useCallback(async () => {
    const a = localTracksRef.current?.audioTrack;
    if (!a) return;
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);
    try {
      await a.setEnabled(!nextMuted);
    } catch {
      setMicMuted(!nextMuted);
    }
  }, [micMuted]);

  useEffect(() => {
    setPipPixelPosition(null);
  }, [sessionId]);

  useEffect(() => {
    setPipPixelPosition(null);
  }, [layoutSwapped]);

  const clampPipToStage = useCallback(() => {
    const stage = videoStageRef.current;
    const pip = pipWrapRef.current;
    if (!stage || !pip) return;
    const pad = 8;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const pw = pip.offsetWidth;
    const ph = pip.offsetHeight;
    if (pw <= 0 || ph <= 0) return;
    const maxL = Math.max(pad, sw - pw - pad);
    const maxT = Math.max(pad, sh - ph - pad);
    setPipPixelPosition((prev) => {
      if (!prev) return prev;
      return {
        left: Math.min(maxL, Math.max(pad, prev.left)),
        top: Math.min(maxT, Math.max(pad, prev.top)),
      };
    });
  }, []);

  useEffect(() => {
    if (pipPixelPosition === null) return;
    const onResize = () => clampPipToStage();
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    const el = videoStageRef.current;
    if (el && ro) ro.observe(el);
    onResize();
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [pipPixelPosition, clampPipToStage]);

  const onPipPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const stage = videoStageRef.current;
      const pip = pipWrapRef.current;
      if (!stage || !pip) return;
      e.preventDefault();
      const stageRect = stage.getBoundingClientRect();
      const pipRect = pip.getBoundingClientRect();
      const left = pipPixelPosition?.left ?? pipRect.left - stageRect.left;
      const top = pipPixelPosition?.top ?? pipRect.top - stageRect.top;
      pipDragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startLeft: left,
        startTop: top,
      };
      setPipPixelPosition({ left, top });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pipPixelPosition]
  );

  const onPipPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = pipDragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const stage = videoStageRef.current;
    const pip = pipWrapRef.current;
    if (!stage || !pip) return;
    e.preventDefault();
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    const pad = 8;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const pw = pip.offsetWidth;
    const ph = pip.offsetHeight;
    if (pw <= 0 || ph <= 0) return;
    let left = d.startLeft + dx;
    let top = d.startTop + dy;
    left = Math.min(Math.max(pad, left), Math.max(pad, sw - pw - pad));
    top = Math.min(Math.max(pad, top), Math.max(pad, sh - ph - pad));
    setPipPixelPosition({ left, top });
  }, []);

  const onPipPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = pipDragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    pipDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

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
    [bindRemoteVideoTrack, cleanupClient, fetchConnection, refreshSession]
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
      const json = (await res.json().catch(() => ({}))) as SessionResponse & { error?: string };
      if (!res.ok || !json.ok || !json.session) {
        const code = json.error;
        const msg =
          code === "bad_action"
            ? "이미 종료되었거나 수락할 수 없는 통화입니다."
            : code === "forbidden"
              ? "이 통화에 참여할 권한이 없습니다."
              : code === "session_required"
                ? "통화 정보를 찾을 수 없습니다."
                : "통화 수락 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
        setErrorMessage(msg);
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
      await disposeCallMedia();
      router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`);
    } finally {
      setBusy(null);
    }
  }, [disposeCallMedia, router, session]);

  const endCall = useCallback(async () => {
    if (!session) return;
    setBusy("end");
    try {
      await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: session.status === "ringing" ? "cancel" : "end", durationSeconds: elapsedSeconds }),
      });
      await disposeCallMedia();
      router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`);
    } finally {
      setBusy(null);
    }
  }, [disposeCallMedia, elapsedSeconds, router, session]);

  const navigateToChatDuringCall = useCallback(() => {
    if (!session) return;
    const keepMediaConnected = joined || session.status === "active";
    if (keepMediaConnected) {
      attachDetachedCommunityCall(session.id, cleanupClient);
      callMinimizeNavRef.current = true;
      try {
        sessionStorage.setItem("cm_minimized_call_session", session.id);
        sessionStorage.setItem("cm_minimized_call_room", session.roomId);
      } catch {
        /* ignore */
      }
    }
    router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`);
  }, [cleanupClient, joined, router, session]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const prevDetached = takeDetachedCommunityCallCleanup(sessionId);
      if (prevDetached) {
        await prevDetached();
      }
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
        /* RSC initialSession 과 중복 대기하지 않음 — 백그라운드로만 최신화 */
        void refreshSession(true);
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
      if (callMinimizeNavRef.current) {
        callMinimizeNavRef.current = false;
        return;
      }
      void disposeCallMedia();
    };
  }, [disposeCallMedia, refreshSession, sessionId]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb || !sessionId) return;
    let channel: RealtimeChannel | null = null;
    const scheduleRefresh = () => {
      if (sessionRealtimeDebounceRef.current) clearTimeout(sessionRealtimeDebounceRef.current);
      sessionRealtimeDebounceRef.current = setTimeout(() => {
        sessionRealtimeDebounceRef.current = null;
        void refreshSession(true);
      }, 320);
    };
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
          scheduleRefresh();
        }
      )
      .subscribe();

    return () => {
      if (sessionRealtimeDebounceRef.current) {
        clearTimeout(sessionRealtimeDebounceRef.current);
        sessionRealtimeDebounceRef.current = null;
      }
      if (channel) void sb.removeChannel(channel);
    };
  }, [refreshSession, sessionId]);

  useEffect(() => {
    autoJoinBlockedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    if (!isTerminalCallSessionStatus(session.status)) return;
    const room = session.roomId;
    void disposeCallMedia().then(() => {
      try {
        sessionStorage.removeItem("cm_minimized_call_session");
        sessionStorage.removeItem("cm_minimized_call_room");
      } catch {
        /* ignore */
      }
      router.replace(`/community-messenger/rooms/${encodeURIComponent(room)}`);
    });
  }, [disposeCallMedia, router, session?.id, session?.roomId, session?.status]);

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
          return;
        }
        /* 수락 API 실패 시 한 번만 막아 둔 플래그를 풀어, 화면에서 「수락」 재시도가 가능하게 한다 */
        autoAcceptRef.current = false;
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
    if (!joined || !session || session.callKind !== "video") {
      setCameraSwitchSupported(false);
      return;
    }
    setCameraSwitchSupported(isCameraVideoTrackWithDevice(localTracksRef.current?.videoTrack ?? null));
  }, [joined, session?.callKind, session?.id, localVideoReady]);

  useEffect(() => {
    if (!session) return;
    let ms = 2000;
    if (session.sessionMode === "direct") {
      /* 수신/발신 벨 단계: 서버 부하 완화(Realtime 이 보조). 연결 후는 드물게만 폴링 */
      if (session.status === "ringing") ms = 750;
      else if (session.status === "active" && joined && remoteJoined) ms = 3200;
      else if (session.status === "active" && joined) ms = 650;
      else if (session.status === "active") ms = 800;
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

  const largeShowsRemote = !layoutSwapped;
  const showLargeVideoOverlay =
    session?.callKind === "video" &&
    (largeShowsRemote ? !remoteVideoReady : !localVideoReady || camOff);
  const showSmallVideoOverlay =
    session?.callKind === "video" &&
    (largeShowsRemote ? !localVideoReady || camOff : !remoteVideoReady);

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
          className="rounded-ui-rect bg-gray-900 px-4 py-3 text-[14px] font-semibold text-white"
        >
          메신저로 돌아가기
        </button>
      </div>
    );
  }

  const videoCall = session.callKind === "video";
  const pipLabelSmall = largeShowsRemote ? "나" : session.peerLabel;

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col text-white ${
        videoCall ? "h-full min-h-0 bg-black" : "min-h-full bg-[#020617]"
      }`}
    >
      <div
        className={
          videoCall
            ? "relative flex h-full min-h-0 w-[100dvw] max-w-[100dvw] min-w-0 flex-1 flex-col ml-[calc(50%-50dvw)] sm:mx-auto sm:w-full sm:max-w-[480px] sm:px-3"
            : "mx-auto flex min-h-0 w-full max-w-[520px] flex-1 flex-col px-4 pt-[calc(env(safe-area-inset-top)+12px)]"
        }
      >
        {!videoCall ? (
          <header className="flex shrink-0 items-center justify-between py-4">
            <button
              type="button"
              onClick={() => navigateToChatDuringCall()}
              className="rounded-full border border-white/15 px-3 py-2 text-[12px] font-medium text-white/85"
            >
              채팅으로
            </button>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold">음성 통화</span>
          </header>
        ) : null}

        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${videoCall ? "overflow-hidden pt-0 sm:pt-2" : "overflow-y-auto"}`}
        >
          {!videoCall ? (
            <div className="shrink-0 pt-4 text-center">
              <p className="text-[30px] font-semibold">{session.peerLabel}</p>
              <p className="mt-2 text-[14px] text-white/70">{statusLabel}</p>
              {joined && session.status === "active" ? (
                <p className="mt-3 text-[13px] font-semibold text-white/80">{formatDuration(elapsedSeconds)}</p>
              ) : null}
            </div>
          ) : null}

          <div
            className={
              videoCall
                ? "flex min-h-0 w-full flex-1 flex-col"
                : "mx-auto flex w-full max-w-[420px] flex-1 flex-col py-4 sm:py-6"
            }
          >
          {session.callKind === "video" ? (
            <div
              ref={videoStageRef}
              className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none bg-neutral-950 shadow-none ring-0 sm:min-h-[min(64dvh,600px)] sm:rounded-ui-rect sm:shadow-[0_8px_40px_rgba(0,0,0,0.45)] sm:ring-1 sm:ring-white/[0.08]"
            >
              {/* 카카오 페이스톤형 상단 정보 오버레이 */}
              <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-3 pb-10 pt-[max(0.25rem,env(safe-area-inset-top))]">
                <div className="pointer-events-none min-w-0 flex-1 pt-1">
                  <p className="truncate text-[15px] font-semibold leading-tight tracking-tight text-white drop-shadow-md">
                    {session.peerLabel}
                  </p>
                  <p className="mt-0.5 text-[12px] tabular-nums text-white/90">
                    {joined && session.status === "active" ? formatDuration(elapsedSeconds) : statusLabel}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/65">1:1 · 참여 2</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!openCommunityMessengerPermissionSettings()) {
                        window.alert(permissionGuide?.description ?? "브라우저 설정에서 카메라·마이크를 허용해 주세요.");
                      }
                    }}
                    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md ring-1 ring-white/15 transition active:scale-[0.96]"
                    aria-label="통화 설정·권한"
                    title="카메라·마이크 권한"
                  >
                    <SettingsGearIcon className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.alert(
                        "스피커·이어폰 전환은 기기(휴대폰·PC)의 볼륨·오디오 출력 설정에서 조절할 수 있습니다."
                      )
                    }
                    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md ring-1 ring-white/15 transition active:scale-[0.96]"
                    aria-label="스피커 안내"
                    title="출력 음량·스피커"
                  >
                    <SpeakerIcon className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToChatDuringCall()}
                    className="pointer-events-auto rounded-full bg-black/40 px-3 py-1.5 text-[11px] font-medium text-white/95 backdrop-blur-md ring-1 ring-white/15 transition active:scale-[0.97]"
                  >
                    채팅으로
                  </button>
                </div>
              </div>

              {joined ? (
                <button
                  type="button"
                  onClick={() => setLayoutSwapped((v) => !v)}
                  className="pointer-events-auto absolute right-2 top-[3.25rem] z-[28] flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/95 shadow-md backdrop-blur-md ring-1 ring-white/12 transition active:scale-95 sm:top-[3.5rem]"
                  aria-label="큰 화면과 작은 화면 바꾸기"
                  title="화면 전환"
                >
                  <ExpandSwapCornerIcon className="h-[17px] w-[17px]" />
                </button>
              ) : null}

              <div className="absolute inset-0 bg-black">
                <div
                  ref={largeVideoRef}
                  className="h-full w-full bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:min-h-0 [&_video]:min-w-0 [&_video]:!object-cover"
                />
                {showLargeVideoOverlay ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[radial-gradient(circle_at_top,#1f2937,#020617)] px-4 text-center text-[13px] text-white/75">
                    {largeShowsRemote ? (
                      <>
                        <p>{remoteJoined ? "상대 영상 연결 중…" : "상대방 참여를 기다리는 중입니다."}</p>
                        <p className="text-[11px] text-white/45">큰 화면 · 상대</p>
                      </>
                    ) : camOff ? (
                      <>
                        <p>카메라가 꺼져 있습니다</p>
                        <p className="text-[11px] text-white/45">큰 화면 · 나</p>
                      </>
                    ) : (
                      <>
                        <p>내 카메라 준비 중</p>
                        <p className="text-[11px] text-white/45">큰 화면 · 나</p>
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              {joined && largeShowsRemote && remoteVideoReady && !showLargeVideoOverlay ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-3 pt-14 text-center sm:pb-4">
                  <p className="truncate text-[13px] font-medium text-white drop-shadow-sm">{session.peerLabel}</p>
                </div>
              ) : null}

              <div
                ref={pipWrapRef}
                className={`absolute z-20 w-[20%] min-w-[76px] max-w-[124px] overflow-hidden rounded-ui-rect border border-white/20 bg-black shadow-[0_6px_24px_rgba(0,0,0,0.5)] sm:w-[21%] sm:min-w-[84px] sm:max-w-[136px] sm:rounded-ui-rect ${
                  pipPixelPosition
                    ? "right-auto bottom-auto"
                    : joined
                      ? "bottom-[6.5rem] left-3 sm:bottom-[7rem] sm:left-4"
                      : "bottom-[4.25rem] left-3 sm:bottom-[4.5rem] sm:left-4"
                }`}
                style={{
                  aspectRatio: "9 / 16",
                  ...(pipPixelPosition
                    ? { left: pipPixelPosition.left, top: pipPixelPosition.top }
                    : undefined),
                }}
                aria-label="작은 화면 — 드래그하여 위치 이동"
                role="group"
              >
                <div
                  ref={smallVideoRef}
                  className="pointer-events-none h-full w-full bg-black [&_video]:pointer-events-none [&_video]:object-cover"
                />
                {showSmallVideoOverlay ? (
                  <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-0.5 bg-[radial-gradient(circle_at_top,#1f2937,#020617)] px-2 pb-6 text-center text-[11px] leading-snug text-white/72">
                    {largeShowsRemote ? (
                      camOff ? (
                        <>
                          <CamOffSmallIcon className="mx-auto h-6 w-6 text-white/50" />
                          <span>카메라 꺼짐</span>
                        </>
                      ) : (
                        <span>내 카메라 준비 중</span>
                      )
                    ) : (
                      <span>{remoteJoined ? "상대 영상 연결 중…" : "상대 대기"}</span>
                    )}
                  </div>
                ) : null}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1] bg-black/60 py-1 text-center text-[10px] font-medium text-white/95 backdrop-blur-[2px]">
                  <span className="block truncate px-1">{pipLabelSmall}</span>
                </div>
                <div
                  className="absolute inset-0 z-[2] cursor-grab touch-none select-none active:cursor-grabbing"
                  onPointerDown={onPipPointerDown}
                  onPointerMove={onPipPointerMove}
                  onPointerUp={onPipPointerUp}
                  onPointerCancel={onPipPointerUp}
                  onLostPointerCapture={() => {
                    pipDragRef.current = null;
                  }}
                  aria-hidden
                />
              </div>
            </div>
          ) : (
            <div className="flex h-[min(52vw,280px)] w-[min(52vw,280px)] min-h-[200px] min-w-[200px] items-center justify-center rounded-full bg-white/10 text-[clamp(28px,9vw,44px)] font-semibold text-white/85">
              MIC
            </div>
          )}
        </div>
      </main>

      <div
        className={
          videoCall
            ? "w-full shrink-0 border-t border-white/[0.08] bg-black/85 px-3 pb-[max(0.5rem,calc(env(safe-area-inset-bottom,0px)+0.35rem))] pt-2 backdrop-blur-md"
            : "mx-auto w-full max-w-[420px] shrink-0 border-t border-white/[0.06] bg-[#020617] pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+5.5rem))] pt-3"
        }
      >
        {errorMessage ? (
          <div className="mb-4 rounded-ui-rect bg-white/10 p-4">
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
                className="flex-1 rounded-ui-rect bg-white px-4 py-3 text-[13px] font-semibold text-[#111827] disabled:opacity-40"
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
                className="rounded-ui-rect border border-white/15 px-4 py-3 text-[13px] font-medium text-white"
              >
                권한 안내
              </button>
            </div>
          </div>
        ) : null}

        {session.callKind === "video" && joined ? (
          <div className="mb-1 flex items-end justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setLayoutSwapped((v) => !v)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/50 text-white shadow-md ring-1 ring-white/12 backdrop-blur-md transition active:scale-95"
              aria-label="큰 화면과 작은 화면 바꾸기"
              title="화면 크기 전환"
            >
              <SwapVideoLayoutIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void toggleMicEnabled()}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-md ring-1 backdrop-blur-md transition active:scale-95 ${
                micMuted
                  ? "bg-rose-500/35 text-white ring-rose-400/40"
                  : "bg-black/50 text-white ring-white/12"
              }`}
              aria-label={micMuted ? "마이크 켜기" : "마이크 끄기"}
            >
              {micMuted ? <MicOffToolbarIcon className="h-5 w-5" /> : <MicOnToolbarIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => void endCall()}
              disabled={busy === "end"}
              className="flex h-[3.7rem] w-[3.7rem] shrink-0 items-center justify-center rounded-full bg-[#ea3838] text-white shadow-lg shadow-red-900/40 transition active:scale-95 disabled:opacity-45 sm:h-16 sm:w-16"
              aria-label="통화 종료"
            >
              <HangUpToolbarIcon className="h-7 w-7 sm:h-8 sm:w-8" />
            </button>
            <button
              type="button"
              onClick={() => void switchCameraFacing()}
              disabled={!cameraSwitchSupported || busy === "camera"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/50 text-white shadow-md ring-1 ring-white/12 backdrop-blur-md transition active:scale-95 disabled:opacity-35"
              aria-label="카메라 전환"
              title={cameraSwitchSupported ? "전면·후면 카메라 전환" : "이 연결에서는 카메라 전환이 지원되지 않습니다"}
            >
              <SwitchCameraIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void toggleCamEnabled()}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-md ring-1 backdrop-blur-md transition active:scale-95 ${
                camOff ? "bg-amber-500/30 text-white ring-amber-400/35" : "bg-black/50 text-white ring-white/12"
              }`}
              aria-label={camOff ? "카메라 켜기" : "카메라 끄기"}
            >
              {camOff ? <CamOffToolbarIcon className="h-5 w-5" /> : <CamOnToolbarIcon className="h-5 w-5" />}
            </button>
          </div>
        ) : null}

        {!(session.callKind === "video" && joined) ? (
          <div className="flex gap-2">
            {!session.isMineInitiator && session.status === "ringing" && !joined ? (
              <>
                <button
                  type="button"
                  onClick={() => void rejectIncoming()}
                  disabled={busy === "reject"}
                  className="rounded-ui-rect border border-white/15 px-4 py-3 text-[14px] font-medium text-white/80 disabled:opacity-40"
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
                  className="flex-1 rounded-ui-rect bg-gray-900 px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  {busy === "accept" || busy === "join" ? "연결 중..." : "수락"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void endCall()}
                disabled={busy === "end"}
                className="flex-1 rounded-ui-rect bg-[#ef4444] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
              >
                통화 종료
              </button>
            )}
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}

function SettingsGearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="3" strokeLinecap="round" />
      <path
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a9 9 0 0 1 0 14.14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandSwapCornerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" aria-hidden>
      <path d="M9 3H3v6M15 21h6v-6M21 3l-6 6M3 21l6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HangUpToolbarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-4.41 3.59-8 8-8s8 3.59 8 8c0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
    </svg>
  );
}

function SwapVideoLayoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M7 16V4M7 4L3 8M7 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8v12m0 0l4-4m-4 4l-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="10" width="8" height="6" rx="1" opacity="0.35" />
    </svg>
  );
}

function SwitchCameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M4 10a2 2 0 0 1 2-2h2l1.5-2h5L16 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8z"
        strokeLinejoin="round"
      />
      <path d="M12 14a3 3 0 1 0 0 .01" strokeLinecap="round" />
      <path d="M20 6l2-2M20 6l-2-2M20 6h-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CamOffSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 8h4l2-2h4l2 2h4v10H4V8z" strokeLinejoin="round" />
      <path d="M2 22L20 4" strokeLinecap="round" />
    </svg>
  );
}

function CamOnToolbarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 9a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  );
}

function CamOffToolbarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 9a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" strokeLinejoin="round" opacity="0.5" />
      <path d="M3 21L18 6" strokeLinecap="round" />
    </svg>
  );
}

function MicOnToolbarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" strokeLinejoin="round" />
      <path d="M8 11v1a4 4 0 0 0 8 0v-1M12 18v3M9 21h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicOffToolbarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" strokeLinejoin="round" opacity="0.45" />
      <path d="M8 11v1a4 4 0 0 0 8 0v-1M12 18v3M9 21h6" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
      <path d="M3 3l18 18" strokeLinecap="round" />
    </svg>
  );
}

function formatDuration(value: number) {
  const total = Math.max(0, Math.floor(value));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
