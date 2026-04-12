/**
 * 1:1 통화 UI·계측용 단일 상태 — WebRTC transport와 패널(발신/수신/연결)을 합성한다.
 * DB `CommunityMessengerCallSessionStatus` 와 1:1이 아니며, 클라이언트 표시용이다.
 */

export type CallSessionPanelMode = "dialing" | "incoming" | "connecting" | "active";

export type CallSessionTransportState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

/** 계획서 8상태 — 발신/수신 구분은 `context.direction` */
export type CallSessionPhase =
  | "idle"
  | "ringing"
  | "accepted"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

export type CallSessionPhaseContext = {
  /** UI 라벨용 — ringing 세분화 */
  direction: "incoming" | "outgoing" | null;
  /** 자동 ICE 재시도 누적(타이머에서 증가한 값) */
  autoRetryAttempt: number;
};

export type CallSessionPhaseInput = {
  panel: { mode: CallSessionPanelMode } | null;
  transportState: CallSessionTransportState;
  busy: string | null;
  autoRetryAttempt: number;
};

const MAX_AUTO_ICE_RETRY = 2;

/**
 * 레거시 `useCommunityMessengerCall` 의 panel + transportState 를 단일 phase 로 합성한다.
 *
 * - `accepted`: 세션은 수락됐으나 아직 미디어 경로 협상 중(패널 connecting + transport 아직 connected 아님)에 가깝게 매핑
 * - `ended`: 이 훅만으로는 구분 불가 → 항상 `idle`; 종료 사유는 `errorMessage`/토스트로 처리
 */
export function deriveCallSessionPhase(input: CallSessionPhaseInput): {
  phase: CallSessionPhase;
  context: CallSessionPhaseContext;
} {
  const { panel, transportState, busy, autoRetryAttempt } = input;

  if (!panel) {
    return {
      phase: "idle",
      context: { direction: null, autoRetryAttempt },
    };
  }

  const direction: "incoming" | "outgoing" | null =
    panel.mode === "incoming" ? "incoming" : panel.mode === "dialing" ? "outgoing" : null;

  if (panel.mode === "dialing" || panel.mode === "incoming") {
    return {
      phase: "ringing",
      context: { direction, autoRetryAttempt },
    };
  }

  const reconnecting =
    busy === "call-retry" ||
    transportState === "disconnected" ||
    (transportState === "failed" && autoRetryAttempt < MAX_AUTO_ICE_RETRY);

  if (reconnecting) {
    return {
      phase: "reconnecting",
      context: { direction, autoRetryAttempt },
    };
  }

  if (transportState === "failed" && autoRetryAttempt >= MAX_AUTO_ICE_RETRY) {
    return {
      phase: "failed",
      context: { direction, autoRetryAttempt },
    };
  }

  if (panel.mode === "connecting") {
    if (transportState === "idle") {
      return {
        phase: "accepted",
        context: { direction, autoRetryAttempt },
      };
    }
    return {
      phase: "connecting",
      context: { direction, autoRetryAttempt },
    };
  }

  if (panel.mode === "active") {
    if (transportState === "connected") {
      return {
        phase: "connected",
        context: { direction, autoRetryAttempt },
      };
    }
    if (transportState === "connecting" || transportState === "idle") {
      return {
        phase: "connecting",
        context: { direction, autoRetryAttempt },
      };
    }
  }

  return {
    phase: "connecting",
    context: { direction, autoRetryAttempt },
  };
}

/** 배지·헤더 문구 — i18n 붙이기 전 한국어 기본 */
export function callSessionPhaseLabel(phase: CallSessionPhase, direction?: "incoming" | "outgoing" | null): string {
  if (phase === "ringing") {
    return direction === "incoming" ? "수신 전화" : "상대방에게 거는 중";
  }
  switch (phase) {
    case "idle":
      return "";
    case "accepted":
      return "연결 준비 중";
    case "connecting":
      return "연결 중";
    case "connected":
      return "통화 중";
    case "reconnecting":
      return "재연결 중";
    case "ended":
      return "통화 종료";
    case "failed":
      return "연결 실패";
    default:
      return "";
  }
}
