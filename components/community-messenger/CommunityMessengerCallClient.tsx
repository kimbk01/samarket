"use client";

import type {
  ICameraVideoTrack,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalVideoTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
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
import { ensureVideoPermission } from "@/lib/call/permission-manager";
import {
  hasCommunityMessengerMediaTrustedMark,
  markCommunityMessengerMediaTrustedOnce,
  openCommunityMessengerPermissionSettings,
  primeCommunityMessengerDevicePermissionFromUserGesture,
  shouldSkipCallerMediaGateOverlay,
  shouldSkipCallerMediaGateOverlaySync,
} from "@/lib/community-messenger/call-permission";
import {
  COMMUNITY_MESSENGER_AGORA_SETUP_REQUIRED_MESSAGE,
  COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC,
  COMMUNITY_MESSENGER_INSECURE_ORIGIN_MEDIA_HINT,
  getCommunityMessengerMediaErrorMessage,
  isAgoraJoinRetryableError,
  isCommunityMessengerMediaBlockedByInsecureOrigin,
  isCommunityMessengerNonRetryableCallErrorMessage,
} from "@/lib/community-messenger/media-errors";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSession,
  CommunityMessengerManagedCallConnection,
} from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import {
  playCommunityMessengerCallSignalSound,
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallFeedback,
} from "@/lib/community-messenger/call-feedback-sound";
import { takeDetachedCommunityCallCleanup } from "@/lib/community-messenger/direct-call-minimize";
import { isCommunityMessengerAgoraAppConfigured } from "@/lib/community-messenger/call-provider/client-runtime";
import { formatMessengerAgoraLastMileLine } from "@/lib/community-messenger/call-provider/agora-network-quality";
import { applyAgoraRemoteSpeakerPreference } from "@/lib/community-messenger/call-provider/agora-playback-routing";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallActionItem, CallPhase, CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  bootstrapCommunityMessengerOutgoingCallAndNavigate,
  consumeCommunityMessengerCallNavigationSeed,
  ensureCallNavigationSeedMemoryMatchesRoute,
  hydrateCommunityMessengerCallClientSession,
  navigateBackFromCommunityMessengerCall,
} from "@/lib/community-messenger/call-session-navigation-seed";
import {
  notifyCommunityMessengerCallInviteHangupBestEffort,
  subscribeCommunityMessengerCallInviteBroadcast,
} from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { postCommunityMessengerCallHangupSignal } from "@/lib/call/call-actions";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import {
  getCallSessionClientPollIntervalMs,
  MESSENGER_CALL_SESSION_REALTIME_DEBOUNCE_MS,
  MESSENGER_CALL_SESSION_SILENT_GAP_POLL_MS,
  MESSENGER_CALL_SESSION_SILENT_GAP_REALTIME_MS,
  MESSENGER_CALL_SESSION_SILENT_GAP_UI_MS,
} from "@/lib/community-messenger/messenger-latency-config";
import { messengerMonitorCallFlowPhase } from "@/lib/community-messenger/monitoring/client";
import { logClientPerf, perfNow } from "@/lib/performance/samarket-perf";

const CALL_CLIENT_TIER = getPublicDeployTier();

type SessionResponse = { ok?: boolean; session?: CommunityMessengerCallSession; error?: string };
type TokenResponse = { ok?: boolean; connection?: CommunityMessengerManagedCallConnection; error?: string };

function isTerminalCallSessionStatus(status: CommunityMessengerCallSession["status"]): boolean {
  return status === "ended" || status === "cancelled" || status === "rejected" || status === "missed";
}

/** Agora 조인 전 발신 영상: 발신 벨 단계와 동일하게 즉시 풀프리뷰 */
function OutgoingCallPreJoinLocalCameraPreview() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const v = ref.current;
        if (v) {
          v.srcObject = s;
          void v.play().catch(() => {});
        }
      } catch {
        /* HTTP/권한 등 — 검은 배경만 */
      }
    })();
    return () => {
      alive = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const v = ref.current;
      if (v) v.srcObject = null;
    };
  }, []);
  return <video ref={ref} className="h-full w-full object-cover" playsInline muted autoPlay />;
}

/** 종료 PATCH/Realtime 후 stale 세션 GET 이 `ringing` 으로 되돌아와 링백이 다시 도는 윈도 — 수신 전역 tombstone(120s)과 동급 */
const CALL_SESSION_TERMINAL_PIN_MS = 120_000;

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
    a.peerAvatarUrl === b.peerAvatarUrl &&
    a.isMineInitiator === b.isMineInitiator &&
    a.sessionMode === b.sessionMode &&
    a.initiatorUserId === b.initiatorUserId &&
    a.recipientUserId === b.recipientUserId
  );
}

function readRealtimeSessionStatus(
  value: unknown
): CommunityMessengerCallSession["status"] | null {
  return value === "ringing" ||
    value === "active" ||
    value === "ended" ||
    value === "rejected" ||
    value === "missed" ||
    value === "cancelled"
    ? value
    : null;
}

/**
 * silent GET 이 DB·캐시 지연으로 ringing/active 를 돌려주면 터미널 UI 가 다시 "통화 중" 으로 깜빡인다.
 * `callTerminalLocalPinRef` 와 함께 이중 방어.
 */
function pickCallSessionSnapshotAfterFetch(
  prev: CommunityMessengerCallSession | null,
  next: CommunityMessengerCallSession | null
): CommunityMessengerCallSession | null {
  if (!next) return next;
  if (
    prev &&
    prev.id === next.id &&
    isTerminalCallSessionStatus(prev.status) &&
    !isTerminalCallSessionStatus(next.status)
  ) {
    return prev;
  }
  return next;
}

/**
 * 세션 row Realtime payload 는 snake_case 원시행이다.
 * 라벨·참가자 등은 기존 스냅샷을 유지하고, 종료/수락/전환에 필요한 핵심 필드만 즉시 반영한다.
 */
function mergeRealtimeSessionRowIntoSnapshot(
  prev: CommunityMessengerCallSession | null,
  row: Record<string, unknown> | null,
  targetSessionId: string
): CommunityMessengerCallSession | null {
  if (!prev || !row) return prev;
  const rowId = typeof row.id === "string" ? row.id.trim() : "";
  if (!rowId || rowId !== targetSessionId || prev.id !== targetSessionId) return prev;
  const nextStatus = readRealtimeSessionStatus(row.status);
  /**
   * 취소/종료 후 지연된 non-terminal payload가 도착해 "연결중"으로 되돌아가는 레이스 차단.
   * terminal -> non-terminal 역전은 무시하고 GET authoritative 갱신만 기다린다.
   */
  if (isTerminalCallSessionStatus(prev.status) && nextStatus && !isTerminalCallSessionStatus(nextStatus)) {
    return prev;
  }
  const nextCallKind = row.call_kind === "video" || row.call_kind === "voice" ? row.call_kind : prev.callKind;
  const answeredAt =
    typeof row.answered_at === "string"
      ? row.answered_at
      : row.answered_at == null
        ? null
        : prev.answeredAt;
  const endedAt =
    typeof row.ended_at === "string"
      ? row.ended_at
      : row.ended_at == null
        ? null
        : prev.endedAt;
  const merged: CommunityMessengerCallSession = {
    ...prev,
    callKind: nextCallKind,
    status: nextStatus ?? prev.status,
    answeredAt,
    endedAt,
  };
  return sessionsMeaningfullyEqual(prev, merged) ? prev : merged;
}

