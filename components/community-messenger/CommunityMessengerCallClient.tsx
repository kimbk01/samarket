"use client";

import type {
  ICameraVideoTrack,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalVideoTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CommunityMessengerAgoraLocalTracks } from "@/lib/community-messenger/call-provider/client";

/** Agora 번들은 수 MB — 정적 import 시 통화 페이지 첫 페인트·파싱이 지연된다. 조인 직전에만 로드한다. */
async function loadCommunityMessengerCallProvider() {
  return import("@/lib/community-messenger/call-provider/client");
}
import {
  markCommunityMessengerMediaTrustedOnce,
  openCommunityMessengerPermissionSettings,
  primeCommunityMessengerDevicePermissionFromUserGesture,
  shouldSkipCallerMediaGateOverlay,
} from "@/lib/community-messenger/call-permission";
import {
  COMMUNITY_MESSENGER_AGORA_SETUP_REQUIRED_MESSAGE,
  COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC,
  COMMUNITY_MESSENGER_INSECURE_ORIGIN_MEDIA_HINT,
  getCommunityMessengerMediaErrorMessage,
  isAgoraJoinRetryableError,
  isCommunityMessengerMediaBlockedByInsecureOrigin,
} from "@/lib/community-messenger/media-errors";
import type {
  CommunityMessengerCallSession,
  CommunityMessengerManagedCallConnection,
} from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  playCommunityMessengerCallSignalSound,
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallFeedback,
} from "@/lib/community-messenger/call-feedback-sound";
import {
  attachDetachedCommunityCall,
  takeDetachedCommunityCallCleanup,
} from "@/lib/community-messenger/direct-call-minimize";
import { isCommunityMessengerAgoraAppConfigured } from "@/lib/community-messenger/call-provider/client-runtime";
import { formatMessengerAgoraLastMileLine } from "@/lib/community-messenger/call-provider/agora-network-quality";
import { applyAgoraRemoteSpeakerPreference } from "@/lib/community-messenger/call-provider/agora-playback-routing";
import { CallScreenShell, MESSENGER_CALL_GRADIENT_SURFACE } from "@/components/community-messenger/call-ui/CallScreenShell";
import { MessengerCallDialingLayout } from "@/components/community-messenger/call-ui/MessengerCallDialingLayout";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { consumeCommunityMessengerCallNavigationSeed } from "@/lib/community-messenger/call-session-navigation-seed";

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
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const speakerEnabledRef = useRef(true);
  speakerEnabledRef.current = speakerEnabled;
  const [bluetoothPreferred, setBluetoothPreferred] = useState(false);
  const [cameraSwitchSupported, setCameraSwitchSupported] = useState(false);
  /** Agora last-mile `network-quality` 기반(고정 문구 대신 실측) */
  const [lastMileLine, setLastMileLine] = useState("네트워크 품질 · 확인 중");
  const lastMileToneClass = useMemo(() => {
    if (/끊김|나쁨/.test(lastMileLine)) return "text-amber-400/95";
    if (/불안정|보통|다소/.test(lastMileLine)) return "text-yellow-200/90";
    return "text-emerald-400/95";
  }, [lastMileLine]);
  /** PiP 드래그 후 픽셀 위치(null 이면 좌하단 기본 배치) */
  const [pipPixelPosition, setPipPixelPosition] = useState<{ left: number; top: number } | null>(null);
  /** Viber 스타일 자판(로컬 DTMF 톤) */
  const [callKeypadOpen, setCallKeypadOpen] = useState(false);
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
  const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);
  const joinedRef = useRef(false);
  const joiningRef = useRef(false);
  const autoAcceptRef = useRef(false);
  const prefetchedConnectionRef = useRef<CommunityMessengerManagedCallConnection | null>(null);
  const initialSessionRef = useRef(initialSession);
  initialSessionRef.current = initialSession;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const autoJoinBlockedRef = useRef(false);
  /**
   * 발신( initiator ): 브라우저는 마이크·카메라를 사용자 제스처 없이 열지 못하는 경우가 많아,
   * 「허용하고 연결」 확인 후에만 Agora 조인한다. 수신은 수락 버튼·자동수락 경로에서 이미 제스처가 있다.
   */
  const [callerMediaConsentDone, setCallerMediaConsentDone] = useState(
    () => !(initialSession?.isMineInitiator ?? false)
  );
  /** true면 채팅으로 돌아가기(미니화) 중이라 언마운트 시 Agora 정리를 하지 않는다 */
  const callMinimizeNavRef = useRef(false);
  /** silent 세션 GET 이 동시에 여러 번 호출될 때(폴링+Realtime) 한 번의 네트워크로 합친다 */
  const refreshSilentInFlightRef = useRef<Promise<CommunityMessengerCallSession | null> | null>(null);
  /** postgres_changes 연속 이벤트로 GET 이 폭주하지 않게 묶는다 */
  const sessionRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 터미널 상태 전환 시에만 부재/종료 사운드(초기 로드 시 이미 종료된 세션은 제외) */
  const callTerminalSoundPrevRef = useRef<{ id: string; status: CommunityMessengerCallSession["status"] } | null>(null);
  /** Peer upgraded session to video — publish local camera once (cleared on failure / new session). */
  const autoVideoPublishAttemptedRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    stopCommunityMessengerCallFeedback();
  }, [sessionId]);

  useEffect(() => {
    autoVideoPublishAttemptedRef.current = null;
  }, [sessionId]);

  /** 발신 직후 네비게이션 시드 — RSC/GET 전에 세션을 채워 로딩 스피너 단축 */
  useLayoutEffect(() => {
    if (initialSessionRef.current != null) return;
    const seeded = consumeCommunityMessengerCallNavigationSeed(sessionId);
    if (seeded) {
      setSession(seeded);
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!session) {
      callTerminalSoundPrevRef.current = null;
      return;
    }
    const sid = session.id;
    const st = session.status;
    const prevPair = callTerminalSoundPrevRef.current;
    if (!prevPair || prevPair.id !== sid) {
      callTerminalSoundPrevRef.current = { id: sid, status: st };
      return;
    }
    const prevSt = prevPair.status;
    callTerminalSoundPrevRef.current = { id: sid, status: st };
    if (prevSt === st) return;
    if (isTerminalCallSessionStatus(prevSt)) return;
    if (!isTerminalCallSessionStatus(st)) return;
    if (st === "missed") {
      void playCommunityMessengerCallSignalSound("missed", { dedupeSessionId: sid });
    } else if (st === "ended") {
      void playCommunityMessengerCallSignalSound("call_end", { dedupeSessionId: sid });
    }
  }, [session?.id, session?.status]);

  /** 발신 대기 링백(수신 벨은 전역 수신 배너에서 재생해 중복 방지) */
  useEffect(() => {
    if (!session) return;
    if (!session.isMineInitiator) return;
    if (session.status !== "ringing") return;
    if (joined) return;
    let cancelled = false;
    let tone: { stop: () => void } | null = null;
    void startCommunityMessengerCallTone("outgoing", { callKind: session.callKind }).then((t) => {
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
  }, [session?.id, session?.status, session?.isMineInitiator, session?.callKind, joined]);

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
            setErrorMessage("통화 연결이 끊어졌습니다.");
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
    setLastMileLine("네트워크 품질 · 확인 중");
    remoteAudioTrackRef.current = null;
    if (localTracksRef.current) {
      const { closeCommunityMessengerAgoraTracks } = await loadCommunityMessengerCallProvider();
      await closeCommunityMessengerAgoraTracks(localTracksRef.current);
    }
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
    if (!isCommunityMessengerAgoraAppConfigured()) {
      throw new Error("통화 설정이 아직 연결되지 않았습니다.");
    }
    const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/token`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !json.ok || !json.connection) {
      const error = json.error ?? "call_provider_not_configured";
      if (error === "call_provider_not_configured") {
        throw new Error("통화 설정이 아직 연결되지 않았습니다.");
      }
      throw new Error("통화 연결 정보를 불러오지 못했습니다.");
    }
    return json.connection;
  }, [sessionId]);

  useEffect(() => {
    prefetchedConnectionRef.current = null;
    if (!session) return;
    if (session.sessionMode !== "direct") return;
    if (isTerminalCallSessionStatus(session.status)) return;
    if (!isCommunityMessengerAgoraAppConfigured()) {
      return;
    }
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
  }, [fetchConnection, session?.id, session?.sessionMode, session?.status]);

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

  /** Remote upgraded session to video — same call, publish local camera. */
  useEffect(() => {
    if (!session || session.callKind !== "video" || !joined || session.status !== "active") return;
    if (localTracksRef.current?.videoTrack) {
      bindLocalVideoTrack();
      return;
    }
    const mark = `${session.id}:vpub`;
    if (autoVideoPublishAttemptedRef.current === mark) return;
    autoVideoPublishAttemptedRef.current = mark;
    let cancelled = false;
    void (async () => {
      try {
        await primeCommunityMessengerDevicePermissionFromUserGesture("video");
        if (cancelled) return;
        const mod = await loadCommunityMessengerCallProvider();
        const videoTrack = await mod.createCommunityMessengerAgoraVideoTrackOnly();
        if (cancelled) {
          videoTrack.stop();
          videoTrack.close();
          return;
        }
        const client = clientRef.current;
        const tracks = localTracksRef.current;
        if (!client || !tracks) {
          videoTrack.stop();
          videoTrack.close();
          return;
        }
        await client.publish([videoTrack]);
        localTracksRef.current = { ...tracks, videoTrack };
        try {
          const c = client as IAgoraRTCClient & { enableDualStream?: () => Promise<void> };
          await c.enableDualStream?.();
        } catch {
          /* optional */
        }
        setCameraSwitchSupported(isCameraVideoTrackWithDevice(videoTrack));
        markCommunityMessengerMediaTrustedOnce();
        bindLocalVideoTrack();
      } catch (e) {
        console.warn("[messenger-call] auto video publish", e);
        setErrorMessage(getCommunityMessengerMediaErrorMessage(e, "video"));
        autoVideoPublishAttemptedRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.callKind, session?.status, joined, bindLocalVideoTrack]);

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
        const { listCommunityMessengerCameras } = await loadCommunityMessengerCallProvider();
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

  const toggleSpeakerEnabled = useCallback(() => {
    setSpeakerEnabled((prev) => !prev);
    if (typeof window !== "undefined" && !("setSinkId" in HTMLMediaElement.prototype)) {
      showMessengerSnackbar("브라우저에서는 실제 출력 전환이 제한될 수 있습니다. 기기 오디오 설정도 함께 확인해 주세요.");
    }
  }, []);

  useEffect(() => {
    if (!joined) return;
    void applyAgoraRemoteSpeakerPreference(remoteAudioTrackRef.current, speakerEnabled);
  }, [joined, speakerEnabled]);

  const toggleBluetoothPreferred = useCallback(() => {
    setBluetoothPreferred((prev) => !prev);
    if (typeof window !== "undefined") {
      showMessengerSnackbar("블루투스 연결은 브라우저보다 기기 오디오 출력 설정의 영향을 먼저 받습니다.");
    }
  }, []);

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
      if (isCommunityMessengerMediaBlockedByInsecureOrigin()) {
        autoJoinBlockedRef.current = true;
        setErrorMessage(COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC);
        return;
      }
      joiningRef.current = true;
      setBusy("join");
      setErrorMessage(null);

      const runJoinAttempt = async (): Promise<void> => {
        const {
          createCommunityMessengerAgoraClient,
          createCommunityMessengerAgoraLocalTracks,
          joinCommunityMessengerAgoraChannel,
          publishCommunityMessengerAgoraTracks,
        } = await loadCommunityMessengerCallProvider();
        const prefetched = prefetchedConnectionRef.current;
        prefetchedConnectionRef.current = null;
        const connection = prefetched ?? (await fetchConnection());
        const client = createCommunityMessengerAgoraClient();
        clientRef.current = client;
        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
          try {
            await client.subscribe(user, mediaType);
          } catch (subErr) {
            console.warn("[community-messenger-call] remote subscribe failed", subErr);
            return;
          }
          if (mediaType === "audio" && user.audioTrack) {
            remoteAudioTrackRef.current = user.audioTrack;
            try {
              user.audioTrack.play();
            } catch {
              /* 자동재생 정책 등 */
            }
            void applyAgoraRemoteSpeakerPreference(user.audioTrack, speakerEnabledRef.current);
            setRemoteJoined(true);
          }
          if (mediaType === "video" && user.videoTrack) {
            bindRemoteVideoTrack(user.videoTrack);
            setRemoteJoined(true);
          }
        });
        client.on("user-unpublished", (_user, mediaType) => {
          if (mediaType === "video") {
            bindRemoteVideoTrack(null);
          }
          if (mediaType === "audio") {
            remoteAudioTrackRef.current = null;
          }
        });
        client.on("user-left", () => {
          bindRemoteVideoTrack(null);
          remoteAudioTrackRef.current = null;
          setRemoteJoined(false);
          void refreshSession(true);
        });
        client.on("connection-state-change", (cur) => {
          if (cur === "DISCONNECTED") {
            setRemoteJoined(false);
          }
          if (cur === "DISCONNECTED" || cur === "DISCONNECTING") {
            void refreshSession(true);
          }
        });
        client.on("network-quality", (stats: { uplinkNetworkQuality: number; downlinkNetworkQuality: number }) => {
          setLastMileLine(
            formatMessengerAgoraLastMileLine(stats.uplinkNetworkQuality ?? 0, stats.downlinkNetworkQuality ?? 0)
          );
        });

        await joinCommunityMessengerAgoraChannel({
          client,
          appId: connection.appId,
          channelName: connection.channelName,
          token: connection.token,
          uid: connection.uid,
        });
        if (targetSession.callKind === "video") {
          try {
            const c = client as IAgoraRTCClient & { enableDualStream?: () => Promise<void> };
            await c.enableDualStream?.();
          } catch {
            /* 일부 환경 미지원 */
          }
        }
        const tracks = await createCommunityMessengerAgoraLocalTracks(targetSession.callKind);
        localTracksRef.current = tracks;
        await publishCommunityMessengerAgoraTracks({
          client,
          tracks,
        });
        joinedRef.current = true;
        setJoined(true);
        setCallerMediaConsentDone(true);
        markCommunityMessengerMediaTrustedOnce();
        autoJoinBlockedRef.current = false;
      };

      try {
        try {
          await runJoinAttempt();
        } catch (first) {
          await cleanupClient();
          if (!isAgoraJoinRetryableError(first)) {
            throw first;
          }
          await runJoinAttempt();
        }
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
              ? "권한이 없습니다."
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

  const handleRetryMediaAndJoin = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    autoVideoPublishAttemptedRef.current = null;
    autoJoinBlockedRef.current = false;
    setErrorMessage(null);
    void (async () => {
      try {
        await primeCommunityMessengerDevicePermissionFromUserGesture(s.callKind);
        markCommunityMessengerMediaTrustedOnce();
        setCallerMediaConsentDone(true);
        if (s.isMineInitiator) {
          await joinCall(s);
          return;
        }
        if (s.status === "ringing") {
          const next = await acceptIncoming();
          if (next) await joinCall(next);
          return;
        }
        await joinCall(s);
      } catch (err) {
        setErrorMessage(getCommunityMessengerMediaErrorMessage(err, s.callKind));
      }
    })();
  }, [acceptIncoming, joinCall]);

  const confirmCallerMediaAndConnect = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setErrorMessage(null);
    void (async () => {
      try {
        await primeCommunityMessengerDevicePermissionFromUserGesture(s.callKind);
        markCommunityMessengerMediaTrustedOnce();
        setCallerMediaConsentDone(true);
        const cur = sessionRef.current;
        if (
          cur &&
          cur.isMineInitiator &&
          cur.sessionMode === "direct" &&
          !isTerminalCallSessionStatus(cur.status)
        ) {
          await joinCall(cur);
        }
      } catch (err) {
        setErrorMessage(getCommunityMessengerMediaErrorMessage(err, s.callKind));
      }
    })();
  }, [joinCall]);

  const rejectIncoming = useCallback(async () => {
    if (!session) return;
    stopCommunityMessengerCallFeedback();
    setBusy("reject");
    try {
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const json = (await res.json().catch(() => ({}))) as SessionResponse;
      if (!res.ok || !json.ok) {
        setErrorMessage(
          json.error === "bad_action"
            ? "이미 처리된 통화입니다."
            : "거절 요청에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
        await disposeCallMedia();
        void refreshSession(true);
        return;
      }
      await disposeCallMedia();
      router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`);
    } finally {
      setBusy(null);
    }
  }, [disposeCallMedia, refreshSession, router, session]);

  const endCall = useCallback(async () => {
    if (!session) return;
    stopCommunityMessengerCallFeedback();
    setBusy("end");
    try {
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: session.status === "ringing" ? "cancel" : "end", durationSeconds: elapsedSeconds }),
      });
      const json = (await res.json().catch(() => ({}))) as SessionResponse;
      if (!res.ok || !json.ok) {
        setErrorMessage(
          json.error === "bad_action"
            ? "이미 종료된 통화입니다."
            : "통화 종료 요청에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요."
        );
        await disposeCallMedia();
        void refreshSession(true);
        return;
      }
      await disposeCallMedia();
      router.replace(`/community-messenger/rooms/${encodeURIComponent(session.roomId)}`);
    } finally {
      setBusy(null);
    }
  }, [disposeCallMedia, elapsedSeconds, refreshSession, router, session]);

  const requestUpgradeToVideo = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || s.sessionMode !== "direct") {
      showMessengerSnackbar("이 통화에서는 영상 전환을 사용할 수 없습니다.");
      return;
    }
    if (!joined || s.status !== "active") {
      showMessengerSnackbar("통화가 연결된 후에 영상으로 전환할 수 있어요.");
      return;
    }
    if (s.callKind === "video") {
      showMessengerSnackbar("이미 영상 통화입니다.");
      return;
    }
    if (localTracksRef.current?.videoTrack) {
      showMessengerSnackbar("카메라가 이미 켜져 있습니다.");
      return;
    }
    setBusy("join");
    setErrorMessage(null);
    try {
      await primeCommunityMessengerDevicePermissionFromUserGesture("video");
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(s.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upgrade_to_video" }),
      });
      const json = (await res.json().catch(() => ({}))) as SessionResponse;
      if (!res.ok || !json.ok || !json.session) {
        const code = json.error;
        setErrorMessage(
          code === "bad_action"
            ? "지금은 영상으로 전환할 수 없습니다."
            : code === "forbidden"
              ? "권한이 없습니다."
              : "영상 전환에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
        return;
      }
      const mod = await loadCommunityMessengerCallProvider();
      const videoTrack = await mod.createCommunityMessengerAgoraVideoTrackOnly();
      const client = clientRef.current;
      const tracks = localTracksRef.current;
      if (!client || !tracks) {
        videoTrack.stop();
        videoTrack.close();
        setErrorMessage("통화 연결이 끊어졌습니다.");
        return;
      }
      await client.publish([videoTrack]);
      localTracksRef.current = { ...tracks, videoTrack };
      try {
        const c = client as IAgoraRTCClient & { enableDualStream?: () => Promise<void> };
        await c.enableDualStream?.();
      } catch {
        /* optional */
      }
      setCameraSwitchSupported(isCameraVideoTrackWithDevice(videoTrack));
      setSession(json.session);
      markCommunityMessengerMediaTrustedOnce();
      bindLocalVideoTrack();
      autoVideoPublishAttemptedRef.current = `${json.session.id}:vpub`;
    } catch (e) {
      setErrorMessage(getCommunityMessengerMediaErrorMessage(e, "video"));
    } finally {
      setBusy(null);
    }
  }, [bindLocalVideoTrack]);

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

      if (fromServer != null) {
        setSession(fromServer);
        setLoading(false);
        /* 토큰은 아래 prefetch useEffect 한 경로만 호출 — bootstrap 과 중복 /token 요청 방지 */
        void refreshSession(true);
        return;
      }

      if (sessionRef.current) {
        void refreshSession(true);
        return;
      }

      setLoading(true);
      try {
        const sessionRes = await fetch(sessionUrl, { cache: "no-store" });
        if (cancelled) return;
        const json = (await sessionRes.json().catch(() => ({}))) as SessionResponse;
        const nextSession = sessionRes.ok && json.ok && json.session ? json.session : null;
        setSession(nextSession);
        if (!nextSession) {
          setErrorMessage("통화 세션을 찾지 못했습니다.");
        }
        /* Agora 토큰: session 상태 반영 후 prefetch effect 가 단일 요청 */
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
    if (!session.isMineInitiator) {
      setCallerMediaConsentDone(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const skip = await shouldSkipCallerMediaGateOverlay(session.callKind);
      if (cancelled) return;
      setCallerMediaConsentDone(skip);
      /* 게이트 생략 시 effect 재실행 전에 바로 Agora 조인(발신자 전용). joinCall 내부 가드로 중복 방지 */
      if (skip) {
        const cur = sessionRef.current;
        if (
          cur &&
          cur.isMineInitiator &&
          cur.sessionMode === "direct" &&
          !isTerminalCallSessionStatus(cur.status)
        ) {
          void joinCall(cur);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinCall, session?.id, session?.isMineInitiator, session?.callKind]);

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
      setErrorMessage("이 통화는 채팅방에서 이어집니다.");
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
    if (s.isMineInitiator && !callerMediaConsentDone) return;
    if (s.isMineInitiator || s.status === "active") {
      void joinCall(s);
    }
  }, [
    acceptIncoming,
    callerMediaConsentDone,
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
      /* 벨·협상 구간만 촘촘히 — 수 초마다 전체 세션 GET 은 비용 큼. 백그라운드 탭은 아래에서 스킵 */
      if (session.status === "ringing") ms = 1_400;
      else if (session.status === "active" && joined && remoteJoined) ms = 4_000;
      else if (session.status === "active" && joined) ms = 1_200;
      else if (session.status === "active") ms = 1_300;
    }
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshSession(true);
    };
    const timer = window.setInterval(tick, ms);
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
      <div className="flex min-h-full min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-[#0e0e12] px-6 text-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-sam-surface/15 border-t-[#665CAC]"
          aria-hidden
        />
        <div>
          <p className="text-[16px] font-semibold text-white/95">통화 준비 중</p>
          <p className="mt-1.5 text-[13px] text-white/45">세션을 불러오는 중입니다</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[18px] font-semibold text-ui-fg">통화를 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={() => router.replace("/community-messenger")}
          className="rounded-ui-rect bg-ui-fg px-4 py-3 text-[14px] font-semibold text-ui-surface"
        >
          메신저로 돌아가기
        </button>
      </div>
    );
  }

  const videoCall = session.callKind === "video";
  const pipLabelSmall = largeShowsRemote ? "나" : session.peerLabel;

  /** 발신 후 링(상대 연결 대기)에도 패드 표시 — 수신 측 「벨 + 수락/거절」일 때만 숨김 */
  const showVoiceViberControlPad = !videoCall && !(session.status === "ringing" && !joined);

  const showCallerMediaGate =
    session.isMineInitiator &&
    !callerMediaConsentDone &&
    !joined &&
    (session.status === "ringing" || session.status === "active");

  /** Avatar dialing shell is voice-only; video ringing uses header + video stage + gate (below). */
  const isOutboundVoiceDialingShell =
    !videoCall && session.isMineInitiator && session.status === "ringing" && !joined;

  return (
    <CallScreenShell
      variant="page"
      surfaceClassName={`min-h-full min-h-[100dvh] text-white ${MESSENGER_CALL_GRADIENT_SURFACE}`}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="relative mx-auto flex min-h-0 w-full max-w-[520px] flex-1 flex-col px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        {isOutboundVoiceDialingShell ? (
          <>
            {!isCommunityMessengerAgoraAppConfigured() ? (
              <div
                className="mb-3 shrink-0 rounded-ui-rect border border-amber-400/35 bg-amber-950/50 px-3 py-2.5 text-left text-[12px] leading-snug text-amber-50"
                role="status"
              >
                {COMMUNITY_MESSENGER_AGORA_SETUP_REQUIRED_MESSAGE}
              </div>
            ) : null}
            {isCommunityMessengerMediaBlockedByInsecureOrigin() ? (
              <div
                className="mb-3 shrink-0 rounded-ui-rect border border-rose-400/30 bg-rose-950/40 px-3 py-2.5 text-left text-[12px] leading-snug text-rose-50"
                role="status"
              >
                {typeof window !== "undefined" && window.location.protocol === "http:"
                  ? `${window.location.host} — ${COMMUNITY_MESSENGER_INSECURE_ORIGIN_MEDIA_HINT}`
                  : "이 출처에서는 미디어 장치를 사용할 수 없습니다."}
              </div>
            ) : null}
            {errorMessage ? (
              <div className="mb-2 flex flex-col gap-2 rounded-2xl border border-sam-surface/10 bg-black/30 px-3 py-2.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-rose-100">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => handleRetryMediaAndJoin()}
                  disabled={busy === "accept" || busy === "join"}
                  className="shrink-0 rounded-full bg-sam-surface px-4 py-2 text-[13px] font-semibold text-sam-fg disabled:opacity-40"
                >
                  {busy === "join" || busy === "accept" ? "연결 중…" : "다시 시도"}
                </button>
              </div>
            ) : null}
            <div className="relative flex min-h-0 flex-1 flex-col">
              <MessengerCallDialingLayout
                embedded
                peerLabel={session.peerLabel}
                kindLabel={videoCall ? "영상 통화" : "음성 통화"}
                onCancel={() => void endCall()}
                onEndCall={() => void endCall()}
                endCallBusy={busy === "end"}
              />
              {showCallerMediaGate ? (
                <CallerMediaGateOverlay
                  callKind={videoCall ? "video" : "voice"}
                  onConfirm={confirmCallerMediaAndConnect}
                  busy={busy === "join" || busy === "accept"}
                />
              ) : null}
            </div>
            {callKeypadOpen && !videoCall ? (
              <CallKeypadOverlay onClose={() => setCallKeypadOpen(false)} />
            ) : null}
          </>
        ) : (
          <>
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] py-3">
          <button
            type="button"
            onClick={() => navigateToChatDuringCall()}
            className="rounded-full border border-white/18 bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-white/90 transition active:scale-[0.98]"
          >
            채팅으로 돌아가기
          </button>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/90">
            {videoCall ? "영상 통화" : "음성 통화"}
          </span>
        </header>

        {videoCall ? (
          <div className="shrink-0 py-2 text-center">
            <p className="text-[17px] font-semibold text-white drop-shadow-sm">{session.peerLabel}</p>
            <p className="mt-0.5 text-[13px] tabular-nums text-white/80">
              {joined && session.status === "active" ? formatDuration(elapsedSeconds) : statusLabel}
            </p>
            {joined && session.status === "active" ? (
              <p className={`mt-0.5 text-[12px] font-medium ${lastMileToneClass}`}>{lastMileLine}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-white/55">1:1 · 참여 2</p>
          </div>
        ) : null}

        <main
          className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${videoCall ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {!isCommunityMessengerAgoraAppConfigured() ? (
            <div
              className="mb-3 shrink-0 rounded-ui-rect border border-amber-400/35 bg-amber-950/50 px-3 py-2.5 text-left text-[12px] leading-snug text-amber-50"
              role="status"
            >
              {COMMUNITY_MESSENGER_AGORA_SETUP_REQUIRED_MESSAGE}
            </div>
          ) : null}
          {isCommunityMessengerMediaBlockedByInsecureOrigin() ? (
            <div
              className="mb-3 shrink-0 rounded-ui-rect border border-rose-400/30 bg-rose-950/40 px-3 py-2.5 text-left text-[12px] leading-snug text-rose-50"
              role="status"
            >
              {typeof window !== "undefined" && window.location.protocol === "http:"
                ? `${window.location.host} — ${COMMUNITY_MESSENGER_INSECURE_ORIGIN_MEDIA_HINT}`
                : "이 출처에서는 미디어 장치를 사용할 수 없습니다."}
            </div>
          ) : null}
          {!videoCall && showCallerMediaGate ? (
            <CallerMediaGateOverlay
              callKind="voice"
              onConfirm={confirmCallerMediaAndConnect}
              busy={busy === "join" || busy === "accept"}
            />
          ) : null}
          {!videoCall ? (
            <div className="relative z-0 shrink-0 pt-2 text-center">
              <p className="text-[28px] font-semibold tracking-tight text-white drop-shadow-sm sm:text-[32px]">
                {session.peerLabel}
              </p>
              <p className="mt-2 text-[15px] text-white/65">{statusLabel}</p>
              <p className="mt-2 text-[11px] text-white/45">대화로 돌아가도 통화는 유지되며 언제든 다시 복귀할 수 있습니다.</p>
              {joined && session.status === "active" ? (
                <p className="mt-3 font-mono text-[17px] font-semibold tabular-nums text-white/90">
                  {formatDuration(elapsedSeconds)}
                </p>
              ) : session.status === "ringing" && session.isMineInitiator ? (
                <p className="mt-3 font-mono text-[17px] font-semibold tabular-nums text-white/35">00:00</p>
              ) : null}
              {showVoiceViberControlPad && (session.status === "ringing" || (joined && session.status === "active")) ? (
                <p className={`mt-2 text-[13px] font-medium ${joined && session.status === "active" ? lastMileToneClass : "text-white/45"}`}>
                  {joined && session.status === "active" ? lastMileLine : "네트워크 품질 · 확인 중"}
                </p>
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
              className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-ui-rect bg-black/35 shadow-lg ring-1 ring-white/15 sm:min-h-[min(58dvh,560px)]"
            >
              {showCallerMediaGate ? (
                <CallerMediaGateOverlay
                  callKind="video"
                  onConfirm={confirmCallerMediaAndConnect}
                  busy={busy === "join" || busy === "accept"}
                />
              ) : null}
              {joined ? (
                <button
                  type="button"
                  onClick={() => setLayoutSwapped((v) => !v)}
                  className="pointer-events-auto absolute right-2 top-2 z-[28] flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/95 shadow-md backdrop-blur-md ring-1 ring-white/15 transition active:scale-95"
                  aria-label="큰 화면과 작은 화면 바꾸기"
                  title="화면 전환"
                >
                  <ExpandSwapCornerIcon className="h-[17px] w-[17px]" />
                </button>
              ) : null}

              <div className="absolute inset-0 bg-black/85">
                <div
                  ref={largeVideoRef}
                  className="h-full w-full bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:min-h-0 [&_video]:min-w-0 [&_video]:!object-cover"
                />
                {showLargeVideoOverlay ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-sam-ink px-4 text-center text-[13px] text-white/75">
                    {largeShowsRemote ? (
                      <>
                        <p>{remoteJoined ? "상대 영상 연결 중…" : "상대 대기 중"}</p>
                        <p className="text-[11px] text-white/45">큰 화면 · 상대</p>
                      </>
                    ) : camOff ? (
                      <>
                        <p>카메라가 꺼져 있습니다</p>
                        <p className="text-[11px] text-white/45">큰 화면 · 나</p>
                      </>
                    ) : (
                      <>
                        <p>내 영상 준비 중</p>
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
                className={`absolute z-20 w-[20%] min-w-[76px] max-w-[124px] overflow-hidden rounded-ui-rect border border-sam-surface/20 bg-black shadow-[0_6px_24px_rgba(0,0,0,0.5)] sm:w-[21%] sm:min-w-[84px] sm:max-w-[136px] sm:rounded-ui-rect ${
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
                  <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-0.5 bg-sam-ink px-2 pb-6 text-center text-[11px] leading-snug text-white/72">
                    {largeShowsRemote ? (
                      camOff ? (
                        <>
                          <CamOffSmallIcon className="mx-auto h-6 w-6 text-white/50" />
                          <span>카메라 꺼짐</span>
                        </>
                      ) : (
                        <span>내 영상 준비 중</span>
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
            <div className="relative z-0 flex flex-1 flex-col items-center justify-center py-4">
              <div
                className={`relative flex aspect-square w-[min(68vw,264px)] max-w-[280px] shrink-0 items-center justify-center rounded-full bg-sam-surface-dark text-[clamp(48px,18vw,92px)] font-light text-white/95 ring-1 ring-sam-surface/10 ${
                  session.status === "ringing" && session.isMineInitiator ? "animate-pulse" : ""
                }`}
                aria-hidden
              >
                <span className="select-none">{peerDisplayInitial(session.peerLabel)}</span>
              </div>
            </div>
          )}
        </div>
      </main>

      <div
        className={
          videoCall
            ? "w-full shrink-0 px-3 pb-[max(0.5rem,calc(env(safe-area-inset-bottom,0px)+0.35rem))] pt-2"
            : "mx-auto w-full max-w-[420px] shrink-0 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+4.75rem))] pt-3"
        }
      >
        {errorMessage ? (
          <div className="mb-2 flex flex-col gap-2 rounded-2xl border border-sam-surface/10 bg-black/30 px-3 py-2.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-rose-100">{errorMessage}</p>
            <button
              type="button"
              onClick={() => handleRetryMediaAndJoin()}
              disabled={busy === "accept" || busy === "join"}
              className="shrink-0 rounded-full bg-sam-surface px-4 py-2 text-[13px] font-semibold text-sam-fg disabled:opacity-40"
            >
              {busy === "join" || busy === "accept" ? "연결 중…" : "다시 시도"}
            </button>
          </div>
        ) : null}

        {session.callKind === "video" && joined ? (
          <div className="mb-2 flex flex-col gap-5">
            <div className="flex items-end justify-center gap-10 px-4 sm:gap-14">
              <button
                type="button"
                onClick={() => void toggleMicEnabled()}
                className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 border-sam-surface/35 bg-sam-surface/[0.08] text-white shadow-[0_8px_28px_rgba(0,0,0,0.35)] transition active:scale-95 ${
                  micMuted ? "border-amber-300/50 bg-amber-500/15" : ""
                }`}
                aria-label={micMuted ? "음소거 해제" : "음소거"}
              >
                {micMuted ? <MicOffToolbarIcon className="h-7 w-7" /> : <MicOnToolbarIcon className="h-7 w-7" />}
              </button>
              <button
                type="button"
                onClick={() => void endCall()}
                disabled={busy === "end"}
                className="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition active:scale-95 disabled:opacity-45 sm:h-[4.5rem] sm:w-[4.5rem]"
                aria-label="통화 종료"
              >
                <EndCallStandardIcon className="h-9 w-9" />
              </button>
              <button
                type="button"
                onClick={() => void toggleCamEnabled()}
                className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 border-sam-surface/35 bg-sam-surface/[0.08] text-white shadow-[0_8px_28px_rgba(0,0,0,0.35)] transition active:scale-95 ${
                  camOff ? "border-amber-300/50 bg-amber-500/15" : ""
                }`}
                aria-label={camOff ? "카메라 켜기" : "카메라 끄기"}
              >
                {camOff ? <CamOffToolbarIcon className="h-7 w-7" /> : <CamOnToolbarIcon className="h-7 w-7" />}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <CallControlButton
                label={speakerEnabled ? "스피커" : "이어폰"}
                active={speakerEnabled}
                onClick={toggleSpeakerEnabled}
                icon={<SpeakerIcon className="h-5 w-5" />}
              />
              <CallControlButton
                label={bluetoothPreferred ? "블루투스 우선" : "블루투스"}
                active={bluetoothPreferred}
                onClick={toggleBluetoothPreferred}
                icon={<BluetoothIcon className="h-5 w-5" />}
              />
              <CallControlButton
                label="카메라 전환"
                onClick={() => void switchCameraFacing()}
                disabled={!cameraSwitchSupported || busy === "camera"}
                icon={<SwitchCameraIcon className="h-5 w-5" />}
              />
              <CallControlButton
                label="화면 맞바꿈"
                onClick={() => setLayoutSwapped((v) => !v)}
                icon={<SwapVideoLayoutIcon className="h-5 w-5" />}
              />
              <CallControlButton
                label="채팅"
                onClick={() => navigateToChatDuringCall()}
                icon={<ChatBubbleIcon className="h-5 w-5" />}
              />
              <CallControlButton
                label="권한"
                onClick={() => {
                  if (!openCommunityMessengerPermissionSettings()) {
                    showMessengerSnackbar("브라우저 설정에서 이 사이트의 마이크·카메라 권한을 허용해 주세요.", {
                      variant: "error",
                    });
                  }
                }}
                icon={<SettingsGearIcon className="h-5 w-5" />}
              />
            </div>
          </div>
        ) : null}

        {!(session.callKind === "video" && joined) ? (
          <div className="space-y-3">
            {!session.isMineInitiator && session.status === "ringing" && !joined ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void rejectIncoming()}
                    disabled={busy === "reject"}
                    className="rounded-ui-rect border border-sam-surface/15 px-4 py-3 text-[14px] font-medium text-white/80 disabled:opacity-40"
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
                    className="rounded-ui-rect bg-sam-ink px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
                  >
                    {busy === "accept" || busy === "join" ? "연결 중..." : "수락"}
                  </button>
                </div>
              </>
            ) : (
              <>
                {showVoiceViberControlPad ? (
                  <div className="mx-auto grid w-full max-w-[340px] grid-cols-3 gap-x-3 gap-y-5 px-1">
                    <ViberOutlineCallButton
                      label={micMuted ? "음소거 해제" : "음소거"}
                      active={micMuted}
                      onClick={() => void toggleMicEnabled()}
                      icon={micMuted ? <MicOffToolbarIcon className="h-6 w-6" /> : <MicOnToolbarIcon className="h-6 w-6" />}
                    />
                    <ViberOutlineCallButton
                      label="자판"
                      onClick={() => setCallKeypadOpen(true)}
                      icon={<KeypadIcon className="h-6 w-6" />}
                    />
                    <ViberOutlineCallButton
                      label={speakerEnabled ? "스피커" : "이어폰"}
                      active={speakerEnabled}
                      onClick={toggleSpeakerEnabled}
                      icon={<SpeakerIcon className="h-6 w-6" />}
                    />
                    <ViberOutlineCallButton
                      label="영상 통화"
                      onClick={() => void requestUpgradeToVideo()}
                      icon={<CamOnToolbarIcon className="h-6 w-6" />}
                    />
                    <ViberOutlineCallButton
                      label="전환"
                      onClick={() =>
                        showMessengerSnackbar("통화 전환(다른 번호로 돌리기)는 추후 지원 예정입니다.")
                      }
                      icon={<PhoneTransferIcon className="h-6 w-6" />}
                    />
                    <ViberOutlineCallButton
                      label="연락처"
                      onClick={() => router.push("/community-messenger?section=friends")}
                      icon={<ContactsOutlineIcon className="h-6 w-6" />}
                    />
                  </div>
                ) : null}
                <div
                  className={`flex justify-center ${showVoiceViberControlPad ? "mt-5" : "mt-2"}`}
                >
                  <button
                    type="button"
                    onClick={() => void endCall()}
                    disabled={busy === "end"}
                    className="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-full bg-[#e5394a] text-white shadow-[0_12px_40px_rgba(229,57,74,0.45)] transition active:scale-95 disabled:opacity-40"
                    aria-label="통화 종료"
                  >
                    <EndCallStandardIcon className="h-8 w-8" />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
        {callKeypadOpen && !videoCall ? (
          <CallKeypadOverlay onClose={() => setCallKeypadOpen(false)} />
        ) : null}
      </div>
          </>
        )}
      </div>
    </CallScreenShell>
  );
}

function PhoneTransferIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M5 4h4l2 3h6a2 2 0 0 1 2 2v2M5 4v12a2 2 0 0 0 2 2h3M5 4L3 2M15 14h4l2 2v4h-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 10l4-4M15 10h4M15 10v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ContactsOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0z" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M4 20a7 7 0 0 1 12 0M14 7a4 4 0 1 0 4 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KeypadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="8" cy="8" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.35" fill="currentColor" stroke="none" />
    </svg>
  );
}

const DTMF_PAIR: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

function playDtmfDigit(digit: string) {
  if (typeof window === "undefined") return;
  const pair = DTMF_PAIR[digit];
  if (!pair) return;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const [f0, f1] = pair;
  const g = ctx.createGain();
  g.gain.value = 0.12;
  g.connect(ctx.destination);
  const o0 = ctx.createOscillator();
  const o1 = ctx.createOscillator();
  o0.type = "sine";
  o1.type = "sine";
  o0.frequency.value = f0;
  o1.frequency.value = f1;
  o0.connect(g);
  o1.connect(g);
  const t = ctx.currentTime;
  o0.start(t);
  o1.start(t);
  o0.stop(t + 0.14);
  o1.stop(t + 0.14);
  window.setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 200);
}

function CallKeypadOverlay({ onClose }: { onClose: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;
  return (
    <div
      role="presentation"
      className="pointer-events-auto fixed inset-0 z-[100] flex items-end justify-center bg-black/55 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-[340px] rounded-[22px] border border-sam-surface/12 bg-[#1c1f28] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-semibold text-white">자판</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-white/75 transition hover:bg-sam-surface/10"
          >
            닫기
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-snug text-white/45">로컬에서만 톤이 재생됩니다. 상대에게는 전달되지 않을 수 있습니다.</p>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => playDtmfDigit(k)}
              className="flex h-12 items-center justify-center rounded-full border border-sam-surface/18 bg-sam-surface/[0.06] text-[18px] font-semibold text-white transition active:scale-95 active:bg-sam-surface/12"
            >
              {k}
            </button>
          ))}
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

/** Viber 스타일 — 테두리 강조 원형 그리드 버튼 */
function ViberOutlineCallButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[88px] w-full max-w-[108px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-full border-2 text-[10px] font-medium tracking-tight text-white/95 transition active:scale-[0.96] disabled:opacity-40 ${
        active
          ? "border-sam-surface/45 bg-sam-surface/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
          : "border-sam-surface/22 bg-sam-surface/[0.05]"
      }`}
    >
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-sam-surface/15 bg-black/30 text-white">
        {icon}
      </span>
      <span className="max-w-[92px] truncate px-0.5 leading-tight">{label}</span>
    </button>
  );
}

function CallControlButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-ui-rect border px-2 py-2 text-center text-[11px] disabled:opacity-40 ${
        active ? "border-sam-surface/30 bg-sam-surface/15 text-white" : "border-sam-surface/10 bg-sam-surface/5 text-white/88"
      }`}
    >
      {icon}
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function peerDisplayInitial(label: string): string {
  const t = label.trim();
  if (!t) return "?";
  const first = [...t][0];
  return first ?? "?";
}

function CallerMediaGateOverlay({
  callKind,
  onConfirm,
  busy,
}: {
  callKind: "voice" | "video";
  onConfirm: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const headline = callKind === "video" ? "영상 통화 연결" : "음성 통화 연결";
  const explain =
    callKind === "video" ? t("nav_messenger_video_join_after_permission") : t("nav_messenger_voice_join_after_permission");
  return (
    <div className="pointer-events-auto absolute inset-0 z-[45] flex items-center justify-center bg-black/50 px-5 backdrop-blur-[2px]">
      <div className="w-full max-w-[300px] rounded-[20px] border border-sam-surface/12 bg-[#1e232c]/95 px-5 py-5 text-center shadow-xl">
        <p className="text-[16px] font-semibold text-white">{headline}</p>
        <p className="mt-2 text-[13px] leading-snug text-white/75">{explain}</p>
        <p className="mt-2 text-[11px] leading-snug text-white/50">{t("nav_messenger_call_gate_trust_hint")}</p>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="mt-4 w-full rounded-full bg-sam-surface py-3 text-[15px] font-semibold text-sam-fg disabled:opacity-40"
        >
          {busy ? "연결 중…" : "허용하고 연결"}
        </button>
      </div>
    </div>
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

function BluetoothIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M7 7l8 10V7l-4 4 6 6-6 6 4 4V17L7 27" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 -4)" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M5 6h14v9H9l-4 3V6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MinimizeCallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 10h6V4M20 14h-6v6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 4L4 10M14 20l6-6" strokeLinecap="round" strokeLinejoin="round" />
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

/** 통화 종료 — 수화기를 끊는 일반적인 방향(회전)의 스트로크 아이콘 */
function EndCallStandardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform="rotate(135 12 12)">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </g>
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
