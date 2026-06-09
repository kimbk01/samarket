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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CommunityMessengerAgoraLocalTracks } from "@/lib/community-messenger/call-provider/client";

/**
 * Agora 번들은 수 MB — 정적 import 시 통화 페이지 첫 페인트·파싱이 지연된다.
 * 링/연결 중 prefetch effect 와 조인 시 `fetchConnection` 과 병렬 로드로 체감 지연을 줄인다.
 */
async function loadCommunityMessengerCallProvider() {
  return import("@/lib/community-messenger/call-provider/client");
}
import { ensureVideoPermission } from "@/lib/call/permission-manager";
import { primeVideoCallMediaFromUserGesture, primeVoiceCallMediaFromUserGesture } from "@/lib/community-messenger/call-media-bootstrap";
import {
  attachPreJoinHtmlVideo,
  bindAgoraLocalVideoTrack,
  bindAgoraRemoteVideoTrack,
  clearLocalVideoContainer,
  detachAutoplayPrimingVideo,
  detachPreJoinHtmlVideo,
  primeVideoElementAutoplayFromUserGesture,
} from "@/lib/community-messenger/call-local-video-pipeline";
import {
  isCommunityMessengerCallMediaReadySync,
  markCommunityMessengerMediaTrustedOnce,
  openCommunityMessengerPermissionSettings,
  hasUsablePrimedCommunityMessengerDeviceStream,
  peekPrimedCommunityMessengerDeviceStream,
  primeCommunityMessengerDevicePermissionFromUserGesture,
  resumePrimedCommunityMessengerDeviceStreamIdleRelease,
  suspendPrimedCommunityMessengerDeviceStreamIdleRelease,
} from "@/lib/community-messenger/call-permission";
import {
  shouldMountLocalVideoPipShell,
  shouldRetainPrimedDeviceStreamForVideoPreview,
  shouldShowLocalVideoPipChrome,
  shouldUseSoloLocalFullVideoLayout,
} from "@/lib/community-messenger/call-video-layout";
import {
  getCommunityMessengerInsecureOriginMediaHint,
  getCommunityMessengerMediaErrorMessage,
  isAgoraJoinRetryableError,
  isCommunityMessengerMediaBlockedByInsecureOrigin,
  isCommunityMessengerNonRetryableCallErrorMessage,
} from "@/lib/community-messenger/media-errors";
import { useMessengerCallMainBottomNavSuppress } from "@/lib/layout/messenger-call-main-bottom-nav-suppress";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSession,
  CommunityMessengerManagedCallConnection,
} from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import {
  consumeOutgoingRingtonePrimedSessionFlag,
  playCommunityMessengerCallSignalSound,
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallFeedback,
  stopCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
} from "@/lib/community-messenger/call-feedback-sound";
import {
  cmCallAudioCleanup,
  cmCallFlow,
  cmCallLatencyInfo,
  setCmCallLatencyContext,
} from "@/lib/community-messenger/cm-call-debug";
import { runCommunityMessengerCallMediaCleanup } from "@/lib/community-messenger/community-messenger-call-media-cleanup";
import { takeDetachedCommunityCallCleanup, resumeDetachedCommunityCall, minimizeCommunityCallToPip, shouldSkipCallClientUnmountDispose, clearMinimizedCommunityCallSessionFlags, writeActiveDirectVideoCallSession, clearAllCommunityCallLocalSessionFlags } from "@/lib/community-messenger/direct-call-minimize";
import { notifyCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { isCommunityMessengerAgoraAppConfigured } from "@/lib/community-messenger/call-provider/client-runtime";
import {
  formatMessengerAgoraLastMileLine,
  messengerNetworkQualityWorst,
} from "@/lib/community-messenger/call-provider/agora-network-quality";
import { applyAgoraRemoteSpeakerPreference } from "@/lib/community-messenger/call-provider/agora-playback-routing";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallActionItem, CallPhase, CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  bootstrapCommunityMessengerOutgoingCallAndNavigate,
  bootstrapCommunityMessengerOutgoingCallSession,
  buildSyntheticTempOutgoingCallSession,
  consumeCommunityMessengerCallNavigationSeed,
  ensureCallNavigationSeedMemoryMatchesRoute,
  hydrateCommunityMessengerCallClientSession,
  isCommunityMessengerTempCallSessionId,
  navigateBackFromCommunityMessengerCall,
  primeCommunityMessengerCallNavigationSeed,
} from "@/lib/community-messenger/call-session-navigation-seed";
import {
  notifyCommunityMessengerCallInviteHangupBestEffort,
  notifyCommunityMessengerCallInviteRingBestEffort,
  subscribeCommunityMessengerCallInviteBroadcast,
} from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { appendLocalCallChatMessageFromTerminalSession } from "@/lib/community-messenger/call-chat-local-append";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  logCommunityMessengerCallSessionPatchDev,
  patchCommunityMessengerCallSession,
  postCommunityMessengerCallHangupSignal,
} from "@/lib/call/call-actions";
import {
  classifyMessengerCallJoinFailure,
  isMessengerCallClientFailureReason,
  messengerCallFailureEndedDetail,
  messengerCallTerminalFailureHeadline,
} from "@/lib/community-messenger/messenger-call-join-failure-reason";
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
import { fetchMessengerCallSoundConfig, getMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";
import { incomingRingTimeoutMsFromConfig } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { patchCommunityMessengerCallMissedOnce } from "@/lib/community-messenger/messenger-call-missed-patch";
import { registerCommunityMessengerCallRuntime, resetCommunityMessengerCallRuntimeSurface, syncCommunityMessengerCallRuntimeSurface } from "@/lib/community-messenger/call-runtime-registry";
import { peekMessengerBootstrapCritical, peekMessengerBootstrapFull } from "@/lib/community-messenger/bootstrap-cache";
import { useCallVideoPipGesture } from "@/lib/community-messenger/use-call-video-pip-gesture";
import {
  AGORA_PEER_LEFT_EARLY_CALL_GUARD_MS,
  AGORA_PEER_LEFT_END_GRACE_MS,
  AGORA_RECONNECT_ATTEMPT_MS,
  AGORA_RECONNECT_MAX_MS,
} from "@/lib/community-messenger/call-agora-reconnect-policy";
import { claimCallTerminalPatch } from "@/lib/community-messenger/call-terminal-patch-dedupe";
import {
  CM_VIDEO_UPGRADE_REQUEST,
  CM_VIDEO_UPGRADE_RESPONSE,
  publishVideoUpgradeRequest,
  publishVideoUpgradeResponse,
  subscribeVideoUpgradeBroadcast,
} from "@/lib/community-messenger/call-video-upgrade-broadcast";
import { bestEffortKeepaliveCallSessionTeardown } from "@/lib/community-messenger/call-page-leave-patch";
import { resolvePreJoinVideoPreviewStream } from "@/lib/community-messenger/call-prejoin-video-preview";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { VideoOff } from "lucide-react";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";

const CALL_CLIENT_TIER = getPublicDeployTier();

type SessionResponse = { ok?: boolean; session?: CommunityMessengerCallSession; error?: string };
type TokenResponse = { ok?: boolean; connection?: CommunityMessengerManagedCallConnection; error?: string };

function isTerminalCallSessionStatus(status: CommunityMessengerCallSession["status"]): boolean {
  return status === "ended" || status === "cancelled" || status === "rejected" || status === "missed";
}

/**
 * 음성 통화 스피커 버튼 기본값 — 모바일은 이어피스(off), 데스크톱(PC·브라우저)은 스피커(on).
 * 음성에서 `speakerEnabled === false` 일 때 버튼 `active` 스타일이 꺼져 보여 ‘비활성’처럼 보이던 문제를 완화한다.
 * (실제 출력 라우팅은 조인 후 `applyAgoraRemoteSpeakerPreference` — 오디오 엔진·AudioContext 는 변경하지 않음.)
 */
function defaultSpeakerEnabledForCallKind(kind: CommunityMessengerCallKind): boolean {
  if (kind === "video") return true;
  if (typeof window === "undefined") return false;
  try {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const hover = window.matchMedia("(hover: hover)").matches;
    if (fine && hover) return true;
  } catch {
    /* ignore */
  }
  return false;
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
    a.recipientUserId === b.recipientUserId &&
    a.endedReason === b.endedReason
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
  /** 상대 수락 직후 발신 탭이 오래된 ringing GET 을 들고 있어도 active 로 즉시 덮음 */
  if (prev && prev.id === next.id && prev.status === "ringing" && next.status === "active") {
    return next;
  }
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
  let endedReason = prev.endedReason ?? null;
  if ("ended_reason" in row && row !== null) {
    const er = (row as Record<string, unknown>).ended_reason;
    if (typeof er === "string") endedReason = er.trim() || null;
    else if (er === null) endedReason = null;
  } else if (nextStatus === "rejected" || nextStatus === "cancelled") {
    /**
     * Realtime 페이로드에 `ended_reason` 이 없을 때 이전 `failed_*`(조인 실패 PATCH)가 남으면
     * 거절·취소에도 ‘네트워크 오류’ 카드가 붙는다 — 터미널이 아닌 UI용으로 비운다.
     */
    endedReason = null;
  }
  if (nextStatus === "rejected" && endedReason && isMessengerCallClientFailureReason(endedReason)) {
    endedReason = null;
  }
  if (nextStatus === "ended" && !("ended_reason" in row && row !== null) && endedReason && isMessengerCallClientFailureReason(endedReason)) {
    endedReason = null;
  }
  const merged: CommunityMessengerCallSession = {
    ...prev,
    callKind: nextCallKind,
    status: nextStatus ?? prev.status,
    answeredAt,
    endedAt,
    endedReason,
  };
  /** 수락 Realtime 이 얇게 와도 ringing→active 는 무조건 반영 (발신 조인·UI 지연 방지) */
  if (merged.status === "active" && prev.status !== "active") {
    return merged;
  }
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

/** 시그널 payload.reason 이 표준 값이 아닐 때에도 터미널 전환 (브로드캐스트 hangup 과 동일 규칙). */
/**
 * 발신 active 자동 조인 — Permissions trusted 마크만으로는 iOS/Android Chrome 에서
 * 제스처 없이 GUM 재획득이 실패할 수 있다. 영상은 live primed 스트림이 있을 때만 자동 조인.
 */
function initiatorCanAutoJoinWithMedia(kind: CommunityMessengerCallKind): boolean {
  if (hasUsablePrimedCommunityMessengerDeviceStream(kind)) return true;
  if (kind === "voice") {
    return isCommunityMessengerCallMediaReadySync("voice");
  }
  return false;
}

function resolveHangupTerminalStatusForSnapshot(
  active: CommunityMessengerCallSession,
  reason: unknown
): CommunityMessengerCallSession["status"] {
  const mapped = mapHangupReasonToTerminalStatus(reason);
  if (mapped) return mapped;
  if (active.status === "ringing") {
    return active.isMineInitiator ? "rejected" : "cancelled";
  }
  return "ended";
}

export function CommunityMessengerCallClient({
  sessionId,
  initialSession = null,
  presentation = "fullscreen",
}: {
  sessionId: string;
  /** RSC에서 미리 조회해 첫 페인트·클라이언트 중복 요청을 줄인다 */
  initialSession?: CommunityMessengerCallSession | null;
  presentation?: "fullscreen" | "minimized";
}) {
  const { t } = useI18n();
  useMessengerCallMainBottomNavSuppress(presentation !== "minimized");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAction = searchParams.get("action");
  const [initialCallHydration] = useState(() => {
    if (initialSession != null) {
      return { session: initialSession, loading: false };
    }
    if (typeof window !== "undefined" && isCommunityMessengerTempCallSessionId(sessionId)) {
      const kind = searchParams.get("kind") === "video" ? "video" : "voice";
      const roomId = searchParams.get("roomId")?.trim() ?? "";
      const peerUserId = searchParams.get("peerUserId")?.trim() || null;
      const peerLabel = searchParams.get("peerLabel")?.trim() ?? "";
      return {
        session: buildSyntheticTempOutgoingCallSession({
          tempSessionId: sessionId,
          kind,
          roomId,
          peerUserId,
          peerLabel,
          initiatorUserId: "",
        }),
        loading: false,
      };
    }
    return hydrateCommunityMessengerCallClientSession(sessionId, initialSession);
  });
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
  const [localVideoPlayBlocked, setLocalVideoPlayBlocked] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [layoutSwapped, setLayoutSwapped] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  /** 조인 직후(트랙 생성 시점)에도 최신 음소거 의도를 반영 */
  const micMutedRef = useRef(false);
  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);
  /** 음성: 모바일 이어피스(off)·데스크톱 스피커(on). 영상: 스피커폰(on). */
  const [speakerEnabled, setSpeakerEnabled] = useState(() =>
    typeof window !== "undefined" ? defaultSpeakerEnabledForCallKind("voice") : false
  );
  const speakerEnabledRef = useRef(false);
  speakerEnabledRef.current = speakerEnabled;
  const callKindBootRef = useRef<{ sid: string | null; kind: CommunityMessengerCallKind | null }>({
    sid: null,
    kind: null,
  });
  const [bluetoothPreferred, setBluetoothPreferred] = useState(false);
  const [cameraSwitchSupported, setCameraSwitchSupported] = useState(false);
  /** Agora last-mile `network-quality` 기반(고정 문구 대신 실측) */
  const [lastMileLine, setLastMileLine] = useState(() => t("cm_ui_network_quality_checking"));
  const [lastMileWorst, setLastMileWorst] = useState(0);
  const [agoraReconnecting, setAgoraReconnecting] = useState(false);
  const agoraReconnectingRef = useRef(false);
  agoraReconnectingRef.current = agoraReconnecting;
  const [pendingVideoUpgradeRequest, setPendingVideoUpgradeRequest] = useState(false);
  const [incomingVideoUpgradeRequest, setIncomingVideoUpgradeRequest] = useState(false);
  const networkReconnectTimerRef = useRef<number | null>(null);
  const networkReconnectFailTimerRef = useRef<number | null>(null);
  const elapsedSecondsRef = useRef(0);
  const endCallRef = useRef<() => Promise<void>>(async () => {});
  const peerLeftEndTimerRef = useRef<number | null>(null);
  const agoraNetworkHooksRef = useRef({
    clearTimers: () => {},
    scheduleRecovery: () => {},
    scheduleFailTimer: () => {},
  });
  const lastMileToneClass = useMemo(() => {
    if (lastMileWorst >= 6) return "text-amber-400/95";
    if (lastMileWorst >= 4) return "text-yellow-200/90";
    return "text-emerald-400/95";
  }, [lastMileWorst]);
  const largeVideoRef = useRef<HTMLDivElement | null>(null);
  const smallVideoRef = useRef<HTMLDivElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  /** 발신 링 단계: 프라임된 getUserMedia 스트림 HTML 미리보기(조인 시 Agora 소비 전 해제) */
  const ringPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  /**
   * Agora `consumePrimed` 이후에도 HTML 미리보기를 유지 — `status: active`·조인 중
   * `peek` 가 null 이 되어도 동일 MediaStream 트랙은 살아 있음.
   */
  const heldPreJoinVideoPreviewRef = useRef<MediaStream | null>(null);
  const cmCallVideoLogOnceRef = useRef({
    localReady: false,
    remoteReady: false,
    pipRendered: false,
  });
  /** 상대 영상 최초 수신 시에만 기본 레이아웃(상대 풀·나 PiP) 적용 — 사용자 스왑 유지 */
  const hadRemoteVideoForLayoutRef = useRef(false);
  const layoutSwappedRef = useRef(false);
  const useRearFacingRef = useRef(false);
  layoutSwappedRef.current = layoutSwapped;
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<CommunityMessengerAgoraLocalTracks | null>(null);
  const mediaOwnerSessionIdRef = useRef<string | null>(null);
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
  /**
   * PATCH 직후 GET/Realtime 이 아직 ringing/active 를 돌려줄 때 로컬 종료 상태가 덮이는 레이스 방지
   * (발신 취소·수신 종료 후 화면·링백이 다시 살아나던 현상). TTL 은 수신 전역 hard-clear 와 동일하게 길게 둔다.
   */
  const callTerminalLocalPinRef = useRef<{
    sessionId: string;
    until: number;
    snapshot: CommunityMessengerCallSession;
  } | null>(null);
  /** 벨 거절·취소·원격 hangup 직후 `EndedCallView` 대신 ringing UI 유지 후 즉시 복귀 */
  const callDismissInFlightRef = useRef(false);
  const appendTerminalCallHistory = useCallback(
    (
      source: CommunityMessengerCallSession,
      status: CommunityMessengerCallSession["status"],
      opts?: { hangupReason?: string | null; endedReason?: string | null }
    ) => {
      if (source.sessionMode !== "direct") return;
      if (!isTerminalCallSessionStatus(status)) return;
      appendLocalCallChatMessageFromTerminalSession({
        roomId: source.roomId,
        sessionId: source.id,
        tmpSessionId: isCommunityMessengerTempCallSessionId(source.id) ? source.id : undefined,
        initiatorUserId: source.initiatorUserId,
        recipientUserId: source.recipientUserId ?? undefined,
        callKind: source.callKind,
        status,
        answeredAt: source.answeredAt ?? null,
        hangupReason: opts?.hangupReason ?? null,
        endedReason: opts?.endedReason ?? source.endedReason ?? null,
      });
    },
    []
  );

  const beginRingingCallDismiss = useCallback(
    (roomId: string | null | undefined) => {
      if (callDismissInFlightRef.current) return;
      const active = sessionRef.current;
      if (!active || active.status !== "ringing") return;
      callDismissInFlightRef.current = true;
      navigateBackFromCommunityMessengerCall(router, roomId ?? active.roomId);
    },
    [router]
  );

  useEffect(() => {
    callDismissInFlightRef.current = false;
    return () => {
      callDismissInFlightRef.current = false;
    };
  }, [sessionId]);

  useEffect(() => {
    const off = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      const cur = sessionRef.current;
      if (!cur) return;
      const sidOk = Boolean(ev.sessionId && ev.sessionId === cur.id);
      const evRid = ev.roomId?.trim();
      const evIni = ev.initiatorUserId?.trim();
      const triple =
        Boolean(evRid && evIni) &&
        (ev.callKind === "voice" || ev.callKind === "video") &&
        messengerUserIdsEqual(cur.roomId, evRid) &&
        messengerUserIdsEqual(cur.initiatorUserId, evIni) &&
        cur.callKind === ev.callKind;
      if (!sidOk && !triple) return;
      const wasRinging = cur.status === "ringing";
      const terminalStatus = readRealtimeSessionStatus(ev.status);
      if (terminalStatus && isTerminalCallSessionStatus(terminalStatus)) {
        appendTerminalCallHistory(cur, terminalStatus);
        const snapshot: CommunityMessengerCallSession = {
          ...cur,
          status: terminalStatus,
          endedAt: new Date().toISOString(),
        };
        callTerminalLocalPinRef.current = {
          sessionId: cur.id,
          until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS,
          snapshot,
        };
        setSession(snapshot);
        joiningRef.current = false;
        setJoined(false);
        joinedRef.current = false;
        setRemoteJoined(false);
        stopCommunityMessengerCallTone();
        stopCommunityMessengerCallFeedback();
      }
      if (wasRinging) {
        beginRingingCallDismiss(cur.roomId);
      }
    });
    return off;
  }, [appendTerminalCallHistory, beginRingingCallDismiss]);

  const latencyFirstScreenLoggedRef = useRef(false);
  const remoteAudioFirstFrameLoggedRef = useRef(false);
  const remoteUserJoinedLoggedRef = useRef(false);
  const terminalImmediateCleanupOnceRef = useRef<string | null>(null);
  /** 터미널·active 전환 시 잔여 오류/톤 정리 — 터미널 카피가 active 오류에 덮이지 않게 한다 */
  useEffect(() => {
    if (!session) return;
    const st = session.status;
    if (st === "active") {
      setErrorMessage(null);
      stopCommunityMessengerCallTone();
      return;
    }
    if (st === "rejected" || st === "cancelled" || st === "missed") {
      setErrorMessage(null);
      stopCommunityMessengerCallTone();
      return;
    }
    if (st === "ended") {
      stopCommunityMessengerCallTone();
      const er = session.endedReason;
      if (!er || !isMessengerCallClientFailureReason(er)) {
        setErrorMessage(null);
      }
    }
  }, [session?.endedReason, session?.id, session?.status]);

  useEffect(() => {
    latencyFirstScreenLoggedRef.current = false;
    remoteAudioFirstFrameLoggedRef.current = false;
    remoteUserJoinedLoggedRef.current = false;
    terminalImmediateCleanupOnceRef.current = null;
  }, [sessionId]);

  /** 임시 발신 세션 — initiator UUID 를 동기 세션에서 채워 PATCH·폴링 단계 안전 */
  useLayoutEffect(() => {
    if (!isCommunityMessengerTempCallSessionId(sessionId)) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    void sb.auth.getUser().then(({ data: { user } }) => {
      if (!user?.id) return;
      setSession((prev) => {
        if (!prev || prev.id !== sessionId) return prev;
        if (prev.initiatorUserId === user.id) return prev;
        return { ...prev, initiatorUserId: user.id };
      });
    });
  }, [sessionId]);

  /** 임시 세션 → 백그라운드 POST 후 실제 sessionId 로 replace */
  useEffect(() => {
    if (!isCommunityMessengerTempCallSessionId(sessionId)) return;
    const kind = (searchParams.get("kind") === "video" ? "video" : "voice") as CommunityMessengerCallKind;
    const roomId = searchParams.get("roomId")?.trim() || null;
    const peerUserId = searchParams.get("peerUserId")?.trim() || null;
    if (!roomId && !peerUserId) return;
    let alive = true;
    void (async () => {
      const result = await bootstrapCommunityMessengerOutgoingCallSession({ roomId, peerUserId, kind });
      if (!alive) return;
      if (!result.ok) {
        setErrorMessage(result.userMessage);
        return;
      }
      primeCommunityMessengerCallNavigationSeed(result.session.id, result.session);
      cmCallLatencyInfo("route_replace_session_start", {
        sessionId: result.session.id,
        callKind: kind,
        role: "initiator",
        roomId: result.roomId,
      });
      router.replace(`/community-messenger/calls/${encodeURIComponent(result.session.id)}`);
      if (result.session.sessionMode === "direct") {
        void notifyCommunityMessengerCallInviteRingBestEffort(result.session, {
          dialTmpSessionId: isCommunityMessengerTempCallSessionId(sessionId) ? sessionId : null,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, searchParams, sessionId]);

  useEffect(() => {
    cmCallLatencyInfo("call_client_mount", { sessionId });
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    setCmCallLatencyContext({
      sessionId: session.id,
      roomId: session.roomId,
      role: session.isMineInitiator ? "initiator" : "recipient",
      callKind: session.callKind,
    });
  }, [session?.id, session?.roomId, session?.callKind, session?.isMineInitiator]);

  useEffect(() => {
    if (!session || loading || latencyFirstScreenLoggedRef.current) return;
    latencyFirstScreenLoggedRef.current = true;
    cmCallLatencyInfo("first_call_screen_painted", {
      sessionId: session.id,
      status: session.status,
      initiator: session.isMineInitiator,
      callKind: session.callKind,
      role: session.isMineInitiator ? "initiator" : "recipient",
    });
  }, [loading, session]);

  useEffect(() => {
    if (!session?.isMineInitiator || session.status !== "ringing") return;
    cmCallLatencyInfo("outgoing_ringing_ui_observed", { sessionId: session.id, callKind: session.callKind });
  }, [session?.id, session?.isMineInitiator, session?.status]);

  useEffect(() => {
    if (session?.status !== "active") return;
    cmCallLatencyInfo("active_session_observed", {
      sessionId: session?.id ?? sessionId,
      callKind: session?.callKind,
      role: session?.isMineInitiator ? "initiator" : "recipient",
    });
  }, [session?.callKind, session?.id, session?.isMineInitiator, session?.status, sessionId]);

  const flowRemoteAcceptedLoggedRef = useRef<Set<string>>(new Set());
  /** 발신 탭: 상대 수락으로 세션이 active 로 전환된 시점(시그널 경로 추적용, 세션당 1회) */
  useEffect(() => {
    if (!session) return;
    if (!session.isMineInitiator || session.status !== "active") return;
    if (isCommunityMessengerTempCallSessionId(session.id)) return;
    if (flowRemoteAcceptedLoggedRef.current.has(session.id)) return;
    flowRemoteAcceptedLoggedRef.current.add(session.id);
    cmCallFlow("remote_accepted_detected", { sessionId: session.id });
    console.info("[cm-call-state] call_accepted", {
      sessionId: session.id.slice(-8),
      role: "caller",
      callKind: session.callKind,
    });
  }, [session?.id, session?.isMineInitiator, session?.status]);

  /** Realtime/GET 으로 터미널 전환 시 진행 중 조인 취소 */
  useEffect(() => {
    if (!session || !isTerminalCallSessionStatus(session.status)) return;
    joiningRef.current = false;
  }, [session?.id, session?.status]);
  const remoteJoinedRef = useRef(false);
  remoteJoinedRef.current = remoteJoined;
  const localVideoReadyRef = useRef(false);
  localVideoReadyRef.current = localVideoReady;
  const remoteVideoReadyRef = useRef(false);
  remoteVideoReadyRef.current = remoteVideoReady;
  /** effect 가 백업 폴링 간격을 Realtime 구독 상태에 맞출 수 있게 state 로도 반영 */
  const [sessionRealtimeSubscribed, setSessionRealtimeSubscribed] = useState(false);
  /** Realtime + polling + user-action refresh가 동시에 붙을 때 GET 폭주 방지 */
  const refreshScheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSilentRefreshAtRef = useRef<number>(0);
  const sessionSilentRefreshBackoffUntilRef = useRef<number>(0);
  const autoJoinBlockedRef = useRef(false);
  /** 수락·거절·종료 PATCH 중복 클릭 방지 */
  const directCallPatchInFlightRef = useRef(false);
  /** silent 세션 GET 이 동시에 여러 번 호출될 때(폴링+Realtime) 한 번의 네트워크로 합친다 */
  const refreshSilentInFlightRef = useRef<Promise<CommunityMessengerCallSession | null> | null>(null);
  /** 터미널 silent GET 은 일반 silent in-flight 과 합류하지 않음 — 터미널끼리만 동일 비행 합류로 폭주 완화 */
  const refreshTerminalSilentInFlightRef = useRef<Promise<CommunityMessengerCallSession | null> | null>(null);
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
  /**
   * 수락 PATCH 응답 전 `finally` 에서 `setBusy(null)` 되는 한 틱에 phase 가 다시 `ringing` 으로 떨어져
   * IncomingCallView ↔ 연결 풀스크린이 교차하는 것을 막는다(ref 만 쓰면 리렌더가 없어 동일 버그 유지).
   */
  const [calleeVideoConnectingShell, setCalleeVideoConnectingShell] = useState(false);
  /** 발신: `ringing` → 그 외 로 바뀔 때(상대 거절·취소 등) 벨·연결음이 잠시 남지 않게 */
  const wasCallSessionRingingRef = useRef(false);

  useLayoutEffect(() => {
    stopCommunityMessengerCallTone();
    setCalleeVideoConnectingShell(false);
    wasCallSessionRingingRef.current = false;
    heldPreJoinVideoPreviewRef.current = null;
    setJoined(false);
    joinedRef.current = false;
    joiningRef.current = false;
    setRemoteJoined(false);
    setLocalVideoReady(false);
    setLocalVideoPlayBlocked(false);
    setRemoteVideoReady(false);
    setCamOff(false);
    setLayoutSwapped(false);
    cmCallVideoLogOnceRef.current = { localReady: false, remoteReady: false, pipRendered: false };
    if (ringPreviewVideoRef.current) {
      ringPreviewVideoRef.current.srcObject = null;
    }
    if (largeVideoRef.current) largeVideoRef.current.innerHTML = "";
    if (smallVideoRef.current) smallVideoRef.current.innerHTML = "";
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
      stopCommunityMessengerCallTone();
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
    refreshSilentInFlightRef.current = null;
    refreshTerminalSilentInFlightRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    callKindBootRef.current = { sid: null, kind: null };
  }, [sessionId]);

  useEffect(() => {
    if (!session?.id) return;
    const b = callKindBootRef.current;
    if (b.sid !== session.id) {
      callKindBootRef.current = { sid: session.id, kind: session.callKind };
      const nextSpeakerEnabled = defaultSpeakerEnabledForCallKind(session.callKind);
      setSpeakerEnabled((prev) => (prev === nextSpeakerEnabled ? prev : nextSpeakerEnabled));
      return;
    }
    if (b.kind !== session.callKind) {
      callKindBootRef.current = { sid: session.id, kind: session.callKind };
      const nextSpeakerEnabled = defaultSpeakerEnabledForCallKind(session.callKind);
      setSpeakerEnabled((prev) => (prev === nextSpeakerEnabled ? prev : nextSpeakerEnabled));
    }
  }, [session?.id, session?.callKind]);

  useEffect(() => {
    if (!session) return;
    if (!isTerminalCallSessionStatus(session.status)) return;
    setSpeakerEnabled(false);
  }, [session?.id, session?.status]);

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
    stopCommunityMessengerCallTone();
    if (st === "missed") {
      void playCommunityMessengerCallSignalSound("missed", { dedupeSessionId: sid });
      showMessengerSnackbar(t("cm_ui_missed_call_notification"), { variant: "error" });
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
    if (consumeOutgoingRingtonePrimedSessionFlag(session.id)) {
      return () => {
        stopCommunityMessengerCallTone();
      };
    }
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
    async (
      silent = false,
      opts?: { terminal?: boolean }
    ): Promise<CommunityMessengerCallSession | null> => {
      const isTerminalSilent = Boolean(silent && opts?.terminal);
      if (silent && !isTerminalSilent && refreshSilentInFlightRef.current) {
        return refreshSilentInFlightRef.current;
      }
      if (silent && isTerminalSilent && refreshTerminalSilentInFlightRef.current) {
        return refreshTerminalSilentInFlightRef.current;
      }
      const run = async (): Promise<CommunityMessengerCallSession | null> => {
        if (isCommunityMessengerTempCallSessionId(sessionId)) {
          return sessionRef.current;
        }
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
            setErrorMessage(t("cm_ui_call_disconnected"));
          }
          return nextSession;
        } finally {
          if (!silent) setLoading(false);
        }
      };
      if (silent) {
        const p = run();
        if (isTerminalSilent) {
          refreshTerminalSilentInFlightRef.current = p;
          void p.finally(() => {
            if (refreshTerminalSilentInFlightRef.current === p) refreshTerminalSilentInFlightRef.current = null;
          });
        } else {
          refreshSilentInFlightRef.current = p;
          void p.finally(() => {
            if (refreshSilentInFlightRef.current === p) refreshSilentInFlightRef.current = null;
          });
        }
        return p;
      }
      return run();
    },
    [sessionId]
  );

  useEffect(() => {
    void fetchMessengerCallSoundConfig();
  }, []);

  const scheduleSilentRefresh = useCallback(
    (reason: "realtime" | "poll" | "ui" | "terminal") => {
      const now = Date.now();
      if (now < sessionSilentRefreshBackoffUntilRef.current) return;
      /** cancel/reject/end: 60/120ms·SILENT_GAP 없이 즉시 GET — 대기 중인 비터미널 스케줄은 취소 */
      if (reason === "terminal") {
        if (sessionRealtimeDebounceRef.current) {
          clearTimeout(sessionRealtimeDebounceRef.current);
          sessionRealtimeDebounceRef.current = null;
        }
        if (refreshScheduleTimerRef.current) {
          clearTimeout(refreshScheduleTimerRef.current);
          refreshScheduleTimerRef.current = null;
        }
        /** lastSilentRefreshAtRef 는 갱신하지 않음 — 터미널 직후 ringing/active 등 비터미널 Realtime 이 gap 에 막히지 않게 */
        void refreshSession(true, { terminal: true });
        return;
      }
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

  /** 1:1 전용 라우트: `incoming_ring_timeout_seconds` 경과 시 `missed` — 발신/수신 어느 쪽이 열려 있어도 서버가 허용(경합은 bad_action·refresh) */
  useEffect(() => {
    if (!session) return;
    if (isCommunityMessengerTempCallSessionId(session.id)) return;
    if (session.sessionMode !== "direct" || session.status !== "ringing") return;
    const sid = session.id;
    const startedAt = session.startedAt;
    let cancelled = false;

    /**
     * 타이머 등록을 네트워크 왕복(`await fetchMessengerCallSoundConfig`)에 묶지 않는다.
     * 캐시가 비면 기본 30s 와 동일한 클램프가 적용되고, 백그라운드로 설정만 채운다.
     */
    if (!getMessengerCallSoundConfigCache()) {
      void fetchMessengerCallSoundConfig();
    }
    const cur = sessionRef.current;
    if (!cur || cur.id !== sid || cur.status !== "ringing") return () => {};
    if (joinedRef.current) return () => {};
    const startMs = startedAt ? new Date(startedAt).getTime() : NaN;
    if (!Number.isFinite(startMs)) return () => {};
    const timeoutMs = incomingRingTimeoutMsFromConfig(getMessengerCallSoundConfigCache());
    const delay = Math.max(0, startMs + timeoutMs - Date.now());
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const c2 = sessionRef.current;
      if (!c2 || c2.id !== sid || c2.status !== "ringing") return;
      if (joinedRef.current) return;
      void patchCommunityMessengerCallMissedOnce(
        sid,
        (() => {
          const c = sessionRef.current;
          return c && c.id === sid
            ? { sessionStatus: c.status, isInitiator: c.isMineInitiator, endedReason: c.endedReason ?? null }
            : undefined;
        })()
      ).then((res) => {
        if (res.skipped) return;
        if (res.ok && res.session) {
          beginRingingCallDismiss(c2.roomId);
          setSession(res.session);
        } else if (!res.ok) {
          scheduleSilentRefresh("terminal");
        }
      });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    beginRingingCallDismiss,
    scheduleSilentRefresh,
    session?.id,
    session?.sessionMode,
    session?.startedAt,
    session?.status,
    session,
  ]);

  useEffect(() => {
    return () => {
      if (refreshScheduleTimerRef.current) {
        clearTimeout(refreshScheduleTimerRef.current);
        refreshScheduleTimerRef.current = null;
      }
    };
  }, []);

  const agoraMediaCleanupInFlightRef = useRef<Promise<void> | null>(null);

  const clearPeerLeftEndTimer = useCallback(() => {
    if (peerLeftEndTimerRef.current != null) {
      window.clearTimeout(peerLeftEndTimerRef.current);
      peerLeftEndTimerRef.current = null;
    }
  }, []);

  const cleanupClient = useCallback(async (domAudioNuclear = false, cleanupSessionId = sessionRef.current?.id ?? sessionId) => {
    if (agoraMediaCleanupInFlightRef.current) {
      await agoraMediaCleanupInFlightRef.current;
      return;
    }
    const run = async () => {
      clearPeerLeftEndTimer();
      if (networkQualityFlushTimerRef.current != null) {
        clearTimeout(networkQualityFlushTimerRef.current);
        networkQualityFlushTimerRef.current = null;
      }
      pendingNetworkQualityRef.current = null;

      const ownsCurrentMedia =
        mediaOwnerSessionIdRef.current == null || mediaOwnerSessionIdRef.current === cleanupSessionId;
      const client = ownsCurrentMedia ? clientRef.current : null;
      const tracks = ownsCurrentMedia ? localTracksRef.current : null;
      const remoteAudioTrack = ownsCurrentMedia ? remoteAudioTrackRef.current : null;
      const remoteVideoTrack = ownsCurrentMedia ? remoteVideoTrackRef.current : null;
      if (ownsCurrentMedia) {
        clientRef.current = null;
        localTracksRef.current = null;
        remoteAudioTrackRef.current = null;
        remoteVideoTrackRef.current = null;
        mediaOwnerSessionIdRef.current = null;
      }

      if (ownsCurrentMedia) {
        joinedRef.current = false;
        joiningRef.current = false;
        setJoined(false);
        setRemoteJoined(false);
        setLocalVideoReady(false);
        setLocalVideoPlayBlocked(false);
        setRemoteVideoReady(false);
        heldPreJoinVideoPreviewRef.current = null;
        if (ringPreviewVideoRef.current) {
          try {
            ringPreviewVideoRef.current.srcObject = null;
          } catch {
            /* noop */
          }
        }
        if (largeVideoRef.current) largeVideoRef.current.innerHTML = "";
        if (smallVideoRef.current) smallVideoRef.current.innerHTML = "";
        setLayoutSwapped(false);
        setCamOff(false);
        setMicMuted(false);
        micMutedRef.current = false;
        useRearFacingRef.current = false;
        setLastMileLine(t("cm_ui_network_quality_checking"));
        setLastMileWorst(0);
        cmCallVideoLogOnceRef.current = { localReady: false, remoteReady: false, pipRendered: false };
      }

      await runCommunityMessengerCallMediaCleanup({
        reason: "call_client_cleanup",
        sessionId: cleanupSessionId,
        client,
        tracks,
        remoteAudioTrack,
        remoteVideoTrack,
        afterAgora: () => {
          /** 종료·나가기 후 스피커 라우트 UI 가 ‘켜짐’으로 남는 것 방지 */
          if (ownsCurrentMedia) setSpeakerEnabled(false);
        },
        domAudioNuclear: domAudioNuclear && ownsCurrentMedia,
      });
    };

    const p = run();
    agoraMediaCleanupInFlightRef.current = p;
    try {
      await p;
    } finally {
      agoraMediaCleanupInFlightRef.current = null;
    }
  }, [clearPeerLeftEndTimer, sessionId]);

  const disposeCallMedia = useCallback(
    async (opts?: { domAudioNuclear?: boolean }) => {
      const domAudioNuclear = Boolean(opts?.domAudioNuclear);
      cmCallAudioCleanup("disposeCallMedia_start", { sessionId: sessionRef.current?.id ?? null });
      const sid = sessionRef.current?.id;
      if (sid) {
        const taken = takeDetachedCommunityCallCleanup(sid);
        if (taken) {
          await taken();
          return;
        }
      }
      await cleanupClient(domAudioNuclear, sid ?? sessionId);
      console.info("[cm-call-state] call_ended_cleanup_done", {
        sessionId: sessionRef.current?.id ?? sessionId,
        domAudioNuclear,
      });
    },
    [cleanupClient, sessionId]
  );

  useEffect(() => {
    return registerCommunityMessengerCallRuntime({
      sessionId,
      session: sessionRef.current,
      cleanupMedia: async () => {
        await disposeCallMedia({ domAudioNuclear: true });
      },
      patchTerminalBestEffort: async (_reason) => {
        const s = sessionRef.current;
        if (!s || isTerminalCallSessionStatus(s.status)) return;
        const action =
          s.status === "ringing"
            ? s.isMineInitiator
              ? "cancel"
              : "reject"
            : s.status === "active"
              ? "end"
              : null;
        if (!action || !claimCallTerminalPatch(s.id, action)) return;
        if (s.status === "ringing") {
          await patchCommunityMessengerCallSession(s.id, s.isMineInitiator ? "cancel" : "reject");
        } else if (s.status === "active") {
          await patchCommunityMessengerCallSession(s.id, "end", { durationSeconds: elapsedSecondsRef.current });
        }
      },
    });
  }, [disposeCallMedia, sessionId]);

  useEffect(() => {
    return () => {
      resetCommunityMessengerCallRuntimeSurface();
    };
  }, [sessionId]);

  useEffect(() => {
    if (session?.callKind !== "video") return;
    if (!joined) return;
    if (cmCallVideoLogOnceRef.current.pipRendered) return;
    cmCallVideoLogOnceRef.current.pipRendered = true;
    console.info("[cm-call-video] pip_rendered", {
      sessionId: session?.id?.slice(-8),
      layoutSwapped,
      remoteJoined,
      chromeVisible: localVideoReady,
    });
  }, [session?.callKind, session?.id, joined, localVideoReady, layoutSwapped, remoteJoined]);

  /** 링·active 동안 프라임 미리보기 스트림이 idle 90초 TTL 로 끊기지 않게 유지 */
  useEffect(() => {
    const s = session;
    if (!s || s.callKind !== "video") return;
    if (
      !shouldRetainPrimedDeviceStreamForVideoPreview({
        callKind: s.callKind,
        sessionStatus: s.status,
      })
    ) {
      resumePrimedCommunityMessengerDeviceStreamIdleRelease();
      return;
    }
    suspendPrimedCommunityMessengerDeviceStreamIdleRelease();
    return () => {
      resumePrimedCommunityMessengerDeviceStreamIdleRelease();
    };
  }, [session?.callKind, session?.id, session?.status]);

  useEffect(() => {
    if (!session || !isTerminalCallSessionStatus(session.status)) return;
    if (terminalImmediateCleanupOnceRef.current === session.id) return;
    terminalImmediateCleanupOnceRef.current = session.id;
    cmCallAudioCleanup("terminal_session_cleanup_immediate", { status: session.status, sessionId: session.id });
    joiningRef.current = false;
    const er = session.endedReason;
    if (!er || !isMessengerCallClientFailureReason(er)) {
      setErrorMessage(null);
    }
    void disposeCallMedia({ domAudioNuclear: true }).catch(() => {});
  }, [disposeCallMedia, session]);

  useEffect(() => {
    return () => {
      cmCallAudioCleanup("call_client_route_unmount", { sessionId });
      joiningRef.current = false;
      if (shouldSkipCallClientUnmountDispose(sessionId)) return;
      void disposeCallMedia({ domAudioNuclear: false }).catch(() => {});
    };
  }, [disposeCallMedia, sessionId]);

  useEffect(() => {
    const onPageLeave = () => {
      const s = sessionRef.current;
      if (s?.status === "ringing") {
        bestEffortKeepaliveCallSessionTeardown({
          session: s,
          durationSeconds: elapsedSecondsRef.current,
        });
      }
      stopCommunityMessengerCallTone();
      stopCommunityMessengerCallFeedback();
      /** active+joined 통화는 iOS 탭 전환·주소창에도 Agora 유지 — pagehide 즉시 dispose 금지 */
      if (s?.status === "active" && joinedRef.current) return;
      void disposeCallMedia({ domAudioNuclear: false }).catch(() => {});
    };
    window.addEventListener("pagehide", onPageLeave);
    window.addEventListener("beforeunload", onPageLeave);
    return () => {
      window.removeEventListener("pagehide", onPageLeave);
      window.removeEventListener("beforeunload", onPageLeave);
    };
  }, [disposeCallMedia]);

  const fetchConnection = useCallback(async (): Promise<CommunityMessengerManagedCallConnection> => {
    if (!isCommunityMessengerAgoraAppConfigured()) {
      throw new Error(t("cm_ui_call_provider_not_connected"));
    }
    const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/token`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !json.ok || !json.connection) {
      const error = json.error ?? "call_provider_not_configured";
      if (error === "call_provider_not_configured") {
        throw new Error(t("cm_ui_call_provider_not_connected"));
      }
      if (error === "session_not_joinable") {
        throw new Error(t("cm_ui_call_session_not_joinable"));
      }
      throw new Error(t("cm_ui_call_connection_load_failed"));
    }
    return json.connection;
  }, [sessionId, t]);

  useEffect(() => {
    prefetchedConnectionRef.current = null;
    if (!session) return;
    if (isCommunityMessengerTempCallSessionId(sessionId)) return;
    if (session.sessionMode !== "direct") return;
    if (isTerminalCallSessionStatus(session.status)) return;
    if (!isCommunityMessengerAgoraAppConfigured()) {
      return;
    }
    let cancelled = false;
    void loadCommunityMessengerCallProvider().catch(() => {});
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

  const bindLocalVideoTrack = useCallback(async (): Promise<boolean> => {
    const videoTrack = localTracksRef.current?.videoTrack ?? null;
    const swapped = layoutSwappedRef.current;
    const s = sessionRef.current;
    /** 링·조인 전·발신 상대 미수신 전 풀화면 로컬 */
    const soloLocalFull = shouldUseSoloLocalFullVideoLayout({
      callKind: s?.callKind ?? "voice",
      sessionStatus: s?.status ?? "ended",
      joined: joinedRef.current,
      remoteJoined: remoteJoinedRef.current,
      isInitiator: s?.isMineInitiator ?? false,
    });

    const sm = smallVideoRef.current;
    const lg = largeVideoRef.current;

    if (soloLocalFull) {
      clearLocalVideoContainer(sm);
      if (!videoTrack || !lg) {
        setLocalVideoReady(false);
        return false;
      }
      if (!videoTrack.enabled) {
        clearLocalVideoContainer(lg);
        setLocalVideoReady(true);
        setLocalVideoPlayBlocked(false);
        return true;
      }
      const ok = await bindAgoraLocalVideoTrack(videoTrack, lg, { fit: "cover", mirror: true });
      if (ok) {
        setLocalVideoReady(true);
        setLocalVideoPlayBlocked(false);
        if (!cmCallVideoLogOnceRef.current.localReady) {
          cmCallVideoLogOnceRef.current.localReady = true;
          console.info("[cm-call-video] local_track_ready", {
            sessionId: sessionRef.current?.id?.slice(-8),
            layout: "solo_full",
          });
        }
      } else {
        setLocalVideoReady(false);
        setLocalVideoPlayBlocked(true);
      }
      return ok;
    }

    const localEl = swapped ? lg : sm;
    const mainEl = swapped ? sm : lg;
    if (localEl) clearLocalVideoContainer(localEl);
    /** 솔로 풀(발신 링) → PiP 전환 시 메인 슬롯에 남은 로컬 Agora DOM 제거 */
    if (!swapped && mainEl && localEl !== mainEl && !remoteVideoTrackRef.current) {
      clearLocalVideoContainer(mainEl);
    }
    if (!videoTrack || !localEl) {
      setLocalVideoReady(false);
      return false;
    }
    if (!videoTrack.enabled) {
      clearLocalVideoContainer(localEl);
      setLocalVideoReady(true);
      setLocalVideoPlayBlocked(false);
      return true;
    }
    const ok = await bindAgoraLocalVideoTrack(videoTrack, localEl, { fit: "cover", mirror: true });
    if (ok) {
      setLocalVideoReady(true);
      setLocalVideoPlayBlocked(false);
      if (!cmCallVideoLogOnceRef.current.localReady) {
        cmCallVideoLogOnceRef.current.localReady = true;
        console.info("[cm-call-video] local_track_ready", {
          sessionId: sessionRef.current?.id?.slice(-8),
          layout: swapped ? "pip_swapped" : "pip_default",
        });
      }
    } else {
      setLocalVideoReady(false);
      setLocalVideoPlayBlocked(true);
    }
    return ok;
  }, []);

  const bindRemoteVideoTrack = useCallback(
    async (track: IRemoteVideoTrack | null) => {
      remoteVideoTrackRef.current?.stop();
      remoteVideoTrackRef.current = track;
      const swapped = layoutSwappedRef.current;
      const remoteEl = swapped ? smallVideoRef.current : largeVideoRef.current;
      if (remoteEl) remoteEl.innerHTML = "";
      if (track && remoteEl) {
        const ok = await bindAgoraRemoteVideoTrack(track, remoteEl, { fit: "cover", mirror: false });
        setRemoteVideoReady(ok);
        if (ok && !cmCallVideoLogOnceRef.current.remoteReady) {
          cmCallVideoLogOnceRef.current.remoteReady = true;
          console.info("[cm-call-video] remote_track_ready", { sessionId: sessionRef.current?.id?.slice(-8) });
        }
        /* 원격 수신 직후 로컬이 솔로 풀에 남는 것을 막음 — layout effect deps 에서 remoteVideoReady 를 뺌 */
        void bindLocalVideoTrack();
        return;
      }
      setRemoteVideoReady(false);
      void bindLocalVideoTrack();
    },
    [bindLocalVideoTrack]
  );

  /* 레이아웃 전환·join 직후: 양쪽 슬롯에 트랙을 다시 붙인다 */
  useLayoutEffect(() => {
    if (!session || session.status !== "active" || session.callKind !== "video" || !joined) return;
    const remote = remoteVideoTrackRef.current;
    const swapped = layoutSwapped;
    const soloLocalFull = shouldUseSoloLocalFullVideoLayout({
      callKind: session.callKind,
      sessionStatus: session.status,
      joined,
      remoteJoined,
      isInitiator: session.isMineInitiator,
    });

    if (soloLocalFull) {
      void bindLocalVideoTrack();
      setRemoteVideoReady(false);
      return;
    }

    const remoteEl = swapped ? smallVideoRef.current : largeVideoRef.current;
    if (remoteEl) remoteEl.innerHTML = "";
    if (remote && remoteEl) {
      void bindAgoraRemoteVideoTrack(remote, remoteEl, { fit: "cover", mirror: false }).then((ok) => {
        setRemoteVideoReady(ok);
      });
    } else {
      setRemoteVideoReady(false);
    }
    void bindLocalVideoTrack();
  }, [bindLocalVideoTrack, layoutSwapped, joined, remoteJoined, session?.callKind, session?.id, session?.isMineInitiator, session?.status]);

  /** Remote upgraded session to video — same call, publish local camera. */
  useEffect(() => {
    if (!session || session.callKind !== "video" || !joined || session.status !== "active") return;
    if (camOff) return;
    if (localTracksRef.current?.videoTrack) {
      void bindLocalVideoTrack();
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
        markCommunityMessengerMediaTrustedOnce("video");
        void bindLocalVideoTrack();
      } catch (e) {
        console.warn("[messenger-call] auto video publish", e);
        setErrorMessage(getCommunityMessengerMediaErrorMessage(e, "video"));
        autoVideoPublishAttemptedRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camOff, session?.id, session?.callKind, session?.status, joined, bindLocalVideoTrack]);

  /** 모바일: facingMode user/environment 우선 · 데스크톱/실패 시 videoinput 목록 순환 · 실패 시 catch 에서 이전 facing 복구 */
  const switchCameraFacing = useCallback(async () => {
    const v = localTracksRef.current?.videoTrack;
    if (!v || !isCameraVideoTrackWithDevice(v)) return;
    console.info("[cm-call-video] camera_switch_start", { sessionId: sessionRef.current?.id?.slice(-8) });
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
      void bindLocalVideoTrack();
      console.info("[cm-call-video] camera_switch_done", { sessionId: sessionRef.current?.id?.slice(-8) });
      setBusy(null);
    }
  }, [bindLocalVideoTrack]);

  const toggleCamEnabled = useCallback(async () => {
    const v = localTracksRef.current?.videoTrack;
    const client = clientRef.current;
    if (!v) return;
    const nextOff = !camOff;
    setCamOff(nextOff);
    try {
      if (nextOff) {
        if (client) {
          try {
            await client.unpublish([v]);
          } catch {
            /* already unpublished */
          }
        }
        await v.setEnabled(false);
      } else {
        await v.setEnabled(true);
        if (client) {
          try {
            await client.publish([v]);
          } catch {
            /* retry on next tap */
          }
        }
      }
      void bindLocalVideoTrack();
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
      showMessengerSnackbar(t("cm_ui_speaker_route_browser_limited"));
    }
  }, []);

  useEffect(() => {
    if (!joined) return;
    if (sessionRef.current?.status !== "active") return;
    void applyAgoraRemoteSpeakerPreference(remoteAudioTrackRef.current, speakerEnabled);
  }, [joined, speakerEnabled, session?.status]);

  const toggleBluetoothPreferred = useCallback(() => {
    setBluetoothPreferred((prev) => !prev);
    if (typeof window !== "undefined") {
      showMessengerSnackbar(t("cm_ui_bluetooth_route_hint"));
    }
  }, []);

  const joinCall = useCallback(
    async (targetSession: CommunityMessengerCallSession) => {
      if (joinedRef.current || joiningRef.current) return;
      if (isTerminalCallSessionStatus(targetSession.status)) return;
      /**
       * ringing·그 외 비-active 에서는 Agora·로컬 트랙·채널 조인 금지.
       * (링톤만 허용 — `call-feedback-sound` / 전역 벨)
       */
      if (targetSession.status !== "active") return;
      /** 통화 화면은 유지(ringing) — 즉시 PATCH 종료하면 발신 진입·종료 버튼이 깨진다. 안내만 하고 Agora 조인은 생략 */
      if (isCommunityMessengerMediaBlockedByInsecureOrigin()) {
        autoJoinBlockedRef.current = true;
        setErrorMessage(getCommunityMessengerInsecureOriginMediaHint());
        return;
      }
      joiningRef.current = true;
      setBusy("join");
      setErrorMessage(null);
      const joinT0 = perfNow();

      const runJoinAttempt = async (): Promise<void> => {
        /** 링 루프와 Agora 로컬/원격 오디오가 겹치지 않게 조인 직전에 동기 중단 */
        stopCommunityMessengerCallTone();
        detachAutoplayPrimingVideo();
        detachPreJoinHtmlVideo(ringPreviewVideoRef.current);
        cmCallLatencyInfo("force_ringing_ui", {
          sessionId: targetSession.id,
          callKind: targetSession.callKind,
          role: targetSession.isMineInitiator ? "initiator" : "recipient",
          callUiPhase: "outgoing_ringing",
        });
        cmCallLatencyInfo("agora_join_start", {
          sessionId: targetSession.id,
          callKind: targetSession.callKind,
          role: targetSession.isMineInitiator ? "initiator" : "recipient",
        });
        /** 수락 직후 조인 — 링 단계 prefetch 토큰 대신 항상 최신 connection */
        prefetchedConnectionRef.current = null;
        const connectionPromise = fetchConnection();
        const [provider, connection] = await Promise.all([
          loadCommunityMessengerCallProvider(),
          connectionPromise,
        ]);
        const {
          createCommunityMessengerAgoraClient,
          createCommunityMessengerAgoraLocalTracks,
          joinCommunityMessengerAgoraChannel,
          publishCommunityMessengerAgoraTracks,
        } = provider;
        const client = createCommunityMessengerAgoraClient();
        mediaOwnerSessionIdRef.current = targetSession.id;
        clientRef.current = client;
        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
          try {
            await client.subscribe(user, mediaType);
          } catch (subErr) {
            console.warn("[community-messenger-call] remote subscribe failed", subErr);
            return;
          }
          if (!remoteUserJoinedLoggedRef.current) {
            remoteUserJoinedLoggedRef.current = true;
            cmCallLatencyInfo("remote_user_joined", {
              sessionId: targetSession.id,
              callKind: targetSession.callKind,
              role: targetSession.isMineInitiator ? "initiator" : "recipient",
              mediaType,
            });
          }
          if (mediaType === "audio" && user.audioTrack) {
            remoteAudioTrackRef.current = user.audioTrack;
            try {
              user.audioTrack.play();
            } catch {
              /* 자동재생 정책 등 */
            }
            if (!remoteAudioFirstFrameLoggedRef.current) {
              remoteAudioFirstFrameLoggedRef.current = true;
              cmCallLatencyInfo("remote_audio_first_frame", {
                sessionId: targetSession.id,
                callKind: targetSession.callKind,
                role: targetSession.isMineInitiator ? "initiator" : "recipient",
              });
            }
            void applyAgoraRemoteSpeakerPreference(user.audioTrack, speakerEnabledRef.current);
            clearPeerLeftEndTimer();
            setRemoteJoined(true);
          }
          if (mediaType === "video" && user.videoTrack) {
            bindRemoteVideoTrack(user.videoTrack);
            clearPeerLeftEndTimer();
            setRemoteJoined(true);
          }
        });
        client.on("user-unpublished", (_user, mediaType) => {
          if (mediaType === "video") {
            bindRemoteVideoTrack(null);
          }
          /**
           * audio: 음소거·일시 unpublish 시에도 이벤트가 올 수 있어 ref 를 비우면 끊김으로 느껴짐.
           * 하드웨어/구독 해제는 `user-left`·정리(cleanup)에서만 처리한다.
           */
        });
        client.on("user-left", () => {
          bindRemoteVideoTrack(null);
          remoteAudioTrackRef.current = null;
          setRemoteJoined(false);
          const active = sessionRef.current;
          if (
            active?.status === "active" &&
            joinedRef.current &&
            !isTerminalCallSessionStatus(active.status)
          ) {
            clearPeerLeftEndTimer();
            if (agoraReconnectingRef.current) return;
            const answeredMs = active?.answeredAt ? new Date(active.answeredAt).getTime() : NaN;
            const earlyCallGuard =
              Number.isFinite(answeredMs) && Date.now() - answeredMs < AGORA_PEER_LEFT_EARLY_CALL_GUARD_MS;
            if (earlyCallGuard) {
              return;
            }
            peerLeftEndTimerRef.current = window.setTimeout(() => {
              peerLeftEndTimerRef.current = null;
              const cur = sessionRef.current;
              if (!cur || cur.status !== "active" || isTerminalCallSessionStatus(cur.status)) return;
              if (remoteJoinedRef.current) return;
              if (agoraReconnectingRef.current) return;
              const answeredAtMs = cur.answeredAt ? new Date(cur.answeredAt).getTime() : NaN;
              if (
                Number.isFinite(answeredAtMs) &&
                Date.now() - answeredAtMs < AGORA_PEER_LEFT_EARLY_CALL_GUARD_MS
              ) {
                return;
              }
              void endCallRef.current();
            }, AGORA_PEER_LEFT_END_GRACE_MS);
            return;
          }
          void refreshSession(true);
        });
        client.on("connection-state-change", (cur) => {
          const active = sessionRef.current;
          const inActiveMedia =
            active?.status === "active" && joinedRef.current && !isTerminalCallSessionStatus(active.status);
          if (!inActiveMedia) {
            if (cur === "DISCONNECTED") setRemoteJoined(false);
            if (cur === "DISCONNECTED" || cur === "DISCONNECTING") void refreshSession(true);
            return;
          }
          if (cur === "RECONNECTING") {
            setAgoraReconnecting(true);
            agoraNetworkHooksRef.current.clearTimers();
            agoraNetworkHooksRef.current.scheduleFailTimer();
            return;
          }
          if (cur === "CONNECTED") {
            setAgoraReconnecting(false);
            agoraNetworkHooksRef.current.clearTimers();
            return;
          }
          if (cur === "DISCONNECTED" || cur === "DISCONNECTING") {
            setAgoraReconnecting(true);
            agoraNetworkHooksRef.current.clearTimers();
            agoraNetworkHooksRef.current.scheduleRecovery();
            if (cur === "DISCONNECTED") void refreshSession(true);
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
            setLastMileWorst(messengerNetworkQualityWorst(p.u, p.d));
            setLastMileLine(formatMessengerAgoraLastMileLine(p.u, p.d));
          }, 480);
        });

        const clearPreJoinPreviewAfterLocalPlay = () => {
          heldPreJoinVideoPreviewRef.current = null;
          detachPreJoinHtmlVideo(ringPreviewVideoRef.current);
        };

        const isVideoCall = targetSession.callKind === "video";
        let localVideoBoundDuringJoin = false;
        if (isVideoCall) {
          heldPreJoinVideoPreviewRef.current = null;
          detachPreJoinHtmlVideo(ringPreviewVideoRef.current);
          const tracks = await createCommunityMessengerAgoraLocalTracks("video");
          localTracksRef.current = tracks;
          const lg = largeVideoRef.current;
          if (tracks.videoTrack && lg) {
            const localPlayOk = await bindAgoraLocalVideoTrack(tracks.videoTrack, lg, {
              fit: "cover",
              mirror: true,
            });
            if (localPlayOk) {
              localVideoBoundDuringJoin = true;
              setLocalVideoReady(true);
              setLocalVideoPlayBlocked(false);
              clearPreJoinPreviewAfterLocalPlay();
            } else {
              setLocalVideoReady(false);
              setLocalVideoPlayBlocked(true);
            }
          } else {
            setLocalVideoReady(false);
          }
        }

        await joinCommunityMessengerAgoraChannel({
          client,
          appId: connection.appId,
          channelName: connection.channelName,
          token: connection.token,
          uid: connection.uid,
        });
        if (isVideoCall) {
          try {
            const c = client as IAgoraRTCClient & { enableDualStream?: () => Promise<void> };
            await c.enableDualStream?.();
          } catch {
            /* 일부 환경 미지원 */
          }
        }
        if (!isVideoCall) {
          const tracks = await createCommunityMessengerAgoraLocalTracks("voice");
          localTracksRef.current = tracks;
        }
        await publishCommunityMessengerAgoraTracks({
          client,
          tracks: localTracksRef.current!,
        });
        const at = localTracksRef.current?.audioTrack;
        if (at) {
          try {
            await at.setEnabled(!micMutedRef.current);
          } catch {
            /* ignore */
          }
        }
        joinedRef.current = true;
        setJoined(true);
        if (isVideoCall && !localVideoBoundDuringJoin) {
          void bindLocalVideoTrack();
        }
        cmCallLatencyInfo("agora_join_done", {
          sessionId: targetSession.id,
          callKind: targetSession.callKind,
          role: targetSession.isMineInitiator ? "initiator" : "recipient",
        });
        markCommunityMessengerMediaTrustedOnce(targetSession.callKind);
        autoJoinBlockedRef.current = false;
      };

      const joinErrors: unknown[] = [];
      try {
        const maxJoinAttempts = 3;
        for (let attempt = 0; attempt < maxJoinAttempts; attempt += 1) {
          try {
            await runJoinAttempt();
            joinErrors.length = 0;
            break;
          } catch (attemptError) {
            joinErrors.push(attemptError);
            await cleanupClient();
            const retryable = isAgoraJoinRetryableError(attemptError);
            if (!retryable || attempt >= maxJoinAttempts - 1) {
              throw attemptError;
            }
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 280 * (attempt + 1));
            });
          }
        }
      } catch (error) {
        autoJoinBlockedRef.current = false;
        await cleanupClient();
        const cur = sessionRef.current;
        if (
          cur &&
          cur.id === targetSession.id &&
          isTerminalCallSessionStatus(cur.status)
        ) {
          setErrorMessage(null);
          scheduleSilentRefresh("terminal");
        } else {
          /**
           * 수락 직후 조인 실패 — 세션을 즉시 end 하지 않음(발신 측 자동 끊김 방지).
           * 사용자 제스처 재시도(`handleRetryMediaAndJoin`)로 미디어·Agora 재조인.
           */
          const reason = classifyMessengerCallJoinFailure(error, targetSession.callKind);
          const detail = messengerCallFailureEndedDetail(reason, targetSession.callKind);
          setErrorMessage(detail);
          if (targetSession.callKind === "video") {
            setLocalVideoPlayBlocked(true);
          }
          console.warn("[community-messenger-call] join_failed_stay_active", {
            sessionId: targetSession.id.slice(-8),
            reason,
            attempts: joinErrors.length,
          });
        }
      } finally {
        joiningRef.current = false;
        setBusy(null);
      }
    },
    [bindLocalVideoTrack, cleanupClient, clearPeerLeftEndTimer, fetchConnection, refreshSession, scheduleSilentRefresh]
  );

  const acceptIncoming = useCallback(async (): Promise<CommunityMessengerCallSession | null> => {
    const s = sessionRef.current;
    if (!s) return null;
    if (directCallPatchInFlightRef.current) return null;
    if (isTerminalCallSessionStatus(s.status)) return null;
    if (!s.isMineInitiator) {
      setCalleeVideoConnectingShell(true);
    }
    directCallPatchInFlightRef.current = true;
    const acceptT0 = perfNow();
    callFlowAcceptStartRef.current = acceptT0;
    setBusy("accept");
    setErrorMessage(null);
    unlockCommunityMessengerCallPlaybackFromUserGesture();
    if (s.callKind === "video") {
      const primedPeek = peekPrimedCommunityMessengerDeviceStream("video");
      if (primedPeek) primeVideoElementAutoplayFromUserGesture(primedPeek);
    }
    const mediaPrimePromise =
      s.callKind === "video"
        ? primeVideoCallMediaFromUserGesture({ explicitRetry: true })
        : primeVoiceCallMediaFromUserGesture();
    try {
      stopCommunityMessengerCallTone();
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(s.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const json = (await res.json().catch(() => ({}))) as SessionResponse & { error?: string };
      logCommunityMessengerCallSessionPatchDev({
        sessionId: s.id,
        action: "accept",
        responseStatus: res.status,
        responseBody: json,
        context: {
          sessionStatus: s.status,
          isInitiator: s.isMineInitiator,
          endedReason: s.endedReason ?? null,
        },
      });
      if (!res.ok || !json.ok || !json.session) {
        const code = json.error;
        const msg =
          code === "bad_action"
            ? t("cm_ui_call_accept_bad_action")
            : code === "forbidden"
              ? t("cm_ui_call_forbidden")
              : code === "session_required"
                ? t("cm_ui_call_session_not_found")
                : t("cm_ui_call_accept_failed");
        setErrorMessage(msg);
        callFlowAcceptStartRef.current = null;
        if (!s.isMineInitiator) {
          setCalleeVideoConnectingShell(false);
        }
        directCallPatchInFlightRef.current = false;
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
      console.info("[cm-call-state] call_accepted", {
        sessionId: s.id.slice(-8),
        role: "callee",
        callKind: s.callKind,
      });
      setSession(json.session);
      if (json.session.status === "active") {
        try {
          const primeResult = await mediaPrimePromise;
          if (primeResult.ok && json.session.callKind === "video") {
            const peek = peekPrimedCommunityMessengerDeviceStream("video");
            if (peek) primeVideoElementAutoplayFromUserGesture(peek);
          }
        } catch {
          /* 조인 시도에서 실제 미디어 오류 표시 */
        }
      }
      return json.session;
    } catch (e) {
      callFlowAcceptStartRef.current = null;
      if (!s.isMineInitiator) {
        setCalleeVideoConnectingShell(false);
      }
      directCallPatchInFlightRef.current = false;
      throw e;
    } finally {
      setBusy(null);
      directCallPatchInFlightRef.current = false;
    }
  }, []);

  const handleRetryMediaAndJoin = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    autoVideoPublishAttemptedRef.current = null;
    autoJoinBlockedRef.current = false;
    setLocalVideoPlayBlocked(false);
    setErrorMessage(null);
    void (async () => {
      try {
        if (s.isMineInitiator) {
          if (s.status === "active") {
            await primeCommunityMessengerDevicePermissionFromUserGesture(s.callKind);
            markCommunityMessengerMediaTrustedOnce(s.callKind);
            await joinCall(s);
          }
          return;
        }
        if (s.status === "ringing") {
          await acceptIncoming();
          return;
        }
        if (s.status === "active") {
          await primeCommunityMessengerDevicePermissionFromUserGesture(s.callKind);
          markCommunityMessengerMediaTrustedOnce(s.callKind);
        }
        await joinCall(s);
      } catch (err) {
        setErrorMessage(getCommunityMessengerMediaErrorMessage(err, s.callKind));
      }
    })();
  }, [acceptIncoming, joinCall]);

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
        appendTerminalCallHistory(snapshot, snapshot.status);
        setSession(snapshot);
      }
      joiningRef.current = false;
      setJoined(false);
      joinedRef.current = false;
      setRemoteJoined(false);
    },
    [appendTerminalCallHistory]
  );

  const rejectIncoming = useCallback(async () => {
    if (!session) return;
    if (isTerminalCallSessionStatus(session.status)) return;
    if (directCallPatchInFlightRef.current) return;
    directCallPatchInFlightRef.current = true;
    stopCommunityMessengerCallFeedback();
    stopCommunityMessengerCallTone();
    cmCallAudioCleanup("reject_click_feedback_stopped_before_patch", { sessionId: session.id });
    setBusy("reject");
    const sid = session.id;
    const roomIdR = session.roomId;
    beginRingingCallDismiss(roomIdR);
    const peer = session.peerUserId?.trim();
    const endedAtIso = new Date().toISOString();
    {
      const prev = sessionRef.current;
      if (prev?.id === sid) {
        const snap: CommunityMessengerCallSession = { ...prev, status: "rejected", endedAt: endedAtIso };
        callTerminalLocalPinRef.current = { sessionId: sid, until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS, snapshot: snap };
        appendTerminalCallHistory(prev, "rejected", { hangupReason: "reject" });
        setSession(snap);
      }
    }
    joiningRef.current = false;
    setJoined(false);
    joinedRef.current = false;
    setRemoteJoined(false);
    void disposeCallMedia({ domAudioNuclear: true }).catch(() => {});

    void (async () => {
      try {
        if (peer) {
          void notifyCommunityMessengerCallInviteHangupBestEffort(peer, sid, {
            roomId: roomIdR,
            initiatorUserId: session.initiatorUserId,
            callKind: session.callKind,
            terminalStatus: "rejected",
            tmpSessionId: isCommunityMessengerTempCallSessionId(sid) ? sid : undefined,
          });
          try {
            await postCommunityMessengerCallHangupSignal({ sessionId: sid, toUserId: peer, reason: "reject" });
          } catch {
            /* PATCH 로 세션 종료 — 시그널은 best-effort */
          }
        }
        const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject" }),
        });
        const json = (await res.json().catch(() => ({}))) as SessionResponse;
        logCommunityMessengerCallSessionPatchDev({
          sessionId: sid,
          action: "reject",
          responseStatus: res.status,
          responseBody: json,
          context: {
            sessionStatus: session.status,
            isInitiator: session.isMineInitiator,
            endedReason: session.endedReason ?? null,
          },
        });
        if (!res.ok || !json.ok) {
          setErrorMessage(
            json.error === "bad_action"
              ? t("cm_ui_call_reject_already_handled")
              : t("cm_ui_call_reject_failed")
          );
          await disposeCallMedia({ domAudioNuclear: true });
          scheduleSilentRefresh("terminal");
          return;
        }
        if (json.session && isTerminalCallSessionStatus(json.session.status)) {
          callTerminalLocalPinRef.current = {
            sessionId: sid,
            until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS,
            snapshot: json.session,
          };
          setSession(json.session);
        }
      } finally {
        setBusy(null);
        directCallPatchInFlightRef.current = false;
      }
    })();
  }, [appendTerminalCallHistory, beginRingingCallDismiss, disposeCallMedia, scheduleSilentRefresh, session, t]);

  const endCall = useCallback(async () => {
    if (!session) return;
    if (isTerminalCallSessionStatus(session.status)) return;
    if (directCallPatchInFlightRef.current) return;
    directCallPatchInFlightRef.current = true;
    stopCommunityMessengerCallFeedback();
    stopCommunityMessengerCallTone();
    cmCallAudioCleanup("end_click_feedback_stopped_before_patch", { sessionId: session.id });
    setBusy("end");
    const roomId = session.roomId;
    const sid = session.id;
    const peer = session.peerUserId?.trim();
    const patchAction: "cancel" | "reject" | "end" =
      session.status === "ringing"
        ? session.isMineInitiator
          ? "cancel"
          : "reject"
        : "end";
    const hangupReason =
      patchAction === "cancel" ? "cancel" : patchAction === "reject" ? "reject" : "end";
    const optimisticEnd: CommunityMessengerCallSession["status"] =
      patchAction === "cancel"
        ? "cancelled"
        : patchAction === "reject"
          ? "rejected"
          : "ended";
    const endedAtIso = new Date().toISOString();
    const ringingDismiss = session.status === "ringing";
    if (ringingDismiss) {
      beginRingingCallDismiss(roomId);
    }
    {
      const prev = sessionRef.current;
      if (prev?.id === sid) {
        const snap: CommunityMessengerCallSession = { ...prev, status: optimisticEnd, endedAt: endedAtIso };
        callTerminalLocalPinRef.current = {
          sessionId: sid,
          until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS,
          snapshot: snap,
        };
        appendTerminalCallHistory(prev, optimisticEnd, { hangupReason });
        setSession(snap);
      }
    }
    joiningRef.current = false;
    setJoined(false);
    joinedRef.current = false;
    setRemoteJoined(false);
    void disposeCallMedia({ domAudioNuclear: true }).catch(() => {});

    void (async () => {
      try {
        if (peer) {
          void notifyCommunityMessengerCallInviteHangupBestEffort(peer, sid, {
            roomId: roomId,
            initiatorUserId: session.initiatorUserId,
            callKind: session.callKind,
            terminalStatus: optimisticEnd,
            tmpSessionId: isCommunityMessengerTempCallSessionId(sid) ? sid : undefined,
          });
          try {
            await postCommunityMessengerCallHangupSignal({ sessionId: sid, toUserId: peer, reason: hangupReason });
          } catch {
            /* PATCH 가 최종 상태 — hangup 은 상대 클라 빠른 갱신용 */
          }
        }
        const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: patchAction, durationSeconds: elapsedSeconds }),
        });
        const json = (await res.json().catch(() => ({}))) as SessionResponse;
        logCommunityMessengerCallSessionPatchDev({
          sessionId: sid,
          action: patchAction,
          responseStatus: res.status,
          responseBody: json,
          context: {
            sessionStatus: session.status,
            isInitiator: session.isMineInitiator,
            endedReason: session.endedReason ?? null,
          },
        });
        if (!res.ok || !json.ok) {
          setErrorMessage(
            json.error === "bad_action"
              ? t("cm_ui_call_end_already_ended")
              : t("cm_ui_call_end_failed")
          );
          await disposeCallMedia({ domAudioNuclear: true });
          scheduleSilentRefresh("terminal");
          return;
        }
        const serverTerminal: CommunityMessengerCallSession["status"] =
          json.session && isTerminalCallSessionStatus(json.session.status) ? json.session.status : optimisticEnd;
        applyTerminalSessionAfterPatch(json, roomId, sid, serverTerminal);
      } finally {
        setBusy(null);
        directCallPatchInFlightRef.current = false;
      }
    })();
  }, [
    applyTerminalSessionAfterPatch,
    appendTerminalCallHistory,
    beginRingingCallDismiss,
    disposeCallMedia,
    elapsedSeconds,
    scheduleSilentRefresh,
    session,
    t,
  ]);

  endCallRef.current = endCall;

  useEffect(() => {
    const clearTimers = () => {
      if (networkReconnectTimerRef.current != null) {
        window.clearTimeout(networkReconnectTimerRef.current);
        networkReconnectTimerRef.current = null;
      }
      if (networkReconnectFailTimerRef.current != null) {
        window.clearTimeout(networkReconnectFailTimerRef.current);
        networkReconnectFailTimerRef.current = null;
      }
    };

    const tryManualRejoin = async () => {
      const client = clientRef.current;
      const s = sessionRef.current;
      if (!client || !s || s.status !== "active") return;
      try {
        const connection = await fetchConnection();
        const state = (client as IAgoraRTCClient).connectionState;
        if (state === "CONNECTED" || state === "RECONNECTING") {
          setAgoraReconnecting(state === "RECONNECTING");
          return;
        }
        const provider = await loadCommunityMessengerCallProvider();
        await provider.joinCommunityMessengerAgoraChannel({
          client,
          appId: connection.appId,
          channelName: connection.channelName,
          token: connection.token,
          uid: connection.uid,
        });
        setAgoraReconnecting(false);
        clearTimers();
      } catch {
        /* fail timer handles terminal end */
      }
    };

    const endForNetworkLoss = () => {
      clearTimers();
      setAgoraReconnecting(false);
      setErrorMessage(t("cm_ui_network_connection_ended"));
      void endCallRef.current();
    };

    agoraNetworkHooksRef.current = {
      clearTimers,
      scheduleRecovery: () => {
        clearTimers();
        networkReconnectTimerRef.current = window.setTimeout(() => {
          void tryManualRejoin();
        }, AGORA_RECONNECT_ATTEMPT_MS);
        networkReconnectFailTimerRef.current = window.setTimeout(endForNetworkLoss, AGORA_RECONNECT_MAX_MS);
      },
      scheduleFailTimer: () => {
        if (networkReconnectFailTimerRef.current != null) return;
        networkReconnectFailTimerRef.current = window.setTimeout(endForNetworkLoss, AGORA_RECONNECT_MAX_MS);
      },
    };

    return () => {
      clearTimers();
      setAgoraReconnecting(false);
    };
  }, [fetchConnection, t]);

  const applyActiveVideoUpgradeRef = useRef<() => Promise<boolean>>(async () => false);

  const applyActiveVideoUpgrade = useCallback(async (): Promise<boolean> => {
    const s = sessionRef.current;
    if (!s) return false;
    setBusy("join");
    setErrorMessage(null);
    setPendingVideoUpgradeRequest(false);
    setIncomingVideoUpgradeRequest(false);
    try {
      const perm = await ensureVideoPermission();
      if (!perm.ok) {
        setErrorMessage(
          perm.code === "denied"
            ? t("cm_ui_camera_mic_denied_site_settings")
            : perm.code === "insecure_context"
              ? getCommunityMessengerInsecureOriginMediaHint()
              : t("cm_ui_browser_camera_unavailable")
        );
        return false;
      }
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(s.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upgrade_to_video" }),
      });
      const json = (await res.json().catch(() => ({}))) as SessionResponse;
      logCommunityMessengerCallSessionPatchDev({
        sessionId: s.id,
        action: "upgrade_to_video",
        responseStatus: res.status,
        responseBody: json,
        context: {
          sessionStatus: s.status,
          isInitiator: s.isMineInitiator,
          endedReason: s.endedReason ?? null,
        },
      });
      if (!res.ok || !json.ok || !json.session) {
        const code = json.error;
        setErrorMessage(
          code === "bad_action"
            ? t("cm_ui_video_upgrade_blocked")
            : code === "forbidden"
              ? t("cm_ui_call_forbidden")
              : code === "trade_chat_video_not_allowed"
                ? t("cm_ui_trade_post_voice_only")
                : code === "trade_chat_calls_disabled"
                  ? t("cm_ui_trade_post_calls_disabled")
                  : t("cm_ui_video_upgrade_failed")
        );
        return false;
      }
      const mod = await loadCommunityMessengerCallProvider();
      const videoTrack = await mod.createCommunityMessengerAgoraVideoTrackOnly();
      const client = clientRef.current;
      const tracks = localTracksRef.current;
      if (!client || !tracks) {
        videoTrack.stop();
        videoTrack.close();
        setErrorMessage(t("cm_ui_call_disconnected"));
        return false;
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
      setSpeakerEnabled(true);
      markCommunityMessengerMediaTrustedOnce(json.session.callKind);
      void bindLocalVideoTrack();
      autoVideoPublishAttemptedRef.current = `${json.session.id}:vpub`;
      showMessengerSnackbar(t("cm_ui_switched_to_video_snackbar"));
      return true;
    } catch (e) {
      setErrorMessage(getCommunityMessengerMediaErrorMessage(e, "video"));
      return false;
    } finally {
      setBusy(null);
    }
  }, [bindLocalVideoTrack, t]);

  applyActiveVideoUpgradeRef.current = applyActiveVideoUpgrade;

  const respondVideoUpgradeRequest = useCallback(
    async (accepted: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      const parties = resolveDirectCallPartyIds(s);
      if (!parties) return;
      setIncomingVideoUpgradeRequest(false);
      setErrorMessage(null);
      const sent = await publishVideoUpgradeResponse(parties.peerUserId, {
        sessionId: s.id,
        fromUserId: parties.myUserId,
        accepted,
      });
      if (!sent && !accepted) {
        showMessengerSnackbar(t("cm_ui_video_upgrade_failed"));
        return;
      }
      if (accepted) {
        await applyActiveVideoUpgrade();
      }
    },
    [applyActiveVideoUpgrade]
  );

  useEffect(() => {
    const parties = resolveDirectCallPartyIds(session);
    if (!parties?.myUserId) return;
    const myUserId = parties.myUserId;
    return subscribeVideoUpgradeBroadcast(myUserId, (event, payload) => {
      const active = sessionRef.current;
      if (!active || active.id !== payload.sessionId || active.status !== "active") return;
      const parties = resolveDirectCallPartyIds(active);
      if (!parties || payload.fromUserId === parties.myUserId) return;
      if (event === CM_VIDEO_UPGRADE_REQUEST) {
        setIncomingVideoUpgradeRequest(true);
        return;
      }
      if (event === CM_VIDEO_UPGRADE_RESPONSE) {
        setPendingVideoUpgradeRequest(false);
        if (payload.accepted) {
          void applyActiveVideoUpgradeRef.current();
        } else {
          showMessengerSnackbar(t("cm_ui_video_upgrade_blocked"));
        }
      }
    });
  }, [session, sessionId, t]);

  const requestUpgradeToVideo = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || s.sessionMode !== "direct") {
      showMessengerSnackbar(t("cm_ui_video_upgrade_not_in_direct"));
      return;
    }
    if (s.callKind === "video") {
      showMessengerSnackbar(t("cm_ui_already_video_call"));
      return;
    }
    const ringingUpgrade = s.status === "ringing" && s.isMineInitiator;
    const activeUpgrade = joined && s.status === "active";
    if (!ringingUpgrade && !activeUpgrade) {
      showMessengerSnackbar(t("cm_ui_video_upgrade_unavailable_now"));
      return;
    }
    if (activeUpgrade && localTracksRef.current?.videoTrack) {
      showMessengerSnackbar(t("cm_ui_camera_already_on"));
      return;
    }

    if (activeUpgrade) {
      if (pendingVideoUpgradeRequest) {
        showMessengerSnackbar(t("cm_ui_video_upgrade_request_pending"));
        return;
      }
      const parties = resolveDirectCallPartyIds(s);
      if (!parties) {
        showMessengerSnackbar(t("cm_ui_video_upgrade_failed"));
        return;
      }
      setPendingVideoUpgradeRequest(true);
      const sent = await publishVideoUpgradeRequest(parties.peerUserId, {
        sessionId: s.id,
        fromUserId: parties.myUserId,
      });
      if (!sent) {
        setPendingVideoUpgradeRequest(false);
        showMessengerSnackbar(t("cm_ui_video_upgrade_failed"));
        return;
      }
      showMessengerSnackbar(t("cm_ui_video_upgrade_request_pending"));
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
        logCommunityMessengerCallSessionPatchDev({
          sessionId: s.id,
          action: "upgrade_to_video",
          responseStatus: res.status,
          responseBody: json,
          context: {
            sessionStatus: s.status,
            isInitiator: s.isMineInitiator,
            endedReason: s.endedReason ?? null,
          },
        });
        if (!res.ok || !json.ok || !json.session) {
          const code = json.error;
          setErrorMessage(
            code === "bad_action"
              ? t("cm_ui_video_upgrade_blocked")
              : code === "forbidden"
                ? t("cm_ui_call_forbidden")
                : code === "trade_chat_video_not_allowed"
                  ? t("cm_ui_trade_post_voice_only")
                  : code === "trade_chat_calls_disabled"
                    ? t("cm_ui_trade_post_calls_disabled")
                    : t("cm_ui_video_upgrade_failed")
          );
          return;
        }
        setSession(json.session);
        setSpeakerEnabled(true);
        showMessengerSnackbar(t("cm_ui_switched_to_video_snackbar"));
      } finally {
        setBusy(null);
      }
      return;
    }
  }, [joined, pendingVideoUpgradeRequest, t]);

  const requestDowngradeToVoice = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || s.sessionMode !== "direct") {
      showMessengerSnackbar(t("cm_ui_voice_downgrade_not_in_direct"));
      return;
    }
    if (s.callKind !== "video") {
      showMessengerSnackbar(t("cm_ui_already_voice_call"));
      return;
    }
    const ringingDowngrade = s.status === "ringing";
    const activeDowngrade = joinedRef.current && s.status === "active";
    if (!ringingDowngrade && !activeDowngrade) {
      showMessengerSnackbar(t("cm_ui_voice_downgrade_unavailable_now"));
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
      logCommunityMessengerCallSessionPatchDev({
        sessionId: s.id,
        action: "downgrade_to_voice",
        responseStatus: res.status,
        responseBody: json,
        context: {
          sessionStatus: s.status,
          isInitiator: s.isMineInitiator,
          endedReason: s.endedReason ?? null,
        },
      });
      if (!res.ok || !json.ok || !json.session) {
        const code = json.error;
        setErrorMessage(
          code === "bad_action"
            ? t("cm_ui_voice_downgrade_blocked")
            : code === "forbidden"
              ? t("cm_ui_call_forbidden")
              : t("cm_ui_voice_downgrade_failed")
        );
        return;
      }
      setSession(json.session);
      setCamOff(false);
      setLayoutSwapped(false);
      autoVideoPublishAttemptedRef.current = null;
      void bindLocalVideoTrack();
      setSpeakerEnabled(false);
      showMessengerSnackbar(t("cm_ui_switched_to_voice_snackbar"));
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
      if (!resumeDetachedCommunityCall(sessionId)) {
        const staleDetached = takeDetachedCommunityCallCleanup(sessionId);
        if (staleDetached) {
          await staleDetached();
        }
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
          setErrorMessage(t("cm_ui_call_session_missing"));
        }
        /* Agora 토큰: session 상태 반영 후 prefetch effect 가 단일 요청 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
      void disposeCallMedia({ domAudioNuclear: false });
    };
  }, [disposeCallMedia, refreshSession, sessionId]);

  useEffect(() => {
    if (isCommunityMessengerTempCallSessionId(sessionId)) return;
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
              setSession((prev) => {
                const merged = mergeRealtimeSessionRowIntoSnapshot(prev, row, sessionId);
                if (
                  prev?.status === "ringing" &&
                  merged &&
                  merged.id === sessionId &&
                  isTerminalCallSessionStatus(merged.status)
                ) {
                  beginRingingCallDismiss(merged.roomId);
                }
                return merged;
              });
              const rt = readRealtimeSessionStatus(row.status);
              if (rt === "active") {
                setErrorMessage(null);
                stopCommunityMessengerCallTone();
                if (sessionRealtimeDebounceRef.current) {
                  clearTimeout(sessionRealtimeDebounceRef.current);
                  sessionRealtimeDebounceRef.current = null;
                }
                if (refreshScheduleTimerRef.current) {
                  clearTimeout(refreshScheduleTimerRef.current);
                  refreshScheduleTimerRef.current = null;
                }
                void refreshSession(true);
              } else if (rt === "rejected" || rt === "cancelled" || rt === "missed") {
                setErrorMessage(null);
                stopCommunityMessengerCallTone();
              } else if (rt === "ended") {
                stopCommunityMessengerCallTone();
                const er = (row as Record<string, unknown>).ended_reason;
                const ers = typeof er === "string" ? er.trim() : "";
                if (!ers || !isMessengerCallClientFailureReason(ers)) {
                  setErrorMessage(null);
                }
              }
            }
            const status = readRealtimeSessionStatus(row?.status);
            if (status === "active") {
              return;
            }
            if (status && isTerminalCallSessionStatus(status)) {
              stopCommunityMessengerCallTone();
              if (sessionRealtimeDebounceRef.current) {
                clearTimeout(sessionRealtimeDebounceRef.current);
                sessionRealtimeDebounceRef.current = null;
              }
              scheduleSilentRefresh("terminal");
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
  }, [beginRingingCallDismiss, refreshSession, scheduleSilentRefresh, sessionId]);

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
            const myUserId =
              active.participants.find((p) => p.isMe)?.userId?.trim() ??
              (active.isMineInitiator
                ? active.initiatorUserId.trim()
                : (active.recipientUserId?.trim() ?? ""));
            const relevantHangup =
              !fromUserId ||
              !peerUserId ||
              fromUserId === peerUserId ||
              (myUserId ? fromUserId === myUserId : false);
            if (!relevantHangup) return;
            if (active.status === "ringing") {
              beginRingingCallDismiss(active.roomId);
            }
            const payloadObj =
              row.payload && typeof row.payload === "object"
                ? (row.payload as Record<string, unknown>)
                : null;
            const nextStatus = resolveHangupTerminalStatusForSnapshot(active, payloadObj?.reason);
            const endedAtIso = new Date().toISOString();
            const hangupReason = typeof payloadObj?.reason === "string" ? payloadObj.reason.trim() : null;
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
            appendTerminalCallHistory(active, nextStatus, { hangupReason });
            setSession(snapshot);
            joiningRef.current = false;
            setJoined(false);
            joinedRef.current = false;
            setRemoteJoined(false);
            stopCommunityMessengerCallTone();
            void disposeCallMedia({ domAudioNuclear: true }).catch(() => {});
            scheduleSilentRefresh("terminal");
          }
        ),
    });
    return () => {
      cancelled = true;
      sub.stop();
    };
  }, [appendTerminalCallHistory, beginRingingCallDismiss, disposeCallMedia, scheduleSilentRefresh, sessionId]);

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
        if (active.status === "ringing") {
          beginRingingCallDismiss(active.roomId);
        }
        /**
         * 브로드캐스트에 reason 이 없음.
         * 링 중 발신자(initiator)에게 오는 hangup = 상대(수신)의 거절·종료 계열 → 서버는 보통 `rejected`.
         * 링 중 수신자에게 오는 hangup = 발신 취소 → `cancelled`.
         * (이전: 발신자에게 `cancelled` 를 넣어 거절인데도 취소 UI·자동 닫기 기대와 어긋남)
         */
        let optimisticStatus: CommunityMessengerCallSession["status"];
        if (active.status === "ringing") {
          optimisticStatus = active.isMineInitiator ? "rejected" : "cancelled";
        } else {
          optimisticStatus = "ended";
        }
        const nowIso = new Date().toISOString();
        const snapshot: CommunityMessengerCallSession = {
          ...active,
          status: optimisticStatus,
          endedAt: nowIso,
          endedReason: null,
        };
        callTerminalLocalPinRef.current = {
          sessionId,
          until: Date.now() + CALL_SESSION_TERMINAL_PIN_MS,
          snapshot,
        };
        appendTerminalCallHistory(active, optimisticStatus, {
          hangupReason:
            optimisticStatus === "rejected" ? "reject" : optimisticStatus === "cancelled" ? "cancel" : "end",
        });
        setSession(snapshot);
        joiningRef.current = false;
        setJoined(false);
        joinedRef.current = false;
        setRemoteJoined(false);
        stopCommunityMessengerCallTone();
        void disposeCallMedia({ domAudioNuclear: true }).catch(() => {});
        scheduleSilentRefresh("terminal");
      },
    });
    return () => {
      cancelled = true;
      void sb.removeChannel(ch);
    };
  }, [
    appendTerminalCallHistory,
    beginRingingCallDismiss,
    disposeCallMedia,
    scheduleSilentRefresh,
    session?.id,
    session?.participants,
    sessionId,
  ]);

  useEffect(() => {
    autoJoinBlockedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    if (!session.isMineInitiator) return;
    if (session.sessionMode !== "direct") return;
    if (session.status !== "active") return;
    if (isTerminalCallSessionStatus(session.status)) return;
    if (joinedRef.current || joiningRef.current) return;
    if (initiatorCanAutoJoinWithMedia(session.callKind)) {
      autoJoinBlockedRef.current = false;
      return;
    }
    autoJoinBlockedRef.current = true;
    setErrorMessage(
      session.callKind === "video"
        ? t("nav_messenger_permission_retry_camera_mic")
        : t("nav_messenger_permission_retry_mic")
    );
  }, [session?.callKind, session?.id, session?.isMineInitiator, session?.sessionMode, session?.status, t]);

  /** active 에서만 Agora·로컬 미디어 세션 시작(ringing 에서는 벨/링백만) */
  useEffect(() => {
    const s = sessionRef.current;
    if (!s || s.sessionMode !== "direct") return;
    if (s.status !== "active") return;
    if (isTerminalCallSessionStatus(s.status)) return;
    stopCommunityMessengerCallTone();
    if (autoJoinBlockedRef.current) return;
    if (joiningRef.current || joinedRef.current) return;
    if (s.isMineInitiator && !initiatorCanAutoJoinWithMedia(s.callKind)) {
      autoJoinBlockedRef.current = true;
      setErrorMessage(
        s.callKind === "video"
          ? t("nav_messenger_permission_retry_camera_mic")
          : t("nav_messenger_permission_retry_mic")
      );
      return;
    }
    setErrorMessage(null);
    void joinCall(s);
  }, [
    joinCall,
    session?.id,
    session?.isMineInitiator,
    session?.sessionMode,
    session?.status,
    t,
  ]);

  useEffect(() => {
    if (!session) return;
    if (!isTerminalCallSessionStatus(session.status)) return;
    const endedAtMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    if (!terminalClosedAt) {
      setTerminalClosedAt(endedAtMs);
      setEndedDurationSeconds(
        connectedAtTs != null ? Math.max(0, Math.floor((endedAtMs - connectedAtTs) / 1000)) : null
      );
      try {
        clearAllCommunityCallLocalSessionFlags();
        notifyCommunityCallHostSync();
        resetCommunityMessengerCallRuntimeSurface();
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
      setErrorMessage(t("cm_ui_call_continue_in_chat_room"));
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
  }, [acceptIncoming, requestedAction, session?.id, session?.isMineInitiator, session?.sessionMode, session?.status]);

  useEffect(() => {
    if (!session || !joined || !session.answeredAt) return;
    const startedAt = new Date(session.answeredAt).getTime();
    const tick = () => {
      const next = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      elapsedSecondsRef.current = next;
      setElapsedSeconds(next);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
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
    setConnectedAtTs((prev) => {
      if (prev != null) return prev;
      const answeredMs = session.answeredAt ? new Date(session.answeredAt).getTime() : NaN;
      return Number.isFinite(answeredMs) ? answeredMs : Date.now();
    });
  }, [joined, remoteJoined, session?.answeredAt, session?.id, session?.status]);

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

  useEffect(() => {
    const s = sessionRef.current;
    if (!s?.id || s.callKind !== "video" || !joinedRef.current || s.status !== "active") return;
    writeActiveDirectVideoCallSession(s.id);
    notifyCommunityCallHostSync();
  }, [joined, session?.callKind, session?.id, session?.status]);

  /** 조건부 return 위에 두어야 함 — 그 아래에서 훅을 호출하면 렌더마다 훅 개수가 달라져 런타임 오류가 난다. */
  const closeTerminalView = useCallback(() => {
    navigateBackFromCommunityMessengerCall(router, sessionRef.current?.roomId);
  }, [router]);

  const handleExpandToFullscreen = useCallback(() => {
    const sid = sessionRef.current?.id?.trim();
    if (!sid) return;
    clearMinimizedCommunityCallSessionFlags();
    resumeDetachedCommunityCall(sid);
    notifyCommunityCallHostSync();
    syncCommunityMessengerCallRuntimeSurface({ presentation: "fullscreen" });
    router.push(`/community-messenger/calls/${encodeURIComponent(sid)}`);
  }, [router]);

  const handleMinimizeToPip = useCallback(() => {
    const s = sessionRef.current;
    if (!s?.id || s.callKind !== "video" || !joinedRef.current) return;
    minimizeCommunityCallToPip({
      sessionId: s.id,
      roomId: s.roomId,
      cleanup: () => disposeCallMedia(),
    });
    notifyCommunityCallHostSync();
    syncCommunityMessengerCallRuntimeSurface({ presentation: "minimized" });
    navigateBackFromCommunityMessengerCall(router, s.roomId);
  }, [disposeCallMedia, router]);

  const handlePipSingleTapSwap = useCallback(() => {
    if (!remoteJoinedRef.current || !localVideoReadyRef.current || !remoteVideoReadyRef.current) return;
    setLayoutSwapped((prev) => !prev);
  }, []);

  const videoPipGesture = useCallVideoPipGesture({
    sessionId: session?.id,
    enabled: Boolean(
      session?.callKind === "video" &&
        shouldMountLocalVideoPipShell({
          videoCall: true,
          sessionStatus: session?.status,
          joined,
        })
    ),
    positionMode: presentation === "minimized" ? "viewport-fixed" : "stage-absolute",
    stageRef: videoStageRef,
    stageBottomExtraPx: 80,
    micMuted,
    cameraOff: camOff,
    pipLabel: layoutSwapped ? (session?.peerLabel ?? t("common_me")) : t("common_me"),
    onSingleTap: handlePipSingleTapSwap,
    onExpandFullscreen: handleExpandToFullscreen,
    doubleTapAction: presentation === "minimized" ? "fullscreen" : "zoom",
  });

  if (loading && !session) {
    /** 시드 없이 진입한 짧은 구간 — 보라 플레이스홀더(`RouteLoading`)는 실제 통화 UI 와 겹쳐 보여 동일 껍데기로만 표시 */
    const dismissHydrate = () => navigateBackFromCommunityMessengerCall(router, null);
    const hydrateKind = searchParams.get("kind") === "video" ? "video" : "voice";
    const hydrateVm: CallScreenViewModel = {
      mode: hydrateKind,
      direction: "outgoing",
      phase: "ringing",
      peerLabel: t("cm_ui_call_label"),
      peerAvatarUrl: null,
      statusText:
        hydrateKind === "video" ? t("cm_ui_outgoing_video_dialing") : t("cm_ui_outgoing_voice_dialing"),
      subStatusText: t("cm_ui_call_loading_session"),
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
        cameraEnabled: hydrateKind === "video",
        localVideoMinimized: true,
      },
      onBack: dismissHydrate,
      hideOutgoingVideoBrandRow: true,
      primaryActions: [
        {
          id: "end",
          label: t("nav_close"),
          icon: "end",
          tone: "danger",
          onClick: dismissHydrate,
        },
      ],
      mainVideoSlot:
        hydrateKind === "video" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <span className="sam-text-body-secondary text-white/40">{t("common_loading")}</span>
          </div>
        ) : undefined,
      showRemoteVideo: false,
      showLocalVideo: false,
      videoPipLayout: null,
      participantsSummary: null,
      autoCloseMs: null,
    };
    return (
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <CallScreen vm={hydrateVm} variant="page" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="sam-text-page-title font-semibold text-ui-fg">{t("cm_ui_not_found_call")}</p>
        <button
          type="button"
          onClick={() => router.replace("/community-messenger?section=chats")}
          className="rounded-ui-rect bg-ui-fg px-4 py-3 sam-text-body font-semibold text-ui-surface"
        >
          {t("cm_ui_return_to_messenger")}
        </button>
      </div>
    );
  }

  const videoCall = session.callKind === "video";
  const directPhase = resolveDirectCallPhase(session.status, joined, remoteJoined);
  const suppressTerminalView = callDismissInFlightRef.current;
  const effectiveDirectPhase: CallPhase =
    suppressTerminalView && isTerminalCallSessionStatus(session.status) ? "ringing" : directPhase;
  /**
   * 전용 통화 페이지에서 자동/수동 수락 PATCH 직전까지 `ringing` 이면 CallScreen 이 IncomingCallView(벨 UI)를 다시 그린다.
   * `?action=accept`·`busy==="accept"`·수락 래치(`calleeVideoConnectingShell`) 중에는 phase 만 `connecting` 으로 올린다.
   */
  const calleeAcceptBridgeLayout =
    !session.isMineInitiator &&
    session.status === "ringing" &&
    (requestedAction === "accept" || busy === "accept" || calleeVideoConnectingShell);
  const callScreenPhase: CallPhase =
    agoraReconnecting && (effectiveDirectPhase === "connected" || effectiveDirectPhase === "connecting")
      ? "reconnecting"
      : calleeAcceptBridgeLayout && effectiveDirectPhase === "ringing"
        ? "connecting"
        : effectiveDirectPhase;
  /** 발신자: 상대 수락(active) 후 media ready 이면 자동 Agora 조인 — 앱 레벨 권한 오버레이 없음 */
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
        showMessengerSnackbar(t("cm_ui_network_error_could_not_start_call"), { variant: "error" });
      }
    })();
  };

  const failureEndedDetail =
    session.status === "ended" &&
    session.endedReason &&
    isMessengerCallClientFailureReason(session.endedReason)
      ? messengerCallFailureEndedDetail(session.endedReason, session.callKind)
      : null;

  const terminalFailureHeadline = messengerCallTerminalFailureHeadline({
    status: session.status,
    endedReason: session.endedReason,
    callKind: session.callKind,
    joined,
  });

  /** join 실패·ICE 등 `failed_*` — 자동 닫기 금지(다시 시도·닫기 유지). 통화 중 실패도 동일. */
  const terminalFailureRequiresUserDismiss =
    session.status === "ended" &&
    Boolean(session.endedReason && isMessengerCallClientFailureReason(session.endedReason));

  const primaryActions: CallActionItem[] = [];
  const secondaryActions: CallActionItem[] = [];

  if (
    !suppressTerminalView &&
    (directPhase === "ended" || directPhase === "declined" || directPhase === "missed" || directPhase === "failed")
  ) {
    const skipRetryForInsecure =
      session.status === "ended" && session.endedReason === "failed_insecure_context";
    const skipRetryForCalleeReject = session.status === "rejected";
    if (!skipRetryForInsecure && !skipRetryForCalleeReject) {
      primaryActions.push({
        id: "retry-call",
        label: t("common_retry"),
        icon: "retry",
        onClick: () => startOutgoingAgain(session.callKind),
        disabled: !session.peerUserId,
      });
    }
  } else if (session.isMineInitiator && effectiveDirectPhase === "ringing" && !videoCall) {
    /** 음성 발신 벨 — 권한 이미 허용됨: 실제 스피커·영상 전환·음소거 */
    primaryActions.push(
      {
        id: "speaker",
        label: t("cm_ui_speaker"),
        icon: "speaker",
        active: speakerEnabled,
        disabled: busy === "upgrade",
        onClick: toggleSpeakerEnabled,
      },
      {
        id: "upgrade-video",
        label: t("cm_ui_video_short"),
        icon: "video",
        active: session.callKind === "video",
        disabled: busy === "upgrade" || busy === "end",
        onClick: () => void requestUpgradeToVideo(),
      },
      {
        id: "mute",
        label: micMuted ? t("cm_ui_unmute") : t("cm_ui_mute"),
        icon: "mic",
        active: !micMuted,
        disabled: !joined || busy === "end",
        onClick: () => void toggleMicEnabled(),
      },
      {
        id: "end",
        label: busy === "end" ? t("cm_ui_cancel_call_in_progress") : t("cm_ui_end_call"),
        icon: "end",
        tone: "danger",
        disabled: busy === "end",
        onClick: () => void endCall(),
      }
    );
  } else if (!session.isMineInitiator && effectiveDirectPhase === "ringing") {
    primaryActions.push(
      {
        id: "reject",
        label: busy === "reject" ? t("cm_ui_rejecting") : t("cm_ui_reject"),
        icon: "decline",
        tone: "danger",
        disabled: busy === "reject" || busy === "accept" || busy === "join",
        onClick: () => void rejectIncoming(),
      },
      {
        id: "accept",
        label: busy === "accept" || busy === "join" ? t("cm_ui_connecting") : t("cm_ui_accept"),
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
        label: t("cm_ui_switch_camera"),
        icon: "camera-switch",
        disabled: !mediaReady || !cameraSwitchSupported || busy === "camera",
        onClick: () => void switchCameraFacing(),
      },
      {
        id: "swap-pip-main",
        label: t("cm_ui_swap_pip_layout"),
        icon: "pip-swap",
        disabled:
          !mediaReady ||
          !remoteJoined ||
          !localVideoReady ||
          busy === "join" ||
          busy === "upgrade",
        onClick: () => setLayoutSwapped((p) => !p),
      },
      {
        id: "camera",
        label: t("cm_ui_video_short"),
        icon: "camera",
        active: !camOff,
        disabled: !mediaReady || busy === "join" || busy === "upgrade",
        onClick: () => void toggleCamEnabled(),
      },
      {
        id: "mute",
        label: micMuted ? t("cm_ui_unmute") : t("cm_ui_mute"),
        icon: "mic",
        active: !micMuted,
        disabled: busy === "join" || busy === "upgrade",
        onClick: () => void toggleMicEnabled(),
      },
      {
        id: "end",
        label: busy === "end" ? t("cm_ui_ending_call") : t("cm_ui_end_call"),
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
        label: t("cm_ui_speaker"),
        icon: "speaker",
        active: speakerEnabled,
        disabled: busy === "upgrade",
        onClick: toggleSpeakerEnabled,
      },
      {
        id: "upgrade-video",
        label: t("cm_ui_switch_to_video"),
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
        label: micMuted ? t("cm_ui_unmute") : t("cm_ui_mute"),
        icon: "mic",
        active: !micMuted,
        disabled: busy === "join" || busy === "upgrade",
        onClick: () => void toggleMicEnabled(),
      },
      {
        id: "end",
        label: busy === "end" ? t("cm_ui_ending_call") : t("cm_ui_end_call"),
        icon: "end",
        tone: "danger",
        disabled: busy === "end",
        onClick: () => void endCall(),
      }
    );
  }

  if (incomingVideoUpgradeRequest && session.status === "active" && !videoCall) {
    secondaryActions.push(
      {
        id: "video-upgrade-decline",
        label: t("cm_ui_video_upgrade_decline"),
        icon: "decline",
        tone: "danger",
        disabled: busy === "join" || busy === "upgrade",
        onClick: () => void respondVideoUpgradeRequest(false),
      },
      {
        id: "video-upgrade-accept",
        label: t("cm_ui_video_upgrade_accept"),
        icon: "video",
        tone: "accept",
        disabled: busy === "join" || busy === "upgrade",
        onClick: () => void respondVideoUpgradeRequest(true),
      }
    );
  }

  if (
    (localVideoPlayBlocked ||
      (errorMessage &&
        !isCommunityMessengerNonRetryableCallErrorMessage(errorMessage))) &&
    !incomingVideoUpgradeRequest &&
    directPhase !== "ended" &&
    directPhase !== "declined" &&
    directPhase !== "missed" &&
    directPhase !== "failed"
  ) {
    secondaryActions.push({
      id: "retry-media",
      label: busy === "join" || busy === "accept" ? t("cm_ui_retrying") : t("common_retry"),
      icon: "retry",
      disabled: busy === "join" || busy === "accept",
      onClick: handleRetryMediaAndJoin,
    });
  }

  if (
    !suppressTerminalView &&
    (directPhase === "ended" || directPhase === "declined" || directPhase === "missed" || directPhase === "failed")
  ) {
    if (
      terminalFailureRequiresUserDismiss &&
      session.endedReason === "failed_permission" &&
      typeof window !== "undefined"
    ) {
      secondaryActions.push({
        id: "open-permission-settings",
        label: t("cm_ui_open_settings"),
        icon: "settings",
        onClick: () => {
          openCommunityMessengerPermissionSettings();
        },
      });
    }
    secondaryActions.push({
      id: "close-terminal",
      label: t("nav_close"),
      icon: "close",
      onClick: closeTerminalView,
    });
  }

  const statusText =
    terminalFailureHeadline !== null
      ? terminalFailureHeadline
      : failureEndedDetail !== null
        ? t("cm_ui_call_ended")
        : callScreenPhase === "ringing"
            ? session.isMineInitiator
              ? videoCall
                ? t("cm_ui_outgoing_video_dialing")
                : t("cm_ui_outgoing_voice_dialing")
              : videoCall
                ? t("cm_ui_incoming_video_ringing")
                : t("cm_ui_incoming_voice_ringing")
            : callScreenPhase === "connecting"
              ? t("cm_ui_connecting")
              : callScreenPhase === "reconnecting"
                ? t("cm_ui_call_reconnecting")
              : callScreenPhase === "connected"
                ? videoCall
                  ? t("cm_ui_call_active_video")
                  : t("cm_ui_call_active_voice")
                : callScreenPhase === "declined"
                  ? t("cm_ui_peer_declined_call")
                  : callScreenPhase === "missed"
                    ? t("cm_ui_call_missed_status")
                    : callScreenPhase === "failed"
                      ? t("cm_ui_call_ended")
                      : callScreenPhase === "ended"
                        ? session.status === "cancelled"
                          ? t("cm_ui_call_cancelled")
                          : t("cm_ui_call_ended")
                        : t("cm_ui_call_ended");

  const subStatusText =
    failureEndedDetail ??
    errorMessage ??
    (localVideoPlayBlocked
      ? t("cm_ui_video_preparing_display")
      : callScreenPhase === "ringing"
        ? session.isMineInitiator
          ? t("cm_ui_waiting_for_peer_answer")
          : t("cm_ui_choose_accept_or_reject")
        : callScreenPhase === "connecting"
          ? calleeAcceptBridgeLayout
            ? t("cm_ui_call_connecting_session")
            : t("cm_ui_call_attaching_media")
          : callScreenPhase === "reconnecting"
            ? t("cm_ui_call_reconnecting")
            : callScreenPhase === "connected"
              ? lastMileLine
              : null);

  /** PiP shell — joined 직후 DOM 마운트(`localVideoReady` 와 분리) */
  const pipShellMounted = shouldMountLocalVideoPipShell({
    videoCall,
    sessionStatus: session.status,
    joined,
  });
  /** PiP 크롬 — 로컬 트랙 play 완료 후 표시 */
  const videoPipChromeActive = shouldShowLocalVideoPipChrome({
    videoCall,
    sessionStatus: session.status,
    joined,
    localVideoReady,
  });

  /**
   * 영상 조인 전 로컬 미리보기 — `ringing`→`active`·Agora consume 직후에도 끊기지 않게
   * held ref 로 동일 스트림을 `localVideoReady` 까지 유지한다.
   */
  const preJoinVideoPreviewStream = useMemo(() => {
    if (typeof window === "undefined") return null;
    const peek = peekPrimedCommunityMessengerDeviceStream("video");
    if (peek) {
      heldPreJoinVideoPreviewRef.current = peek;
    }
    const resolved = resolvePreJoinVideoPreviewStream({
      session,
      localVideoPlaying: localVideoReady,
      peekStream: peek,
      heldStream: heldPreJoinVideoPreviewRef.current,
    });
    if (!resolved) {
      heldPreJoinVideoPreviewRef.current = null;
    }
    return resolved;
  }, [
    joined,
    localVideoReady,
    session,
    session?.callKind,
    session?.id,
    session?.isMineInitiator,
    session?.status,
  ]);

  useLayoutEffect(() => {
    if (!preJoinVideoPreviewStream || localVideoReady) {
      detachPreJoinHtmlVideo(ringPreviewVideoRef.current);
      return;
    }
    const el = ringPreviewVideoRef.current;
    if (!el) return;
    void attachPreJoinHtmlVideo(el, preJoinVideoPreviewStream);
    return () => {
      if (!localVideoReady) return;
      detachPreJoinHtmlVideo(el);
    };
  }, [localVideoReady, preJoinVideoPreviewStream]);

  useEffect(() => {
    if (!localVideoReady) return;
    heldPreJoinVideoPreviewRef.current = null;
    if (ringPreviewVideoRef.current) {
      try {
        ringPreviewVideoRef.current.srcObject = null;
      } catch {
        /* noop */
      }
    }
  }, [localVideoReady]);

  const selfAvatarUrlForPip = useMemo(
    () =>
      peekMessengerBootstrapFull()?.me?.avatarUrl ?? peekMessengerBootstrapCritical()?.me?.avatarUrl ?? null,
    []
  );

  const miniVideoSlotEl = videoCall ? (
    <div className="relative h-full w-full bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
      <div ref={smallVideoRef} className="h-full w-full" />
      {camOff ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col items-center justify-center gap-1.5 bg-black">
          <SamarketUserAvatarThumb
            avatarUrl={selfAvatarUrlForPip}
            size={40}
            roundedClassName="rounded-full"
            className="ring-1 ring-white/20"
          />
          <VideoOff size={14} strokeWidth={2.25} className="text-white/85" aria-hidden />
        </div>
      ) : null}
    </div>
  ) : undefined;

  useLayoutEffect(() => {
    const livePresentation =
      presentation === "minimized"
        ? "minimized"
        : joined && session?.callKind === "video" && session.status === "active"
          ? "fullscreen"
          : "idle";
    syncCommunityMessengerCallRuntimeSurface({
      presentation: livePresentation,
      videoPipLayout: pipShellMounted ? videoPipGesture : null,
      miniVideoSlot: miniVideoSlotEl ?? null,
      expandToFullscreen: handleExpandToFullscreen,
      minimizeToPip: handleMinimizeToPip,
    });
  }, [
    camOff,
    handleExpandToFullscreen,
    handleMinimizeToPip,
    joined,
    miniVideoSlotEl,
    pipShellMounted,
    presentation,
    session?.callKind,
    session?.status,
    videoPipGesture,
  ]);

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
      directPhase === "ringing" && ringStartAt
        ? t("cm_ui_call_timer_starts_after_connect")
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
    hideOutgoingVideoBrandRow: Boolean(
      videoCall &&
        (session.isMineInitiator
          ? !(remoteJoined && remoteVideoReady)
          : callScreenPhase === "ringing" || callScreenPhase === "connecting")
    ),
    primaryActions,
    secondaryActions,
    mainVideoSlot: videoCall ? (
      <div className="absolute inset-0 min-h-0 bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:min-h-0 [&_video]:object-cover">
        <div ref={largeVideoRef} className="absolute inset-0 z-[1] h-full min-h-0 w-full" />
        {preJoinVideoPreviewStream && !localVideoReady ? (
          <video
            ref={ringPreviewVideoRef}
            className="absolute inset-0 z-[2] h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
        ) : null}
        {(session.isMineInitiator || (calleeAcceptBridgeLayout && videoCall)) &&
        !localVideoReady &&
        !preJoinVideoPreviewStream ? (
          <div
            className="absolute inset-0 z-[2] flex items-center justify-center bg-black pointer-events-none"
            aria-hidden
          >
            <span className="sam-text-body-secondary text-center text-white/50">
              {!joined ? t("cm_ui_camera_preparing_connection") : t("cm_ui_video_preparing_display")}
            </span>
          </div>
        ) : null}
      </div>
    ) : undefined,
    miniVideoSlot: miniVideoSlotEl,
    showRemoteVideo: videoCall ? remoteJoined && remoteVideoReady : false,
    pipShellMounted,
    showLocalVideo: videoPipChromeActive,
    videoPipLayout: pipShellMounted ? videoPipGesture : null,
    participantsSummary: null,
    suppressTerminalView,
    /**
     * 터미널 요약을 잠시 보여준 뒤 복귀 — `failed_*` 도 일정 시간 후 닫힘(닫기 버튼은 그대로).
     * 벨 거절·취소는 `suppressTerminalView` 로 요약 화면·자동 닫기 없이 즉시 복귀.
     */
    autoCloseMs:
      suppressTerminalView
        ? null
        : directPhase === "ended" ||
            directPhase === "declined" ||
            directPhase === "missed" ||
            directPhase === "failed"
          ? terminalFailureRequiresUserDismiss
            ? 2000
            : 1000
          : null,
  };

  const insecureOriginBlocked =
    typeof window !== "undefined" && isCommunityMessengerMediaBlockedByInsecureOrigin();
  const showCallerInsecureGateOverlay =
    Boolean(session) &&
    session.isMineInitiator &&
    session.status === "ringing" &&
    !joined &&
    insecureOriginBlocked;

  if (presentation === "minimized") {
    return (
      <div className="fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none" aria-hidden>
        {videoCall ? <div ref={largeVideoRef} className="h-full w-full" /> : null}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <CallScreen vm={callVm} variant="page" />
      {showCallerInsecureGateOverlay ? (
        <CallerInsecureGateOverlay
          onClose={() => void endCall()}
          closeBusy={busy === "end"}
        />
      ) : null}
    </div>
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
  const { t } = useI18n();
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
          <p className="sam-text-body font-semibold text-white">{t("cm_ui_keypad")}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 sam-text-body-secondary font-medium text-white/75 transition hover:bg-sam-surface/10"
          >
            {t("nav_close")}
          </button>
        </div>
        <p className="mb-3 sam-text-xxs leading-snug text-white/45">{t("cm_ui_dtmf_local_only_notice")}</p>
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
  _remoteJoined: boolean
): CallPhase {
  if (status === "rejected") return "declined";
  if (status === "missed") return "missed";
  if (status === "cancelled") return "ended";
  if (status === "ended") return "ended";
  if (status === "ringing") return "ringing";
  /**
   * active 인데 `joined && remoteJoined` 를 요구하면 원격 오디오 구독이 늦을 때 ‘연결 중’에 오래 머물며
   * 발신 화면 전환이 늦게 느껴진다. 로컬 채널 조인·퍼블리시 완료면 통화 중으로 올린다.
   */
  if (status === "active") {
    return joined ? "connected" : "connecting";
  }
  return "connecting";
}

function resolveDirectCallPartyIds(
  session: CommunityMessengerCallSession | null | undefined
): { myUserId: string; peerUserId: string } | null {
  if (!session) return null;
  const myUserId =
    session.participants.find((p) => p.isMe)?.userId?.trim() ??
    (session.isMineInitiator
      ? session.initiatorUserId.trim()
      : (session.recipientUserId?.trim() ?? ""));
  const peerUserId = session.peerUserId?.trim() ?? "";
  if (!myUserId || !peerUserId) return null;
  return { myUserId, peerUserId };
}

function peerDisplayInitial(label: string): string {
  const t = label.trim();
  if (!t) return "?";
  const first = [...t][0];
  return first ?? "?";
}

function CallerInsecureGateOverlay(props: { onClose: () => void; closeBusy: boolean }) {
  const { t } = useI18n();
  const headline = t("cm_ui_call_https_required_headline");
  const detail = messengerCallFailureEndedDetail("failed_insecure_context");

  return (
    <div className="pointer-events-auto absolute inset-0 z-[45] flex items-center justify-center bg-black/50 px-5 backdrop-blur-[2px]">
      <div className="w-full max-w-[300px] rounded-[20px] border border-sam-surface/12 bg-[#1e232c]/95 px-5 py-5 text-center shadow-xl">
        <p className="sam-text-body-lg font-semibold text-white">{headline}</p>
        {detail ? (
          <p className="mt-2 sam-text-body-secondary leading-snug text-white/75">{detail}</p>
        ) : null}
        <button
          type="button"
          onClick={props.onClose}
          disabled={props.closeBusy}
          className="mt-4 w-full rounded-full border border-white/20 bg-transparent py-3 sam-text-body font-semibold text-white/90 disabled:opacity-40"
        >
          {props.closeBusy ? t("cm_ui_ending_call") : t("nav_close")}
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
