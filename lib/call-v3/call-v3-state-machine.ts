import type {
  CallV3Context,
  CallV3Effect,
  CallV3Event,
  CallV3IncomingPayload,
  CallV3State,
} from "@/lib/call-v3/call-v3-types";
import {
  INITIAL_CALL_V3_CONTEXT,
  isCallV3LiveState,
  isCallV3TerminalState,
} from "@/lib/call-v3/call-v3-types";

export type CallV3TransitionResult = {
  ctx: CallV3Context;
  effects: CallV3Effect[];
  ignored?: boolean;
};

function withIncoming(ctx: CallV3Context, payload: CallV3IncomingPayload): CallV3Context {
  return {
    ...ctx,
    state: "incoming",
    sessionId: payload.sessionId,
    roomId: payload.roomId,
    role: "callee",
    kind: payload.callKind,
    peerUserId: payload.peerUserId,
    peerLabel: payload.peerLabel,
    peerAvatarUrl: payload.peerAvatarUrl ?? null,
    dbSession: payload.session ?? ctx.dbSession,
    localJoined: false,
    remoteJoined: false,
    terminalConsumed: false,
    startedAt: payload.startedAt ?? payload.session?.startedAt ?? ctx.startedAt,
  };
}

function sessionMatches(ctx: CallV3Context, sessionId: string | null | undefined): boolean {
  const sid = sessionId?.trim();
  if (!sid || !ctx.sessionId) return false;
  return ctx.sessionId === sid;
}

function isStaleRemoteEnd(payload: { sessionId: string; senderId: string | null; reason?: string | null }): boolean {
  const senderId = payload.senderId?.trim();
  if (!senderId) return true;
  const reason = payload.reason?.trim().toLowerCase();
  if (!senderId && reason === "ended") return true;
  return false;
}

function terminalEffects(ctx: CallV3Context, patch: "end" | "cancel" | "reject" | "missed"): CallV3Effect[] {
  const effects: CallV3Effect[] = [
    { type: "STOP_RING" },
    { type: "STOP_MISSED_TIMER" },
    { type: "DISMISS_NOTIFICATION" },
  ];
  if (patch === "end") effects.push({ type: "PATCH_END" }, { type: "SEND_HANGUP_SIGNAL", reason: "end" });
  if (patch === "cancel") effects.push({ type: "PATCH_CANCEL" }, { type: "SEND_HANGUP_SIGNAL", reason: "cancel" });
  if (patch === "reject") effects.push({ type: "PATCH_REJECT" }, { type: "SEND_HANGUP_SIGNAL", reason: "reject" });
  if (patch === "missed") effects.push({ type: "PATCH_MISSED" });
  if (ctx.localJoined || ctx.state === "active" || ctx.state === "connecting") {
    effects.push({ type: "AGORA_LEAVE" });
  }
  return effects;
}

/**
 * 유일한 상태 전이 진입점 — 모든 call-v3 상태 변경은 이 함수만 통과한다.
 */
