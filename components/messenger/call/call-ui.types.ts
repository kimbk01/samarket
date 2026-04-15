import type { ReactNode } from "react";

export type CallMode = "voice" | "video";
export type CallDirection = "outgoing" | "incoming";
export type CallPhase =
  | "ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "declined"
  | "missed"
  | "failed";

export type MediaState = {
  micEnabled: boolean;
  speakerEnabled: boolean;
  cameraEnabled: boolean;
  localVideoMinimized: boolean;
};

export type CallActionIcon =
  | "speaker"
  | "video"
  | "video-off"
  | "mic"
  | "end"
  | "accept"
  | "decline"
  | "camera-switch"
  | "camera"
  | "message"
  | "close"
  | "retry"
  | "back";

export type CallActionItem = {
  id: string;
  label: string;
  icon: CallActionIcon;
  tone?: "default" | "danger" | "accept";
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export type CallScreenViewModel = {
  mode: CallMode;
  direction: CallDirection;
  phase: CallPhase;
  peerLabel: string;
  peerAvatarUrl?: string | null;
  statusText: string;
  subStatusText?: string | null;
  topLabel?: string | null;
  /** 영상 통화 중 「음성 통화」 등 헤더 칩 탭 */
  onTopLabelClick?: (() => void) | null;
  footerNote?: string | null;
  connectionLabel?: string | null;
  connectedAt?: number | null;
  endedAt?: number | null;
  endedDurationSeconds?: number | null;
  mediaState: MediaState;
  onBack?: (() => void) | null;
  primaryActions: CallActionItem[];
  secondaryActions?: CallActionItem[];
  mainVideoSlot?: ReactNode;
  miniVideoSlot?: ReactNode;
  showRemoteVideo?: boolean;
  showLocalVideo?: boolean;
  participantsSummary?: string | null;
  autoCloseMs?: number | null;
};
