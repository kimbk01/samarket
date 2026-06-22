import type { CSSProperties, PointerEventHandler, ReactNode, RefObject } from "react";
import type { CallPipCorner, CallVideoPipPositionMode } from "@/lib/community-messenger/call-pip-metrics";

/** 카카오톡/텔레그램/바이버식 영상통화: PiP 4모서리 스냅, 드래그, 탭 스왑·더블탭 확대 — 세로 self view (3:4) */
export type VideoCallPipLayoutBindings = {
  stageRef: RefObject<HTMLDivElement | null>;
  pipRef: RefObject<HTMLDivElement | null>;
  onPipPointerDown: PointerEventHandler<HTMLDivElement>;
  onPipPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPipPointerUp: PointerEventHandler<HTMLDivElement>;
  onPipPointerCancel: PointerEventHandler<HTMLDivElement>;
  /** PiP 안에 표시되는 사람(작은 쪽이 나/상대) */
  pipLabel: string;
  /** 앵커 기준 `left`/`top`/`width`/`height` */
  pipStyle?: CSSProperties | null;
  corner?: CallPipCorner;
  positionMode?: CallVideoPipPositionMode;
  widthPx?: number;
  heightPx?: number;
  micMuted?: boolean;
  cameraOff?: boolean;
  onPipExpand?: () => void;
};

export type CallMode = "voice" | "video";
export type CallDirection = "outgoing" | "incoming";
export type CallPhase =
  | "ringing"
  | "connecting"
  | "reconnecting"
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
  /** 1:1 DiBaY 통화 전용 시각 테마. 그룹 통화 등 기존 사용처는 기본 테마 유지. */
  visualTheme?: "starbucks";
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
  /** PiP(작은 타일) 표시 — 로컬 트랙 play 완료 후 */
  showLocalVideo?: boolean;
  /** PiP DOM·`smallVideoRef` — joined 직후 마운트(ready 전에도) */
  pipShellMounted?: boolean;
  /** PiP 우하단·드래그·탭 교체 */
  videoPipLayout?: VideoCallPipLayoutBindings | null;
  participantsSummary?: string | null;
  autoCloseMs?: number | null;
  /** 영상 발신 솔로(상대 영상 전) — 상단 「사마켓 영상 통화」 브랜드 줄 숨김(텔레그램식). */
  hideOutgoingVideoBrandRow?: boolean;
  /** PiP-first 발신 pre-remote — 메인에 상대 아바타·대기 UI */
  pipFirstOutgoingMainPlaceholder?: boolean;
  /** 벨 거절·취소 직후 `EndedCallView` 대신 ringing UI 유지(복귀 전 단일 화면). */
  suppressTerminalView?: boolean;
  /** Android OS PiP — WebView 축소 시 최소 chrome (presentation only) */
  androidOsPipSafeMode?: boolean;
};
