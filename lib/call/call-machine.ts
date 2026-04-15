"use client";

/**
 * Call state machine (UI/controller-level) for SAMarket messenger calls.
 *
 * - DB 원장(`community_messenger_call_sessions.status`)과 1:1 매핑이 아니라,
 *   권한/협상/WebRTC 수명주기까지 포함한 클라이언트 제어 상태다.
 * - 발신/수신 모두 동일 모델을 사용하고, UI는 이 상태만 보고 렌더한다.
 */

export type CallMachineState =
  | "idle"
  | "requesting_permission"
  | "calling"
  | "ringing"
  | "answering"
  | "connecting"
  | "connected"
  | "declined"
  | "canceled"
  | "missed"
  | "ended"
  | "failed";

export type CallMachineEndedReason =
  | "reject"
  | "cancel"
  | "timeout"
  | "end"
  | "webrtc_failed"
  | "permission_denied"
  | "network"
  | "unknown";

export type CallMachineRole = "caller" | "callee";

export type CallMachineContext = {
  role: CallMachineRole;
  callKind: "voice" | "video";
  /** current sessionId (when known) */
  sessionId: string | null;
  /** peer identity (best-effort for UI labels) */
  peerUserId: string | null;
  peerLabel: string;
  /** timestamps for UX/metrics */
  startedAtMs: number | null;
  connectedAtMs: number | null;
  endedReason: CallMachineEndedReason | null;
  errorCode: string | null;
};

export type CallMachineEvent =
  | { type: "ui.start"; role: CallMachineRole; callKind: "voice" | "video"; peerUserId?: string | null; peerLabel?: string | null }
  | { type: "ui.cancel" }
  | { type: "ui.accept" }
  | { type: "ui.reject" }
  | { type: "permission.granted" }
  | { type: "permission.denied"; errorCode?: string }
  | { type: "session.created"; sessionId: string }
  | { type: "session.invited" }
  | { type: "session.ringing" }
  | { type: "session.accepted" }
  | { type: "session.rejected" }
  | { type: "session.canceled" }
  | { type: "session.missed" }
  | { type: "webrtc.connecting" }
  | { type: "webrtc.connected" }
  | { type: "webrtc.failed"; errorCode?: string }
  | { type: "session.ended"; reason?: CallMachineEndedReason };

export function createInitialCallMachineContext(args: {
  role: CallMachineRole;
  callKind: "voice" | "video";
  peerUserId?: string | null;
  peerLabel?: string | null;
}): CallMachineContext {
  return {
    role: args.role,
    callKind: args.callKind,
    sessionId: null,
    peerUserId: args.peerUserId ?? null,
    peerLabel: (args.peerLabel ?? "").trim() || "상대방",
    startedAtMs: null,
    connectedAtMs: null,
    endedReason: null,
    errorCode: null,
  };
}

function endWith(
  state: CallMachineState,
  ctx: CallMachineContext,
  nextState: CallMachineState,
  reason: CallMachineEndedReason,
  errorCode?: string
): { state: CallMachineState; context: CallMachineContext } {
  return {
    state: nextState,
    context: {
      ...ctx,
      endedReason: reason,
      errorCode: errorCode ?? ctx.errorCode,
      connectedAtMs: nextState === "connected" ? (ctx.connectedAtMs ?? Date.now()) : ctx.connectedAtMs,
    },
  };
}

export function reduceCallMachine(
  state: CallMachineState,
  context: CallMachineContext,
  event: CallMachineEvent
): { state: CallMachineState; context: CallMachineContext } {
  const ctx = context;
  switch (event.type) {
    case "ui.start": {
      const nextCtx = createInitialCallMachineContext({
        role: event.role,
        callKind: event.callKind,
        peerUserId: event.peerUserId ?? null,
        peerLabel: event.peerLabel ?? null,
      });
      return { state: "requesting_permission", context: nextCtx };
    }
    case "permission.granted": {
      if (state !== "requesting_permission") return { state, context: ctx };
      return {
        state: ctx.role === "caller" ? "calling" : "answering",
        context: { ...ctx, startedAtMs: ctx.startedAtMs ?? Date.now(), endedReason: null, errorCode: null },
      };
    }
    case "permission.denied": {
      return endWith(state, ctx, "failed", "permission_denied", event.errorCode);
    }
    case "session.created": {
      return { state, context: { ...ctx, sessionId: event.sessionId } };
    }
    case "session.invited":
    case "session.ringing": {
      if (ctx.role === "caller") return { state: "ringing", context: ctx };
      return { state, context: ctx };
    }
    case "ui.cancel":
    case "session.canceled": {
      return endWith(state, ctx, "canceled", "cancel");
    }
    case "ui.reject":
    case "session.rejected": {
      return endWith(state, ctx, "declined", "reject");
    }
    case "session.missed": {
      return endWith(state, ctx, "missed", "timeout");
    }
    case "ui.accept":
    case "session.accepted": {
      return { state: "connecting", context: { ...ctx, endedReason: null, errorCode: null } };
    }
    case "webrtc.connecting": {
      return { state: "connecting", context: ctx };
    }
    case "webrtc.connected": {
      return { state: "connected", context: { ...ctx, connectedAtMs: ctx.connectedAtMs ?? Date.now() } };
    }
    case "webrtc.failed": {
      return endWith(state, ctx, "failed", "webrtc_failed", event.errorCode);
    }
    case "session.ended": {
      return endWith(state, ctx, "ended", event.reason ?? "end");
    }
    default:
      return { state, context: ctx };
  }
}

export function callMachineStateLabel(state: CallMachineState, ctx: CallMachineContext): string {
  switch (state) {
    case "idle":
      return "";
    case "requesting_permission":
      return ctx.callKind === "video" ? "카메라/마이크 확인 중" : "마이크 확인 중";
    case "calling":
      return "통화 준비 중";
    case "ringing":
      return ctx.role === "caller" ? "상대방에게 거는 중" : "수신 전화";
    case "answering":
      return "받는 중";
    case "connecting":
      return "연결 중";
    case "connected":
      return "통화 중";
    case "declined":
      return "거절됨";
    case "canceled":
      return "취소됨";
    case "missed":
      return "부재중 알림";
    case "ended":
      return "통화 종료";
    case "failed":
      return "연결 실패";
    default:
      return "";
  }
}

