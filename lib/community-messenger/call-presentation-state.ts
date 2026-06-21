import type {
  CallDirection,
  CallMode,
  CallPhase,
} from "@/components/messenger/call/call-ui.types";

export type CallPresentationLayout =
  | "incomingRing"
  | "outgoingVoiceRing"
  | "voiceUnified"
  | "videoAvatarBridge"
  | "videoConnected"
  | "terminal";

export type CallPresentationShellSurface =
  | "videoBlack"
  | "telegramSolid"
  | "outgoingVoiceRing"
  | "starbucks"
  | "default";

export type CallPresentationState = {
  layout: CallPresentationLayout;
  shellSurface: CallPresentationShellSurface;
  showAvatarHero: boolean;
  showMainVideoLayer: boolean;
  mountMainVideoSlot: boolean;
  showPipChrome: boolean;
  showCameraPreparingOverlay: boolean;
};

export type CallPresentationInput = {
  mode: CallMode;
  direction: CallDirection;
  phase: CallPhase;
  showRemoteVideo?: boolean;
  pipShellMounted?: boolean;
  showLocalVideo?: boolean;
  hasMainVideoSlot?: boolean;
  visualTheme?: "starbucks";
};

const TERMINAL_PHASES: readonly CallPhase[] = ["ended", "declined", "missed", "failed"];

function isTerminalPhase(phase: CallPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

function isPreRemoteVideoPhase(phase: CallPhase): boolean {
  return phase === "ringing" || phase === "connecting" || phase === "reconnecting";
}

/** CallScreen presentation SSOT — 통신·join 로직과 분리된 UI-only 규칙 */
export function resolveCallPresentationState(input: CallPresentationInput): CallPresentationState {
  const {
    mode,
    direction,
    phase,
    showRemoteVideo = false,
    showLocalVideo = false,
    hasMainVideoSlot = false,
    visualTheme,
  } = input;

  const base = {
    mountMainVideoSlot: hasMainVideoSlot,
    showCameraPreparingOverlay: false,
  } satisfies Pick<
    CallPresentationState,
    "mountMainVideoSlot" | "showCameraPreparingOverlay"
  >;

  if (isTerminalPhase(phase)) {
    return {
      ...base,
      layout: "terminal",
      shellSurface: visualTheme === "starbucks" ? "starbucks" : "default",
      showAvatarHero: false,
      showMainVideoLayer: false,
      showPipChrome: false,
    };
  }

  if (direction === "incoming" && phase === "ringing") {
    return {
      ...base,
      layout: "incomingRing",
      shellSurface: "telegramSolid",
      showAvatarHero: mode === "video",
      showMainVideoLayer: false,
      showPipChrome: false,
    };
  }

  /** 발신 음성 — 벨·연결 중·재연결까지 동일 셸(카톡/텔레그램: ringing→connecting 전환 시 화면 유지) */
  if (
    direction === "outgoing" &&
    mode === "voice" &&
    (phase === "ringing" || phase === "connecting" || phase === "reconnecting")
  ) {
    return {
      ...base,
      layout: "outgoingVoiceRing",
      shellSurface: "outgoingVoiceRing",
      showAvatarHero: false,
      showMainVideoLayer: false,
      showPipChrome: false,
    };
  }

  if (mode === "voice") {
    return {
      ...base,
      layout: "voiceUnified",
      shellSurface: visualTheme === "starbucks" ? "starbucks" : "default",
      showAvatarHero: false,
      showMainVideoLayer: false,
      showPipChrome: false,
    };
  }

  const showMainVideoLayer = phase === "connected" && showRemoteVideo;
  const showAvatarHero = isPreRemoteVideoPhase(phase) && !showRemoteVideo;
  const layout: CallPresentationLayout = showMainVideoLayer ? "videoConnected" : "videoAvatarBridge";
  const shellSurface: CallPresentationShellSurface = showMainVideoLayer
    ? "videoBlack"
    : visualTheme === "starbucks"
      ? "starbucks"
      : direction === "incoming" && isPreRemoteVideoPhase(phase)
        ? "telegramSolid"
        : "default";
  /** PiP-first·connected local — `call-video-layout` 가 `showLocalVideo` 를 계산, 수신 벨만 PiP 금지 */
  const showPipChrome =
    Boolean(showLocalVideo) && !(direction === "incoming" && phase === "ringing");

  return {
    ...base,
    layout,
    shellSurface,
    showAvatarHero,
    showMainVideoLayer,
    showPipChrome,
  };
}
