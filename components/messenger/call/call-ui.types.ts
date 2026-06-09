import type { CSSProperties, PointerEventHandler, ReactNode, RefObject } from "react";

/** 카카오톡식 영상통화: PiP 우하단 기본, 드래그로 이동, 짧은 탭으로 메인↔PiP 스왑 */
export type VideoCallPipLayoutBindings = {
  stageRef: RefObject<HTMLDivElement | null>;
  pipRef: RefObject<HTMLDivElement | null>;
  onPipPointerDown: PointerEventHandler<HTMLDivElement>;
  onPipPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPipPointerUp: PointerEventHandler<HTMLDivElement>;
  onPipPointerCancel: PointerEventHandler<HTMLDivElement>;
  /** PiP 안에 표시되는 사람(작은 쪽이 나/상대) */
  pipLabel: string;
  /** 스테이지 기준 `left`/`top`(px); 없으면 우하단 CSS */
  pipPixelStyle?: CSSProperties | null;
};

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
  /** 메인 영상 ↔ PiP 교체(텔레그램 PiP 탭과 동일 동작의 명시 버튼) */
  | "pip-swap"
  | "camera"
  | "message"
  | "close"
  | "retry"
  | "back"
  | "settings";

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
  /** PiP(작은 타일) 표시 — 양쪽 영상이 모두 있을 때 */
  showLocalVideo?: boolean;
  /** PiP 우하단·드래그·탭 교체 */
  videoPipLayout?: VideoCallPipLayoutBindings | null;
  participantsSummary?: string | null;
  autoCloseMs?: number | null;
  /** 영상 발신 솔로(상대 영상 전) — 상단 「사마켓 영상 통화」 브랜드 줄 숨김(텔레그램식). */
  hideOutgoingVideoBrandRow?: boolean;
  /** 벨 거절·취소 직후 `EndedCallView` 대신 ringing UI 유지(복귀 전 단일 화면). */
  suppressTerminalView?: boolean;
};