function mapHangupReasonToTerminalStatus(
  reason: unknown
): CommunityMessengerCallSession["status"] | null {
  if (reason === "reject") return "rejected";
  if (reason === "missed") return "missed";
  if (reason === "cancel") return "cancelled";
  if (reason === "end" || reason === "hangup" || reason === "leave") return "ended";
  return null;
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
  const [initialCallHydration] = useState(() =>
    hydrateCommunityMessengerCallClientSession(sessionId, initialSession)
  );
  const [session, setSession] = useState<CommunityMessengerCallSession | null>(initialCallHydration.session);
  const [loading, setLoading] = useState(() => initialCallHydration.loading);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [ringStartAt, setRingStartAt] = useState<number | null>(null);
  const [connectedAtTs, setConnectedAtTs] = useState<number | null>(null);
  const [terminalClosedAt, setTerminalClosedAt] = useState<number | null>(null);
  const [endedDurationSeconds, setEndedDurationSeconds] = useState<number | null>(null);
  const [localVideoReady, setLocalVideoReady] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [layoutSwapped, setLayoutSwapped] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  /** 조인 직후(트랙 생성 시점)에도 최신 음소거 의도를 반영 */
  const micMutedRef = useRef(false);
  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);
  /** 음성: 기본 이어폰(off). 영상: 기본 스피커폰(on). */
  const [speakerEnabled, setSpeakerEnabled] = useState(false);
  const speakerEnabledRef = useRef(false);
  speakerEnabledRef.current = speakerEnabled;
  const callKindBootRef = useRef<{ sid: string | null; kind: CommunityMessengerCallKind | null }>({
    sid: null,
    kind: null,
  });
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
  /** 상대 영상 최초 수신 시에만 기본 레이아웃(상대 풀·나 PiP) 적용 — 사용자 스왑 유지 */
  const hadRemoteVideoForLayoutRef = useRef(false);
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
  const remoteJoinedRef = useRef(false);
  remoteJoinedRef.current = remoteJoined;
  /**
   * PATCH 직후 GET/Realtime 이 아직 ringing/active 를 돌려줄 때 로컬 종료 상태가 덮이는 레이스 방지
   * (발신 취소·수신 종료 후 화면·링백이 다시 살아나던 현상). TTL 은 수신 전역 hard-clear 와 동일하게 길게 둔다.
   */
  const callTerminalLocalPinRef = useRef<{
    sessionId: string;
    until: number;
    snapshot: CommunityMessengerCallSession;
  } | null>(null);
  /** effect 가 백업 폴링 간격을 Realtime 구독 상태에 맞출 수 있게 state 로도 반영 */
  const [sessionRealtimeSubscribed, setSessionRealtimeSubscribed] = useState(false);
  /** Realtime + polling + user-action refresh가 동시에 붙을 때 GET 폭주 방지 */
  const refreshScheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSilentRefreshAtRef = useRef<number>(0);
  const sessionSilentRefreshBackoffUntilRef = useRef<number>(0);
  const autoJoinBlockedRef = useRef(false);
  /**
   * 발신( initiator ): 브라우저는 마이크·카메라를 사용자 제스처 없이 열지 못하는 경우가 많아,
   * 「허용하고 연결」 확인 후에만 Agora 조인한다. 수신은 수락 버튼·자동수락 경로에서 이미 제스처가 있다.
   */
  const [callerMediaConsentDone, setCallerMediaConsentDone] = useState(() => {
    const s = initialCallHydration.session;
    if (!s) return true;
    if (!s.isMineInitiator) return true;
    return shouldSkipCallerMediaGateOverlaySync(s.callKind);
  });
  /** silent 세션 GET 이 동시에 여러 번 호출될 때(폴링+Realtime) 한 번의 네트워크로 합친다 */
  const refreshSilentInFlightRef = useRef<Promise<CommunityMessengerCallSession | null> | null>(null);
  /** postgres_changes 연속 이벤트로 GET 이 폭주하지 않게 묶는다 */
  const sessionRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 터미널 상태 전환 시에만 부재/종료 사운드(초기 로드 시 이미 종료된 세션은 제외) */
  const callTerminalSoundPrevRef = useRef<{ id: string; status: CommunityMessengerCallSession["status"] } | null>(null);
  /** Peer upgraded session to video — publish local camera once (cleared on failure / new session). */
  const autoVideoPublishAttemptedRef = useRef<string | null>(null);
  /** Agora `network-quality` 는 초당 여러 번 올 수 있어 UI state 갱신을 묶는다 */
  const networkQualityFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNetworkQualityRef = useRef<{ u: number; d: number } | null>(null);
  /** 수락~로컬 퍼블리시·로컬~첫 원격 미디어 구간 측정 */
  const callFlowAcceptStartRef = useRef<number | null>(null);
  const callFlowLocalPublishAtRef = useRef<number | null>(null);
  const callFlowPrevRemoteJoinedRef = useRef(false);
  /** 터미널+비조인 자동 `navigateBack` 이 같은 세션에서 반복 호출되지 않게 */
  const callTerminalAutoNavigatedRef = useRef<string | null>(null);
  /**
   * 수락 PATCH 응답 전 `finally` 에서 `setBusy(null)` 되는 한 틱에 phase 가 다시 `ringing` 으로 떨어져
   * IncomingCallView ↔ 연결 풀스크린이 교차하는 것을 막는다(ref 만 쓰면 리렌더가 없어 동일 버그 유지).
   */
  const [calleeVideoConnectingShell, setCalleeVideoConnectingShell] = useState(false);
  /** 발신: `ringing` → 그 외 로 바뀔 때(상대 거절·취소 등) 벨·연결음이 잠시 남지 않게 */
  const wasCallSessionRingingRef = useRef(false);

  useLayoutEffect(() => {
    stopCommunityMessengerCallFeedback();
    setCalleeVideoConnectingShell(false);
    wasCallSessionRingingRef.current = false;
  }, [sessionId]);

  useLayoutEffect(() => {
    if (requestedAction !== "accept") return;
    const s = session;
    if (s && s.id === sessionId && !s.isMineInitiator && s.status === "ringing") {
      setCalleeVideoConnectingShell(true);
    }
  }, [requestedAction, sessionId, session?.id, session?.isMineInitiator, session?.status, session]);

  useEffect(() => {
    if (!session) return;
    if (session.status !== "ringing") {
      setCalleeVideoConnectingShell(false);
    }
  }, [session?.id, session?.status]);

  useEffect(() => {
    if (!session) {
      wasCallSessionRingingRef.current = false;
      return;
    }
    const ringing = session.status === "ringing";
    if (wasCallSessionRingingRef.current && !ringing) {
      stopCommunityMessengerCallFeedback();
    }
    wasCallSessionRingingRef.current = ringing;
  }, [session?.id, session?.status, session]);

  useEffect(() => {
    setSessionRealtimeSubscribed(false);
    sessionSilentRefreshBackoffUntilRef.current = 0;
    callFlowAcceptStartRef.current = null;
    callFlowLocalPublishAtRef.current = null;
    callFlowPrevRemoteJoinedRef.current = false;
    callTerminalLocalPinRef.current = null;
    hadRemoteVideoForLayoutRef.current = false;
    callTerminalAutoNavigatedRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    callKindBootRef.current = { sid: null, kind: null };
  }, [sessionId]);

  useEffect(() => {
    if (!session?.id) return;
    const b = callKindBootRef.current;
    if (b.sid !== session.id) {
      callKindBootRef.current = { sid: session.id, kind: session.callKind };
      setSpeakerEnabled(session.callKind === "video");
      return;
    }
    if (b.kind !== session.callKind) {
      callKindBootRef.current = { sid: session.id, kind: session.callKind };
      if (session.callKind === "video") setSpeakerEnabled(true);
      else setSpeakerEnabled(false);
    }
  }, [session?.id, session?.callKind]);

  useEffect(() => {
    autoVideoPublishAttemptedRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    setRingStartAt(null);
    setConnectedAtTs(null);
    setTerminalClosedAt(null);
    setEndedDurationSeconds(null);
  }, [sessionId]);

  /** 시드가 lazy 초기화 이후에만 채워지는 경로(테스트·비동적 로드)용 보강 */
  useLayoutEffect(() => {
    if (initialSessionRef.current != null) return;
    ensureCallNavigationSeedMemoryMatchesRoute(sessionId);
    const seeded = consumeCommunityMessengerCallNavigationSeed(sessionId);
    if (seeded) {
      setSession(seeded);
      setLoading(false);
      if (!seeded.isMineInitiator) {
        setCallerMediaConsentDone(true);
      } else {
        setCallerMediaConsentDone(shouldSkipCallerMediaGateOverlaySync(seeded.callKind));
      }
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
      showMessengerSnackbar("부재중 알림", { variant: "error" });
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
        if (silent && Date.now() < sessionSilentRefreshBackoffUntilRef.current) {
          return sessionRef.current;
        }
        if (!silent) setLoading(true);
        try {
          const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
            cache: "no-store",
          });
          if (res.status === 429) {
            const ra = res.headers.get("Retry-After");
            const sec = Math.min(120, Math.max(1, Number.parseInt(ra ?? "", 10) || 5));
            sessionSilentRefreshBackoffUntilRef.current = Date.now() + sec * 1000;
            return sessionRef.current;
          }
          const json = (await res.json().catch(() => ({}))) as SessionResponse;
          let nextSession = res.ok && json.ok && json.session ? json.session : null;
          const pin = callTerminalLocalPinRef.current;
          if (
            pin &&
            pin.sessionId === sessionId &&
            Date.now() < pin.until &&
            nextSession &&
            nextSession.id === pin.sessionId &&
            isTerminalCallSessionStatus(pin.snapshot.status) &&
            !isTerminalCallSessionStatus(nextSession.status)
          ) {
            nextSession = pin.snapshot;
          }
          if (
            nextSession &&
            pin &&
            nextSession.id === pin.sessionId &&
            isTerminalCallSessionStatus(nextSession.status)
          ) {
            callTerminalLocalPinRef.current = null;
          }
          setSession((prev) => {
            const resolved = pickCallSessionSnapshotAfterFetch(prev, nextSession);
            return sessionsMeaningfullyEqual(prev, resolved) ? prev : resolved;
          });
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

  const scheduleSilentRefresh = useCallback(
    (reason: "realtime" | "poll" | "ui") => {
      const now = Date.now();
      if (now < sessionSilentRefreshBackoffUntilRef.current) return;
      const minGapMs =
        reason === "poll"
          ? MESSENGER_CALL_SESSION_SILENT_GAP_POLL_MS
          : reason === "ui"
            ? MESSENGER_CALL_SESSION_SILENT_GAP_UI_MS
            : MESSENGER_CALL_SESSION_SILENT_GAP_REALTIME_MS;
      if (now - lastSilentRefreshAtRef.current < minGapMs) return;
      if (refreshScheduleTimerRef.current) return;
      refreshScheduleTimerRef.current = setTimeout(() => {
        refreshScheduleTimerRef.current = null;
        lastSilentRefreshAtRef.current = Date.now();
        void refreshSession(true);
      }, reason === "poll" ? 120 : 60);
    },
    [refreshSession]
  );

  useEffect(() => {
    return () => {
      if (refreshScheduleTimerRef.current) {
        clearTimeout(refreshScheduleTimerRef.current);
        refreshScheduleTimerRef.current = null;
      }
    };
  }, []);

  const cleanupClient = useCallback(async () => {
    if (networkQualityFlushTimerRef.current != null) {
      clearTimeout(networkQualityFlushTimerRef.current);
      networkQualityFlushTimerRef.current = null;
    }
    pendingNetworkQualityRef.current = null;
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
    micMutedRef.current = false;
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
      if (error === "session_not_joinable") {
        throw new Error("이미 종료되었거나 더 이상 연결할 수 없는 통화입니다.");
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

  const bindLocalVideoTrack = useCallback(() => {
    const videoTrack = localTracksRef.current?.videoTrack ?? null;
    const swapped = layoutSwappedRef.current;
    const s = sessionRef.current;
    /** 상대가 채널에 붙기 전까지만 풀화면 로컬 — 이후엔 PiP+메인(원격 대기) */
    const soloOutgoingLocalFull = Boolean(s?.callKind === "video" && s.isMineInitiator && !remoteJoinedRef.current);

    const sm = smallVideoRef.current;
    const lg = largeVideoRef.current;

    if (soloOutgoingLocalFull) {
      if (sm) sm.innerHTML = "";
      if (lg) lg.innerHTML = "";
      if (!videoTrack || !lg) {
        setLocalVideoReady(false);
        return;
      }
      if (!videoTrack.enabled) {
        setLocalVideoReady(false);
        return;
      }
      videoTrack.play(lg, { fit: "cover", mirror: true });
      setLocalVideoReady(true);
      return;
    }

    const localEl = swapped ? lg : sm;
    if (localEl) localEl.innerHTML = "";
    if (!videoTrack || !localEl) {
      setLocalVideoReady(false);
      return;
    }
    if (!videoTrack.enabled) {
      setLocalVideoReady(false);
      return;
    }
    videoTrack.play(localEl, { fit: "cover", mirror: true });
    setLocalVideoReady(true);
  }, []);

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
      /* 원격 수신 직후 로컬이 솔로 풀에 남는 것을 막음 — layout effect deps 에서 remoteVideoReady 를 뺌 */
      bindLocalVideoTrack();
      return;
    }
    setRemoteVideoReady(false);
    bindLocalVideoTrack();
  }, [bindLocalVideoTrack]);

  /* 레이아웃 전환·join 직후: 양쪽 슬롯에 트랙을 다시 붙인다 */
  useLayoutEffect(() => {
    if (!session || session.callKind !== "video" || !joined) return;
    const remote = remoteVideoTrackRef.current;
    const local = localTracksRef.current?.videoTrack ?? null;
    const swapped = layoutSwapped;
    const soloOutgoingLocalFull = Boolean(
      session.callKind === "video" && session.isMineInitiator && !remoteJoined
    );

    if (soloOutgoingLocalFull) {
      const sm = smallVideoRef.current;
      const lg = largeVideoRef.current;
      if (sm) sm.innerHTML = "";
      if (lg) lg.innerHTML = "";
      if (local && lg && local.enabled) {
        local.play(lg, { fit: "cover", mirror: true });
        setLocalVideoReady(true);
      } else {
        setLocalVideoReady(false);
      }
      setRemoteVideoReady(false);
      return;
    }

    const remoteEl = swapped ? smallVideoRef.current : largeVideoRef.current;
    const localEl = swapped ? largeVideoRef.current : smallVideoRef.current;
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
  }, [layoutSwapped, joined, remoteJoined, session?.callKind, session?.id, session?.isMineInitiator]);

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
    const nextMuted = !micMuted;
    micMutedRef.current = nextMuted;
    setMicMuted(nextMuted);
    if (!a) return;
    try {
      await a.setEnabled(!nextMuted);
    } catch {
      micMutedRef.current = !nextMuted;
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
    const moved = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY);
    pipDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const TAP_PX = 14;
    if (moved < TAP_PX) {
      setLayoutSwapped((prev) => !prev);
      return;
    }
    const stage = videoStageRef.current;
    const pip = pipWrapRef.current;
    if (!stage || !pip) return;
    const sr = stage.getBoundingClientRect();
    const pr = pip.getBoundingClientRect();
    const pad = 12;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const pw = pip.offsetWidth;
    const ph = pip.offsetHeight;
    if (pw <= 0 || ph <= 0) return;
    let left = pr.left - sr.left;
    let top = pr.top - sr.top;
    const maxL = Math.max(pad, sw - pw - pad);
    const maxT = Math.max(pad, sh - ph - pad);
    left = Math.min(maxL, Math.max(pad, left));
    top = Math.min(maxT, Math.max(pad, top));
    const cx = left + pw / 2;
    const cy = top + ph / 2;
    const corners: { left: number; top: number }[] = [
      { left: pad, top: pad },
      { left: maxL, top: pad },
      { left: pad, top: maxT },
      { left: maxL, top: maxT },
    ];
    let best = corners[0]!;
    let bestD = Infinity;
    for (const c of corners) {
      const dc = Math.hypot(cx - (c.left + pw / 2), cy - (c.top + ph / 2));
      if (dc < bestD) {
        bestD = dc;
        best = c;
      }
    }
    setPipPixelPosition({ left: best.left, top: best.top });
  }, []);

  const onPipPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = pipDragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    pipDragRef.current = null;
  }, []);

  const joinCall = useCallback(
    async (targetSession: CommunityMessengerCallSession) => {
      if (joinedRef.current || joiningRef.current) return;
      if (isTerminalCallSessionStatus(targetSession.status)) return;
      if (isCommunityMessengerMediaBlockedByInsecureOrigin()) {
        autoJoinBlockedRef.current = true;
        setErrorMessage(COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC);
        return;
      }
      joiningRef.current = true;
      setBusy("join");
      setErrorMessage(null);
      const joinT0 = perfNow();

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
          pendingNetworkQualityRef.current = {
            u: stats.uplinkNetworkQuality ?? 0,
            d: stats.downlinkNetworkQuality ?? 0,
          };
          if (networkQualityFlushTimerRef.current != null) return;
          networkQualityFlushTimerRef.current = setTimeout(() => {
            networkQualityFlushTimerRef.current = null;
            const p = pendingNetworkQualityRef.current;
            if (!p) return;
            setLastMileLine(formatMessengerAgoraLastMileLine(p.u, p.d));
          }, 480);
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
        const at = tracks.audioTrack;
        if (at) {
          try {
            await at.setEnabled(!micMutedRef.current);
          } catch {
            /* ignore */
          }
        }
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
    if (isTerminalCallSessionStatus(s.status)) return null;
    if (!s.isMineInitiator) {
      setCalleeVideoConnectingShell(true);
    }
    const acceptT0 = perfNow();
    callFlowAcceptStartRef.current = acceptT0;
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
        callFlowAcceptStartRef.current = null;
        if (!s.isMineInitiator) {
          setCalleeVideoConnectingShell(false);
        }
        return null;
      }
      const patchMs = Math.round(perfNow() - acceptT0);
      messengerMonitorCallFlowPhase(s.id, "flow_call_accept_patch", patchMs, { media: s.callKind, role: "callee" });
      logClientPerf("messenger-call.accept", {
        phase: "patch_ok",
        ms: patchMs,
        sessionIdSuffix: s.id.slice(-8),
        media: s.callKind,
      });
      setSession(json.session);
      return json.session;
    } catch (e) {
      callFlowAcceptStartRef.current = null;
      if (!s.isMineInitiator) {
        setCalleeVideoConnectingShell(false);
      }
      throw e;
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
          await acceptIncoming();
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

  const applyTerminalSessionAfterPatch = useCallback(
    (
      json: SessionResponse,
      fallbackRoomId: string,
      fallbackId: string,
      optimisticTerminal: CommunityMessengerCallSession["status"]
    ) => {
      const endedAtIso = new Date().toISOString();
      let snapshot: CommunityMessengerCallSession | null =
        json.session && isTerminalCallSessionStatus(json.session.status) ? json.session : null;
      if (!snapshot && isTerminalCallSessionStatus(optimisticTerminal)) {
        const prev = sessionRef.current;
        if (prev?.id === fallbackId) {
          snapshot = { ...prev, status: optimisticTerminal, endedAt: endedAtIso };
        }
      }
      if (snapshot) {
        callTerminalLocalPinRef.current = {
          sessionId: fallbackId,
          until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS,
          snapshot,
        };
        setSession(snapshot);
      }
      joiningRef.current = false;
      setJoined(false);
      joinedRef.current = false;
      setRemoteJoined(false);
    },
    []
  );

  const rejectIncoming = useCallback(async () => {
    if (!session) return;
    stopCommunityMessengerCallFeedback();
    setBusy("reject");
    const sid = session.id;
    const peer = session.peerUserId?.trim();
    try {
      if (peer) {
        void notifyCommunityMessengerCallInviteHangupBestEffort(peer, sid, { roomId: session.roomId });
        try {
          await postCommunityMessengerCallHangupSignal({ sessionId: sid, toUserId: peer, reason: "reject" });
        } catch {
          /* PATCH 로 세션 종료 — 시그널은 best-effort */
        }
      }
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
      let snap: CommunityMessengerCallSession | null =
        json.session && isTerminalCallSessionStatus(json.session.status) ? json.session : null;
      if (!snap) {
        const prev = sessionRef.current;
        if (prev?.id === sid) {
          snap = { ...prev, status: "rejected", endedAt: new Date().toISOString() };
        }
      }
      if (snap) {
        callTerminalLocalPinRef.current = { sessionId: sid, until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS, snapshot: snap };
        setSession(snap);
      }
      joiningRef.current = false;
      setJoined(false);
      joinedRef.current = false;
      setRemoteJoined(false);
      void disposeCallMedia().catch(() => {});
      navigateBackFromCommunityMessengerCall(router, snap?.roomId ?? null);
    } finally {
      setBusy(null);
    }
  }, [disposeCallMedia, refreshSession, router, session]);

  const endCall = useCallback(async () => {
    if (!session) return;
    stopCommunityMessengerCallFeedback();
    setBusy("end");
    const roomId = session.roomId;
    const sid = session.id;
    const peer = session.peerUserId?.trim();
    const hangupReason =
      session.status === "ringing" && session.isMineInitiator ? "cancel" : "end";
    try {
      if (peer) {
        void notifyCommunityMessengerCallInviteHangupBestEffort(peer, sid, { roomId: session.roomId });
        try {
          await postCommunityMessengerCallHangupSignal({ sessionId: sid, toUserId: peer, reason: hangupReason });
        } catch {
          /* PATCH 가 최종 상태 — hangup 은 상대 클라 빠른 갱신용 */
        }
      }
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
      /* 서버 응답을 즉시 반영하고, Agora leave 등은 기다리지 않는다 — 수신 종료 시 UI가 active 에 고정되던 문제 */
      const optimisticEnd =
        session.status === "ringing" && session.isMineInitiator ? "cancelled" : "ended";
      applyTerminalSessionAfterPatch(json, roomId, sid, optimisticEnd);
      void disposeCallMedia().catch(() => {});
      navigateBackFromCommunityMessengerCall(router, roomId);
    } finally {
      setBusy(null);
    }
  }, [applyTerminalSessionAfterPatch, disposeCallMedia, elapsedSeconds, refreshSession, router, session]);

  const requestUpgradeToVideo = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || s.sessionMode !== "direct") {
      showMessengerSnackbar("이 통화에서는 영상 전환을 사용할 수 없습니다.");
      return;
    }
    if (s.callKind === "video") {
      showMessengerSnackbar("이미 영상 통화입니다.");
      return;
    }
    const ringingUpgrade = s.status === "ringing" && s.isMineInitiator;
    const activeUpgrade = joined && s.status === "active";
    if (!ringingUpgrade && !activeUpgrade) {
      showMessengerSnackbar("지금은 영상으로 전환할 수 없어요.");
      return;
    }
    if (activeUpgrade && localTracksRef.current?.videoTrack) {
      showMessengerSnackbar("카메라가 이미 켜져 있습니다.");
      return;
    }

    if (ringingUpgrade) {
      setBusy("upgrade");
      setErrorMessage(null);
      try {
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
                : code === "trade_chat_video_not_allowed"
                  ? "이 글에서는 음성 통화만 허용되어 있습니다."
                  : code === "trade_chat_calls_disabled"
                    ? "이 글의 판매자가 거래 채팅 통화를 허용하지 않았습니다."
                    : "영상 전환에 실패했습니다. 잠시 후 다시 시도해 주세요."
          );
          return;
        }
        setSession(json.session);
        setSpeakerEnabled(true);
        showMessengerSnackbar("영상 통화로 바꿨어요. 연결되면 카메라가 사용됩니다.");
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy("join");
    setErrorMessage(null);
    try {
      const perm = await ensureVideoPermission();
      if (!perm.ok) {
        setErrorMessage(
          perm.code === "denied"
            ? "카메라·마이크 권한이 꺼져 있습니다. 주소창 사이트 설정에서 허용해 주세요."
            : perm.code === "insecure_context"
              ? COMMUNITY_MESSENGER_INSECURE_ORIGIN_MEDIA_HINT
              : "브라우저에서 카메라를 사용할 수 없습니다."
        );
        return;
      }
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
              : code === "trade_chat_video_not_allowed"
                ? "이 글에서는 음성 통화만 허용되어 있습니다."
                : code === "trade_chat_calls_disabled"
                  ? "이 글의 판매자가 거래 채팅 통화를 허용하지 않았습니다."
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
  }, [bindLocalVideoTrack, joined]);

  const requestDowngradeToVoice = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || s.sessionMode !== "direct") {
      showMessengerSnackbar("이 통화에서는 음성으로 전환할 수 없습니다.");
      return;
    }
    if (s.callKind !== "video") {
      showMessengerSnackbar("이미 음성 통화입니다.");
      return;
    }
    const ringingDowngrade = s.status === "ringing";
    const activeDowngrade = joinedRef.current && s.status === "active";
    if (!ringingDowngrade && !activeDowngrade) {
      showMessengerSnackbar("지금은 음성으로 전환할 수 없어요.");
      return;
    }
    setBusy("join");
    setErrorMessage(null);
    try {
      if (activeDowngrade) {
        const client = clientRef.current;
        const vt = localTracksRef.current?.videoTrack;
        if (client && vt) {
          try {
            await client.unpublish([vt]);
          } catch {
            /* ignore */
          }
          try {
            vt.stop();
          } catch {
            /* ignore */
          }
          try {
            vt.close();
          } catch {
            /* ignore */
          }
          const tracks = localTracksRef.current;
          if (tracks) {
            localTracksRef.current = { ...tracks, videoTrack: null };
          }
        }
        setLocalVideoReady(false);
        setCameraSwitchSupported(false);
      }
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(s.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "downgrade_to_voice" }),
      });
      const json = (await res.json().catch(() => ({}))) as SessionResponse;
      if (!res.ok || !json.ok || !json.session) {
        const code = json.error;
        setErrorMessage(
          code === "bad_action"
            ? "지금은 음성으로 전환할 수 없습니다."
            : code === "forbidden"
              ? "권한이 없습니다."
              : "음성 전환에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
        return;
      }
      setSession(json.session);
      setCamOff(false);
      setLayoutSwapped(false);
      autoVideoPublishAttemptedRef.current = null;
      bindLocalVideoTrack();
      setSpeakerEnabled(false);
      showMessengerSnackbar("음성 통화로 바꿨어요.");
    } catch (e) {
      setErrorMessage(getCommunityMessengerMediaErrorMessage(e, "video"));
    } finally {
      setBusy(null);
    }
  }, [bindLocalVideoTrack]);

  useEffect(() => {
    let cancelled = false;
    const shellT0 = perfNow();
    const bootstrap = async () => {
      const prevDetached = takeDetachedCommunityCallCleanup(sessionId);
      if (prevDetached) {
        await prevDetached();
      }
      const fromServer = initialSessionRef.current;
      const sessionUrl = `/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`;

      if (fromServer != null) {
        const ms = Math.round(perfNow() - shellT0);
        messengerMonitorCallFlowPhase(sessionId, "flow_call_session_shell", ms, {
          media: fromServer.callKind,
          role: fromServer.isMineInitiator ? "initiator" : "callee",
          source: "rsc",
        });
        logClientPerf("messenger-call.session.shell", {
          phase: "rsc_seed",
          ms,
          sessionIdSuffix: sessionId.slice(-8),
          media: fromServer.callKind,
          initiator: fromServer.isMineInitiator,
        });
        setSession((prev) => {
          const resolved = pickCallSessionSnapshotAfterFetch(prev, fromServer);
          return sessionsMeaningfullyEqual(prev, resolved) ? prev : resolved;
        });
        setLoading(false);
        /* 토큰은 아래 prefetch useEffect 한 경로만 호출 — bootstrap 과 중복 /token 요청 방지 */
        scheduleSilentRefresh("ui");
        return;
      }

      if (sessionRef.current) {
        setLoading(false);
        scheduleSilentRefresh("ui");
        return;
      }

      setLoading(true);
      try {
        const sessionRes = await fetch(sessionUrl, { cache: "no-store" });
        if (cancelled) return;
        const json = (await sessionRes.json().catch(() => ({}))) as SessionResponse;
        const nextSession = sessionRes.ok && json.ok && json.session ? json.session : null;
        const ms = Math.round(perfNow() - shellT0);
        logClientPerf("messenger-call.session.shell", {
          phase: nextSession ? "fetch_ok" : "fetch_miss",
          ms,
          sessionIdSuffix: sessionId.slice(-8),
          ...(nextSession
            ? { media: nextSession.callKind, initiator: nextSession.isMineInitiator }
            : {}),
        });
        if (nextSession) {
          messengerMonitorCallFlowPhase(sessionId, "flow_call_session_shell", ms, {
            media: nextSession.callKind,
            role: nextSession.isMineInitiator ? "initiator" : "callee",
            source: "fetch",
          });
        }
        setSession((prev) => {
          const resolved = pickCallSessionSnapshotAfterFetch(prev, nextSession);
          return sessionsMeaningfullyEqual(prev, resolved) ? prev : resolved;
        });
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
      void disposeCallMedia();
    };
  }, [disposeCallMedia, refreshSession, sessionId]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb || !sessionId) return;
    const scheduleRefresh = () => {
      if (sessionRealtimeDebounceRef.current) clearTimeout(sessionRealtimeDebounceRef.current);
      sessionRealtimeDebounceRef.current = setTimeout(() => {
        sessionRealtimeDebounceRef.current = null;
        scheduleSilentRefresh("realtime");
      }, MESSENGER_CALL_SESSION_REALTIME_DEBOUNCE_MS);
    };
    let cancelled = false;
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-call-session:${sessionId}`,
      scope: "community-messenger-call-client:session",
      isCancelled: () => cancelled,
      onStatus: (status) => {
        setSessionRealtimeSubscribed(status === "SUBSCRIBED");
      },
      build: (ch) =>
        ch.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_call_sessions",
            filter: `id=eq.${sessionId}`,
          },
          (payload) => {
            const row =
              (payload.new as Record<string, unknown> | null | undefined) ??
              (payload.old as Record<string, unknown> | null | undefined) ??
              null;
            if (row) {
              setSession((prev) => mergeRealtimeSessionRowIntoSnapshot(prev, row, sessionId));
            }
            const status = readRealtimeSessionStatus(row?.status);
            if (status && isTerminalCallSessionStatus(status)) {
              if (sessionRealtimeDebounceRef.current) {
                clearTimeout(sessionRealtimeDebounceRef.current);
                sessionRealtimeDebounceRef.current = null;
              }
              void refreshSession(true);
              return;
            }
            scheduleRefresh();
          }
        ),
    });

    return () => {
      cancelled = true;
      setSessionRealtimeSubscribed(false);
      if (sessionRealtimeDebounceRef.current) {
        clearTimeout(sessionRealtimeDebounceRef.current);
        sessionRealtimeDebounceRef.current = null;
      }
      sub.stop();
    };
  }, [refreshSession, scheduleSilentRefresh, sessionId]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb || !sessionId) return;
    let cancelled = false;
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-call-signal-hangup:${sessionId}`,
      scope: "community-messenger-call-client:hangup-signal",
      isCancelled: () => cancelled,
      build: (ch) =>
        ch.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "community_messenger_call_signals",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown> | undefined;
            if (!row) return;
            if (String(row.signal_type ?? "") !== "hangup") return;
            const active = sessionRef.current;
            if (!active || active.id !== sessionId || isTerminalCallSessionStatus(active.status)) return;
            const fromUserId = typeof row.from_user_id === "string" ? row.from_user_id.trim() : "";
            const peerUserId = active.peerUserId?.trim() ?? "";
            if (peerUserId && fromUserId && fromUserId !== peerUserId) return;
            const payloadObj =
              row.payload && typeof row.payload === "object"
                ? (row.payload as Record<string, unknown>)
                : null;
            const nextStatus = mapHangupReasonToTerminalStatus(payloadObj?.reason);
            if (!nextStatus) return;
            const endedAtIso = new Date().toISOString();
            const snapshot: CommunityMessengerCallSession = {
              ...active,
              status: nextStatus,
              endedAt: endedAtIso,
            };
            callTerminalLocalPinRef.current = {
              sessionId,
              until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS,
              snapshot,
            };
            setSession(snapshot);
            joiningRef.current = false;
            setJoined(false);
            joinedRef.current = false;
            setRemoteJoined(false);
            void disposeCallMedia().catch(() => {});
            navigateBackFromCommunityMessengerCall(router, active.roomId);
          }
        ),
    });
    return () => {
      cancelled = true;
      sub.stop();
    };
  }, [disposeCallMedia, router, sessionId]);

  useEffect(() => {
    const sb = getSupabaseClient();
    const current = sessionRef.current;
    const myUserId =
      current?.participants.find((p) => p.isMe)?.userId?.trim() ??
      (current?.isMineInitiator
        ? current.initiatorUserId.trim()
        : (current?.recipientUserId?.trim() ?? ""));
    if (!sb || !sessionId || !myUserId) return;
    let cancelled = false;
    const ch = subscribeCommunityMessengerCallInviteBroadcast(sb, myUserId, {
      onRing: () => {
        if (!cancelled) scheduleSilentRefresh("realtime");
      },
      onHangup: (payload) => {
        if (cancelled) return;
        const sid = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
        if (!sid || sid !== sessionId) return;
        const active = sessionRef.current;
        if (!active || active.id !== sessionId || isTerminalCallSessionStatus(active.status)) return;
        const optimisticStatus: CommunityMessengerCallSession["status"] =
          active.status === "ringing" && active.isMineInitiator ? "cancelled" : "ended";
        const nowIso = new Date().toISOString();
        const snapshot: CommunityMessengerCallSession = {
          ...active,
          status: optimisticStatus,
          endedAt: nowIso,
        };
        callTerminalLocalPinRef.current = {
          sessionId,
          until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS,
          snapshot,
        };
        setSession(snapshot);
        joiningRef.current = false;
        setJoined(false);
        joinedRef.current = false;
        setRemoteJoined(false);
        void disposeCallMedia().catch(() => {});
        navigateBackFromCommunityMessengerCall(router, snapshot.roomId);
      },
    });
    return () => {
      cancelled = true;
      void sb.removeChannel(ch);
    };
  }, [disposeCallMedia, router, scheduleSilentRefresh, session?.id, session?.participants, sessionId]);

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

    const tryInitiatorJoin = () => {
      const cur = sessionRef.current;
      if (
        cur &&
        cur.isMineInitiator &&
        cur.sessionMode === "direct" &&
        !isTerminalCallSessionStatus(cur.status)
      ) {
        void joinCall(cur);
      }
    };

    /** Permissions API 대기 없이 즉시 조인 — 재방문·이미 허용한 브라우저에서 체감 지연 제거 */
    if (hasCommunityMessengerMediaTrustedMark()) {
      setCallerMediaConsentDone(true);
      tryInitiatorJoin();
    }

    void (async () => {
      const skip = await shouldSkipCallerMediaGateOverlay(session.callKind);
      if (cancelled) return;
      setCallerMediaConsentDone(skip);
      if (skip) {
        tryInitiatorJoin();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinCall, session?.callKind, session?.id, session?.isMineInitiator, session?.sessionMode, session?.status]);

  useEffect(() => {
    if (!session) return;
    if (!isTerminalCallSessionStatus(session.status)) return;
    const endedAtMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    if (!terminalClosedAt) {
      setTerminalClosedAt(endedAtMs);
      setEndedDurationSeconds(
        connectedAtTs != null ? Math.max(0, Math.floor((endedAtMs - connectedAtTs) / 1000)) : null
      );
      void disposeCallMedia();
      try {
        sessionStorage.removeItem("cm_minimized_call_session");
        sessionStorage.removeItem("cm_minimized_call_room");
      } catch {
        /* ignore */
      }
    }
  }, [connectedAtTs, disposeCallMedia, session, terminalClosedAt]);

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
      void acceptIncoming().finally(() => {
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
    if (!session?.startedAt) return;
    const startedAtMs = new Date(session.startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) return;
    setRingStartAt((prev) => prev ?? startedAtMs);
  }, [session?.id, session?.startedAt]);

  useEffect(() => {
    const sid = session?.id;
    if (!sid) return;
    if (!joined) {
      callFlowPrevRemoteJoinedRef.current = remoteJoined;
      return;
    }
    const prevR = callFlowPrevRemoteJoinedRef.current;
    if (remoteJoined && !prevR && session) {
      const t0 = callFlowLocalPublishAtRef.current;
      if (t0 != null) {
        const ms = Math.round(perfNow() - t0);
        const media = session.callKind === "video" ? "video" : "voice";
        const role = session.isMineInitiator ? "initiator" : "callee";
        messengerMonitorCallFlowPhase(sid, "flow_call_remote_after_publish", ms, { media, role });
        logClientPerf("messenger-call.remote", {
          phase: "first_media",
          ms,
          sessionIdSuffix: sid.slice(-8),
          media,
          role,
        });
      }
    }
    callFlowPrevRemoteJoinedRef.current = remoteJoined;
  }, [joined, remoteJoined, session]);

  useEffect(() => {
    if (!session || session.status !== "active") return;
    if (!joined || !remoteJoined) return;
    setConnectedAtTs((prev) => prev ?? Date.now());
  }, [joined, remoteJoined, session?.id, session?.status]);

  useEffect(() => {
    if (session?.callKind !== "video") return;
    if (!joined || !remoteJoined) {
      hadRemoteVideoForLayoutRef.current = false;
      return;
    }
    if (!remoteVideoReady) {
      return;
    }
    if (!hadRemoteVideoForLayoutRef.current) {
      hadRemoteVideoForLayoutRef.current = true;
      setLayoutSwapped(false);
    }
  }, [joined, remoteJoined, remoteVideoReady, session?.callKind]);

  useEffect(() => {
    if (!joined || !session || session.callKind !== "video") {
      setCameraSwitchSupported(false);
      return;
    }
    setCameraSwitchSupported(isCameraVideoTrackWithDevice(localTracksRef.current?.videoTrack ?? null));
  }, [joined, session?.callKind, session?.id, localVideoReady]);

  useEffect(() => {
    if (!session) return;
    const pollMs = getCallSessionClientPollIntervalMs(CALL_CLIENT_TIER, {
      sessionMode: session.sessionMode,
      status: session.status,
      joined,
      remoteJoined,
      realtimeSubscribed: sessionRealtimeSubscribed,
    });
    if (pollMs == null) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      scheduleSilentRefresh("poll");
    };
    const timer = window.setInterval(tick, pollMs);
    return () => window.clearInterval(timer);
  }, [joined, remoteJoined, scheduleSilentRefresh, sessionRealtimeSubscribed, session?.id, session?.sessionMode, session?.status]);

  /**
   * 미디어(Agora) 조인 전에 종료·취소된 통화 — 종료 화면을 기다리지 않고 즉시 이탈.
   * (수신 측 링 중 상대 취소, 발신 측 상대 거절 등 `autoCloseMs` 지연 체감 제거)
   */
  useEffect(() => {
    if (!session?.id) return;
    if (!isTerminalCallSessionStatus(session.status)) return;
    if (joined) return;
    if (callTerminalAutoNavigatedRef.current === session.id) return;
    callTerminalAutoNavigatedRef.current = session.id;
    void disposeCallMedia().catch(() => {});
    navigateBackFromCommunityMessengerCall(router, session.roomId);
  }, [disposeCallMedia, joined, router, session?.id, session?.roomId, session?.status]);

  /** 조건부 return 위에 두어야 함 — 그 아래에서 훅을 호출하면 렌더마다 훅 개수가 달라져 런타임 오류가 난다. */
  const closeTerminalView = useCallback(() => {
    navigateBackFromCommunityMessengerCall(router, sessionRef.current?.roomId);
  }, [router]);

  if (loading && !session) {
    /** 시드 없이 진입한 짧은 구간 — 보라 플레이스홀더(`RouteLoading`)는 실제 통화 UI 와 겹쳐 보여 동일 껍데기로만 표시 */
    const dismissHydrate = () => navigateBackFromCommunityMessengerCall(router, null);
    const hydrateVm: CallScreenViewModel = {
      mode: "video",
      direction: "outgoing",
      phase: "connecting",
      peerLabel: "통화",
      peerAvatarUrl: null,
      statusText: "연결 준비 중",
      subStatusText: "통화 정보를 불러오는 중입니다.",
      topLabel: null,
      onTopLabelClick: null,
      footerNote: null,
      connectionLabel: null,
      connectedAt: null,
      endedAt: null,
      endedDurationSeconds: null,
      mediaState: {
        micEnabled: true,
        speakerEnabled: true,
        cameraEnabled: true,
        localVideoMinimized: true,
      },
      onBack: dismissHydrate,
      hideOutgoingVideoBrandRow: true,
      primaryActions: [
        {
          id: "end",
          label: "닫기",
          icon: "end",
          tone: "danger",
          onClick: dismissHydrate,
        },
      ],
      mainVideoSlot: (
        <div className="absolute inset-0 bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
          <OutgoingCallPreJoinLocalCameraPreview />
        </div>
      ),
      showRemoteVideo: false,
      showLocalVideo: false,
      videoPipLayout: null,
      participantsSummary: null,
      autoCloseMs: null,
    };
    return <CallScreen vm={hydrateVm} variant="page" />;
  }

  if (!session) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="sam-text-page-title font-semibold text-ui-fg">통화를 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={() => router.replace("/community-messenger?section=chats")}
          className="rounded-ui-rect bg-ui-fg px-4 py-3 sam-text-body font-semibold text-ui-surface"
        >
          메신저로 돌아가기
        </button>
      </div>
    );
  }

  const videoCall = session.callKind === "video";
  const directPhase = resolveDirectCallPhase(session.status, joined, remoteJoined);
  /**
   * 전용 통화 페이지에서 자동/수동 수락 PATCH 직전까지 `ringing` 이면 CallScreen 이 IncomingCallView(벨 UI)를 다시 그린다.
   * `?action=accept`·`busy==="accept"`·수락 래치(`calleeVideoConnectingShell`) 중에는 phase 만 `connecting` 으로 올린다.
   */
  const calleeAcceptBridgeLayout =
    !session.isMineInitiator &&
    session.status === "ringing" &&
    (requestedAction === "accept" || busy === "accept" || calleeVideoConnectingShell);
  const callScreenPhase: CallPhase =
    calleeAcceptBridgeLayout && directPhase === "ringing" ? "connecting" : directPhase;
  /** 발신자만: 브라우저 GUM 제스처 전 — 벨/연결 UI와 「허용」 CTA 를 한 흐름으로 묶음 */
  const showCallerMediaGate =
    session.isMineInitiator &&
    !callerMediaConsentDone &&
    !joined &&
    (session.status === "ringing" || session.status === "active");

  const acceptFromScreen = () => {
    autoJoinBlockedRef.current = false;
    void acceptIncoming();
  };

  const startOutgoingAgain = (kind: "voice" | "video") => {
    void (async () => {
      try {
        const result = await bootstrapCommunityMessengerOutgoingCallAndNavigate(
          { roomId: session.roomId, peerUserId: session.peerUserId ?? null, kind },
          (href) => router.replace(href)
        );
        if (!result.ok) {
          showMessengerSnackbar(result.userMessage, { variant: "error" });
        }
      } catch {
        showMessengerSnackbar("네트워크 오류로 통화를 시작하지 못했습니다.", { variant: "error" });
      }
    })();
  };

  const primaryActions: CallActionItem[] = [];
  const secondaryActions: CallActionItem[] = [];

  if (directPhase === "ended" || directPhase === "declined" || directPhase === "missed" || directPhase === "failed") {
    primaryActions.push({
      id: "retry-call",
      label: "다시 시도",
      icon: "retry",
      onClick: () => startOutgoingAgain("voice"),
      disabled: !session.peerUserId,
    });
  } else if (session.isMineInitiator && showCallerMediaGate) {
    /** 권한 대기: 음성은 스피커·영상·음소거 탭, 영상은 전환·영상·음소거 탭이 동일 제스처로 GUM·조인 */
    const gateBusy = busy === "join" || busy === "accept";
    const grantConnect = () => void confirmCallerMediaAndConnect();
    if (!videoCall) {
      primaryActions.push(
        {
          id: "speaker",
          label: "스피커",
          icon: "speaker",
          active: speakerEnabled,
          disabled: busy === "upgrade" || gateBusy,
          onClick: grantConnect,
        },
        {
          id: "upgrade-video",
          label: "영상",
          icon: "video",
          active: session.callKind === "video",
          disabled: busy === "upgrade" || busy === "end" || gateBusy,
          onClick: grantConnect,
        },
        {
          id: "mute",
          label: micMuted ? "음소거 해제" : "음소거",
          icon: "mic",
          active: !micMuted,
          disabled: busy === "end" || gateBusy,
          onClick: grantConnect,
        },
        {
          id: "end",
          label: busy === "end" ? "취소 중" : "종료",
          icon: "end",
          tone: "danger",
          disabled: busy === "end",
          onClick: () => void endCall(),
        }
      );
    } else {
      primaryActions.push(
        {
          id: "switch-camera",
          label: "전환",
          icon: "camera-switch",
          disabled: gateBusy,
          onClick: grantConnect,
        },
        {
          id: "camera",
          label: "영상",
          icon: "camera",
          active: true,
          disabled: gateBusy,
          onClick: grantConnect,
        },
        {
          id: "mute",
          label: micMuted ? "음소거 해제" : "음소거",
          icon: "mic",
          active: !micMuted,
          disabled: gateBusy,
          onClick: grantConnect,
        },
        {
          id: "end",
          label: busy === "end" ? "취소 중" : "종료",
          icon: "end",
          tone: "danger",
          disabled: busy === "end",
          onClick: () => void endCall(),
        }
      );
    }
  } else if (session.isMineInitiator && directPhase === "ringing" && !videoCall) {
    /** 음성 발신 벨 — 권한 이미 허용됨: 실제 스피커·영상 전환·음소거 */
    primaryActions.push(
      {
        id: "speaker",
        label: "스피커",
        icon: "speaker",
        active: speakerEnabled,
        disabled: busy === "upgrade",
        onClick: toggleSpeakerEnabled,
      },
      {
        id: "upgrade-video",
        label: "영상",
        icon: "video",
        active: session.callKind === "video",
        disabled: busy === "upgrade" || busy === "end",
        onClick: () => void requestUpgradeToVideo(),
      },
      {
        id: "mute",
        label: micMuted ? "음소거 해제" : "음소거",
        icon: "mic",
        active: !micMuted,
        disabled: !joined || busy === "end",
        onClick: () => void toggleMicEnabled(),
      },
      {
        id: "end",
        label: busy === "end" ? "취소 중" : "종료",
        icon: "end",
        tone: "danger",
        disabled: busy === "end",
        onClick: () => void endCall(),
      }
    );
  } else if (!session.isMineInitiator && directPhase === "ringing") {
    primaryActions.push(
      {
        id: "reject",
        label: busy === "reject" ? "거절 중" : "거절",
        icon: "decline",
        tone: "danger",
        disabled: busy === "reject" || busy === "accept" || busy === "join",
        onClick: () => void rejectIncoming(),
      },
      {
        id: "accept",
        label: busy === "accept" || busy === "join" ? "연결 중" : "수락",
        icon: "accept",
        tone: "accept",
        disabled: busy === "accept" || busy === "join",
        onClick: acceptFromScreen,
      }
    );
  } else if (videoCall) {
    const mediaReady = joined;
    primaryActions.push(
      {
        id: "switch-camera",
        label: "전환",
        icon: "camera-switch",
        disabled: !mediaReady || !cameraSwitchSupported || busy === "camera",
        onClick: () => void switchCameraFacing(),
      },
      {
        id: "swap-pip-main",
        label: "화면 전환",
        icon: "pip-swap",
        disabled:
          !mediaReady ||
          !remoteJoined ||
          !localVideoReady ||
          camOff ||
          busy === "join" ||
          busy === "upgrade",
        onClick: () => setLayoutSwapped((p) => !p),
      },
      {
        id: "camera",
        label: "영상",
        icon: "camera",
        active: !camOff,
        disabled: !mediaReady || busy === "join" || busy === "upgrade",
        onClick: () => void toggleCamEnabled(),
      },
      {
        id: "mute",
        label: micMuted ? "음소거 해제" : "음소거",
        icon: "mic",
        active: !micMuted,
        disabled: busy === "join" || busy === "upgrade",
        onClick: () => void toggleMicEnabled(),
      },
      {
        id: "end",
        label: busy === "end" ? "종료 중" : "종료",
        icon: "end",
        tone: "danger",
        disabled: busy === "end",
        onClick: () => void endCall(),
      }
    );
  } else {
    primaryActions.push(
      {
        id: "speaker",
        label: "스피커",
        icon: "speaker",
        active: speakerEnabled,
        disabled: busy === "upgrade",
        onClick: toggleSpeakerEnabled,
      },
      {
        id: "upgrade-video",
        label: "영상 전환",
        icon: "video",
        active: session.callKind === "video",
        disabled:
          session.callKind !== "voice" ||
          busy === "join" ||
          busy === "upgrade" ||
          busy === "end" ||
          (session.status === "ringing" ? !session.isMineInitiator : !(joined && session.status === "active")),
        onClick: () => void requestUpgradeToVideo(),
      },
      {
        id: "mute",
        label: micMuted ? "음소거 해제" : "음소거",
        icon: "mic",
        active: !micMuted,
        disabled: busy === "join" || busy === "upgrade",
        onClick: () => void toggleMicEnabled(),
      },
      {
        id: "end",
        label: busy === "end" ? "종료 중" : "종료",
        icon: "end",
        tone: "danger",
        disabled: busy === "end",
        onClick: () => void endCall(),
      }
    );
  }

  if (
    errorMessage &&
    !isCommunityMessengerNonRetryableCallErrorMessage(errorMessage) &&
    directPhase !== "ended" &&
    directPhase !== "declined" &&
    directPhase !== "missed" &&
    directPhase !== "failed"
  ) {
    secondaryActions.push({
      id: "retry-media",
      label: busy === "join" || busy === "accept" ? "재시도 중" : "다시 시도",
      icon: "retry",
      disabled: busy === "join" || busy === "accept",
      onClick: handleRetryMediaAndJoin,
    });
  }

  if (directPhase === "ended" || directPhase === "declined" || directPhase === "missed" || directPhase === "failed") {
    secondaryActions.push({
      id: "close-terminal",
      label: "닫기",
      icon: "close",
      onClick: closeTerminalView,
    });
  }

  const statusText =
    showCallerMediaGate && directPhase === "ringing"
      ? videoCall
        ? "카메라·마이크 권한 필요"
        : "마이크 권한 필요"
      : callScreenPhase === "ringing"
        ? session.isMineInitiator
          ? videoCall
            ? "연결 요청 중…"
            : "전화 거는 중 …"
          : videoCall
            ? "영상 통화"
            : "음성 통화"
        : callScreenPhase === "connecting"
          ? "연결중..."
          : callScreenPhase === "connected"
            ? videoCall
              ? "영상 통화 중"
              : "통화 중"
            : callScreenPhase === "declined"
              ? "거절됨"
              : callScreenPhase === "missed"
              ? "부재중 알림"
                : callScreenPhase === "failed"
                  ? "연결 실패"
                  : session.status === "cancelled"
                    ? "통화 취소"
                  : "통화 종료";

  const subStatusText =
    errorMessage ??
    (showCallerMediaGate && directPhase === "ringing"
      ? videoCall
        ? "아래 버튼에서 마이크·카메라 권한을 허용해야 실제 통화 연결이 진행됩니다."
        : "스피커·영상·음소거 중 하나를 눌러 마이크를 허용하면 연결이 진행됩니다."
      : callScreenPhase === "ringing"
        ? session.isMineInitiator
          ? "상대가 받을 때까지 기다리는 중입니다."
          : "수락 또는 거절을 선택해 주세요."
        : callScreenPhase === "connecting"
        ? calleeAcceptBridgeLayout
          ? "통화에 연결하는 중입니다."
          : "실제 미디어 연결을 붙이는 중입니다."
        : callScreenPhase === "connected"
          ? lastMileLine
          : null);

  const callVm: CallScreenViewModel = {
    mode: videoCall ? "video" : "voice",
    direction: session.isMineInitiator ? "outgoing" : "incoming",
    phase: callScreenPhase,
    peerLabel: session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl ?? null,
    statusText,
    subStatusText,
    topLabel: null,
    onTopLabelClick: null,
    footerNote:
      showCallerMediaGate && directPhase === "ringing"
        ? null
        : showCallerMediaGate
          ? "브라우저 권한을 허용해야 실제 연결이 시작됩니다."
          : directPhase === "ringing" && ringStartAt
            ? "통화 시간은 실제 연결 완료 후부터 시작됩니다."
            : null,
    connectionLabel: callScreenPhase === "connected" ? lastMileLine : null,
    connectedAt: connectedAtTs,
    endedAt: terminalClosedAt,
    endedDurationSeconds,
    mediaState: {
      micEnabled: !micMuted,
      speakerEnabled,
      cameraEnabled: !camOff,
      localVideoMinimized: true,
    },
    onBack:
      videoCall && session.isMineInitiator && (callScreenPhase === "ringing" || callScreenPhase === "connecting")
        ? () => void endCall()
        : null,
    hideOutgoingVideoBrandRow:
      Boolean(videoCall && session.isMineInitiator && !(remoteJoined && remoteVideoReady)),
    primaryActions,
    secondaryActions,
    mainVideoSlot: videoCall ? (
      <div className="absolute inset-0 bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        {(session.isMineInitiator || (calleeAcceptBridgeLayout && videoCall)) && (!joined || !localVideoReady) ? (
          <div className="absolute inset-0 z-0">
            <OutgoingCallPreJoinLocalCameraPreview />
          </div>
        ) : null}
        <div ref={largeVideoRef} className="absolute inset-0 z-[1] h-full w-full" />
      </div>
    ) : undefined,
    miniVideoSlot: videoCall ? (
      <div className="h-full w-full bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        <div ref={smallVideoRef} className="h-full w-full" />
      </div>
    ) : undefined,
    showRemoteVideo: videoCall ? remoteJoined && remoteVideoReady : false,
    showLocalVideo: videoCall && joined && remoteJoined && localVideoReady && !camOff,
    videoPipLayout:
      videoCall && joined && remoteJoined && localVideoReady && !camOff
        ? {
            stageRef: videoStageRef,
            pipRef: pipWrapRef,
            pipPixelPosition,
            onPipPointerDown,
            onPipPointerMove,
            onPipPointerUp,
            onPipPointerCancel,
            pipLabel: layoutSwapped ? session.peerLabel : "나",
          }
        : null,
    participantsSummary: null,
    /** 종료·거절 직후 `router.replace` 가 기본 — 세션 없음 등 예외에서만 짧은 자동 닫기 백업 */
    autoCloseMs:
      directPhase === "ended" || directPhase === "declined" || directPhase === "missed" || directPhase === "failed"
        ? joined
          ? 900
          : 320
        : null,
  };

  return <CallScreen vm={callVm} variant="page" />;
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
          <p className="sam-text-body font-semibold text-white">자판</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 sam-text-body-secondary font-medium text-white/75 transition hover:bg-sam-surface/10"
          >
            닫기
          </button>
        </div>
        <p className="mb-3 sam-text-xxs leading-snug text-white/45">로컬에서만 톤이 재생됩니다. 상대에게는 전달되지 않을 수 있습니다.</p>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => playDtmfDigit(k)}
              className="flex h-12 items-center justify-center rounded-full border border-sam-surface/18 bg-sam-surface/[0.06] sam-text-page-title font-semibold text-white transition active:scale-95 active:bg-sam-surface/12"
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
      className={`flex h-[88px] w-full max-w-[108px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-full border-2 sam-text-xxs font-medium tracking-tight text-white/95 transition active:scale-[0.96] disabled:opacity-40 ${
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
      className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-ui-rect border px-2 py-2 text-center sam-text-xxs disabled:opacity-40 ${
        active ? "border-sam-surface/30 bg-sam-surface/15 text-white" : "border-sam-surface/10 bg-sam-surface/5 text-white/88"
      }`}
    >
      {icon}
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function resolveDirectCallPhase(
  status: CommunityMessengerCallSession["status"],
  joined: boolean,
  remoteJoined: boolean
): CallPhase {
  if (status === "rejected") return "declined";
  if (status === "missed") return "missed";
  if (status === "cancelled") return "ended";
  if (status === "ended") return "ended";
  if (status === "ringing") return "ringing";
  return joined && remoteJoined ? "connected" : "connecting";
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
        <p className="sam-text-body-lg font-semibold text-white">{headline}</p>
        <p className="mt-2 sam-text-body-secondary leading-snug text-white/75">{explain}</p>
        <p className="mt-2 sam-text-xxs leading-snug text-white/50">{t("nav_messenger_call_gate_trust_hint")}</p>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="mt-4 w-full rounded-full bg-sam-surface py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-40"
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
