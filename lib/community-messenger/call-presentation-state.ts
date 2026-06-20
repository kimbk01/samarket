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

  if (direction === "outgoing" && phase === "ringing" && mode === "voice") {
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

  return {
    ...base,
    layout,
    shellSurface,
    showAvatarHero,
    showMainVideoLayer,
    showPipChrome: phase === "connected" && showLocalVideo,
  };
}