export function transitionCallState(ctx: CallV3Context, event: CallV3Event): CallV3TransitionResult {
  const state = ctx.state;

  if (event.type === "CALL_CLEANUP_DONE") {
    if (state !== "ended" && state !== "missed" && state !== "rejected") {
      return { ctx, effects: [], ignored: true };
    }
    return {
      ctx: { ...INITIAL_CALL_V3_CONTEXT },
      effects: [{ type: "CLEANUP_MEDIA" }],
    };
  }

  if (event.type === "CALL_REMOTE_ENDED") {
    if (!sessionMatches(ctx, event.payload.sessionId) || isStaleRemoteEnd(event.payload)) {
      return { ctx, effects: [], ignored: true };
    }
    if (isCallV3TerminalState(state) || state === "ending") {
      return { ctx, effects: [], ignored: true };
    }
    return {
      ctx: { ...ctx, state: "ending", terminalConsumed: true },
      effects: [...terminalEffects(ctx, "end"), { type: "NAVIGATE_BACK" }],
    };
  }

  switch (event.type) {
    case "CALL_INCOMING": {
      if (isCallV3LiveState(state) && ctx.sessionId && ctx.sessionId !== event.payload.sessionId) {
        return { ctx, effects: [], ignored: true };
      }
      if (state === "idle" || state === "incoming") {
        return {
          ctx: withIncoming(ctx, event.payload),
          effects: [{ type: "START_RING" }, { type: "START_MISSED_TIMER" }],
        };
      }
      return { ctx, effects: [], ignored: true };
    }

    case "CALL_DIAL_START": {
      if (isCallV3LiveState(state)) {
        return { ctx, effects: [], ignored: true };
      }
      return {
        ctx: {
          ...INITIAL_CALL_V3_CONTEXT,
          state: "outgoing",
          roomId: event.payload.roomId,
          role: "caller",
          kind: event.payload.callKind,
          peerUserId: event.payload.peerUserId?.trim() || null,
          peerLabel: event.payload.peerLabel?.trim() || "",
          peerAvatarUrl: event.payload.peerAvatarUrl ?? null,
        },
        effects: [{ type: "START_RING" }],
      };
    }

    case "CALL_CREATED": {
      const session = event.payload.session;
      if (ctx.state !== "outgoing" || !ctx.roomId || ctx.roomId !== session.roomId) {
        return { ctx, effects: [], ignored: true };
      }
      return {
        ctx: {
          ...ctx,
          sessionId: session.id,
          dbSession: session,
          peerUserId: session.peerUserId,
          peerLabel: session.peerLabel || ctx.peerLabel,
          peerAvatarUrl: session.peerAvatarUrl ?? ctx.peerAvatarUrl,
          startedAt: session.startedAt,
        },
        effects: [
          { type: "NAVIGATE_TO_CALL" },
          { type: "START_MISSED_TIMER" },
        ],
      };
    }

    case "CALL_ACCEPT_CLICK": {
      if (state !== "incoming" || ctx.terminalConsumed) {
        return { ctx, effects: [], ignored: true };
      }
      return {
        ctx: { ...ctx, state: "accepting", terminalConsumed: true },
        effects: [
          { type: "STOP_RING" },
          { type: "STOP_MISSED_TIMER" },
          { type: "PATCH_ACCEPT" },
          { type: "NAVIGATE_TO_CALL" },
        ],
      };
    }

    case "CALL_ACCEPTED": {
      const session = event.payload?.session ?? ctx.dbSession;
      if (session && !sessionMatches(ctx, session.id) && ctx.sessionId) {
        return { ctx, effects: [], ignored: true };
      }
      if (state === "incoming" || state === "accepting" || state === "outgoing") {
        return {
          ctx: {
            ...ctx,
            state: "connecting",
            dbSession: session ?? ctx.dbSession,
            sessionId: session?.id ?? ctx.sessionId,
          },
          effects: [
            { type: "STOP_RING" },
            { type: "STOP_MISSED_TIMER" },
            { type: "AGORA_JOIN" },
          ],
        };
      }
      return { ctx, effects: [], ignored: true };
    }

    case "CALL_JOIN_START":
      if (state !== "connecting") return { ctx, effects: [], ignored: true };
      return { ctx, effects: [{ type: "AGORA_JOIN" }] };

    case "CALL_JOINED":
      if (state !== "connecting") return { ctx, effects: [], ignored: true };
      return { ctx: { ...ctx, localJoined: true }, effects: [] };

    case "CALL_REMOTE_JOINED":
      if (state !== "connecting" && state !== "active") return { ctx, effects: [], ignored: true };
      return {
        ctx: { ...ctx, state: "active", remoteJoined: true },
        effects: [{ type: "STOP_RING" }],
      };

    case "CALL_REMOTE_LEFT":
      if (state !== "active") return { ctx, effects: [], ignored: true };
      return {
        ctx: { ...ctx, state: "ending" },
        effects: terminalEffects(ctx, "end"),
      };

    case "CALL_END_CLICK": {
      if (!isCallV3LiveState(state) || state === "ending") {
        return { ctx, effects: [], ignored: true };
      }
      const patch: "end" | "cancel" | "reject" =
        state === "outgoing" || (state === "connecting" && ctx.role === "caller")
          ? "cancel"
          : state === "incoming"
            ? "reject"
            : "end";
      return {
        ctx: { ...ctx, state: "ending", terminalConsumed: true },
        effects: [...terminalEffects(ctx, patch), { type: "NAVIGATE_BACK" }],
      };
    }

    case "CALL_REJECTED":
      if (state !== "incoming" || ctx.terminalConsumed) {
        return { ctx, effects: [], ignored: true };
      }
      return {
        ctx: { ...ctx, state: "rejected", terminalConsumed: true },
        effects: [
          ...terminalEffects(ctx, "reject"),
          { type: "CLEANUP_MEDIA" },
          { type: "NAVIGATE_BACK" },
        ],
      };

    case "CALL_TIMEOUT":
    case "CALL_MISSED": {
      if (ctx.terminalConsumed || state !== "incoming" && state !== "outgoing") {
        return { ctx, effects: [], ignored: true };
      }
      const nextState: CallV3State = ctx.role === "caller" ? "ended" : "missed";
      const patch = ctx.role === "caller" ? "cancel" : "missed";
      return {
        ctx: { ...ctx, state: nextState, terminalConsumed: true },
        effects: [
          ...terminalEffects(ctx, patch),
          { type: "CLEANUP_MEDIA" },
          { type: "NAVIGATE_BACK" },
        ],
      };
    }

    default:
      return { ctx, effects: [], ignored: true };
  }
}

/** PATCH 완료 후 ending → ended */
export function transitionCallStateAfterPatchOk(ctx: CallV3Context): CallV3TransitionResult {
  if (ctx.state !== "ending") return { ctx, effects: [] };
  return {
    ctx: { ...ctx, state: "ended" },
    effects: [{ type: "CLEANUP_MEDIA" }],
  };
}

/** refresh GET — active→ended 덮어쓰기 금지 */
export function shouldIgnoreSessionRefreshDowngrade(
  ctx: CallV3Context,
  nextDbStatus: string | null | undefined
): boolean {
  const status = nextDbStatus?.trim();
  if (!status) return false;
  if (ctx.state === "active" || ctx.state === "connecting") {
    if (status === "ended" || status === "cancelled" || status === "rejected" || status === "missed") {
      return true;
    }
  }
  if (ctx.state === "ending" || ctx.state === "ended") {
    if (status === "active" || status === "ringing") return true;
  }
  return false;
}
