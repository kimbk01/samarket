"use client";

import { create } from "zustand";
import type { CallContext, CallEffect, CallEvent } from "@/lib/call/call-types";
import { INITIAL_CALL_CONTEXT } from "@/lib/call/call-types";
import { transitionCallState, transitionCallStateAfterPatchOk } from "@/lib/call/call-state-machine";
import { runCallMediaCleanup } from "@/lib/call/call-cleanup";
import { callFetchAgoraConnection, callSendRemoteEnd } from "@/lib/call/call-api";
import { callAgoraJoin } from "@/lib/call/call-agora";
import {
  navigateBackFromCall,
  navigateToCallSession,
  runCallPatchEffect,
  startCallRing,
  stopCallRing,
} from "@/lib/call/call-navigation";
import { requestCloseMessengerCallNotifications } from "@/lib/push/push-manager";
import { logCall } from "@/lib/call/call-log";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type CallStore = {
  ctx: CallContext;
  router: AppRouterInstance | null;
  setRouter: (router: AppRouterInstance) => void;
  dispatch: (event: CallEvent) => void;
};

let patchInFlight = false;
let missedTimerId: ReturnType<typeof setTimeout> | null = null;

function clearCallMissedTimer(): void {
  if (missedTimerId != null) {
    clearTimeout(missedTimerId);
    missedTimerId = null;
  }
}

function scheduleCallMissedTimer(sessionId: string | null, dispatch: (event: CallEvent) => void): void {
  clearCallMissedTimer();
  if (!sessionId) return;
  missedTimerId = setTimeout(() => {
    const cur = useCallStore.getState().ctx;
    if (cur.sessionId !== sessionId || cur.terminalConsumed) return;
    if (cur.state === "incoming" || cur.state === "outgoing") {
      dispatch({ type: "CALL_TIMEOUT" });
    }
  }, 30_000);
}

async function runEffects(
  effects: CallEffect[],
  ctx: CallContext,
  router: AppRouterInstance | null,
  getDispatch: () => (event: CallEvent) => void
): Promise<void> {
  const dispatch = getDispatch();
  for (const effect of effects) {
    switch (effect.type) {
      case "START_RING":
        startCallRing(ctx.role === "callee" ? "incoming" : "outgoing", ctx.kind);
        break;
      case "STOP_RING":
        stopCallRing();
        break;
      case "START_MISSED_TIMER":
        scheduleCallMissedTimer(ctx.sessionId, dispatch);
        break;
      case "STOP_MISSED_TIMER":
        clearCallMissedTimer();
        break;
      case "DISMISS_NOTIFICATION":
        if (ctx.sessionId) requestCloseMessengerCallNotifications(ctx.sessionId);
        break;
      case "NAVIGATE_TO_CALL":
        if (ctx.sessionId && router) navigateToCallSession(router, ctx.sessionId);
        break;
      case "NAVIGATE_BACK":
        if (router) navigateBackFromCall(router, ctx.roomId);
        break;
      case "PATCH_ACCEPT":
      case "PATCH_REJECT":
      case "PATCH_END":
      case "PATCH_CANCEL":
      case "PATCH_MISSED": {
        if (!ctx.sessionId || patchInFlight) break;
        patchInFlight = true;
        try {
          const ok = await runCallPatchEffect(effect.type, ctx.sessionId, ctx.peerUserId);
          if (
            ok &&
            (effect.type === "PATCH_END" ||
              effect.type === "PATCH_CANCEL" ||
              effect.type === "PATCH_REJECT" ||
              effect.type === "PATCH_MISSED")
          ) {
            const store = useCallStore.getState();
            const after = transitionCallStateAfterPatchOk(store.ctx);
            useCallStore.setState({ ctx: after.ctx });
            await runEffects(after.effects, after.ctx, router, () => useCallStore.getState().dispatch);
          }
        } finally {
          patchInFlight = false;
        }
        break;
      }
      case "SEND_HANGUP_SIGNAL":
        if (ctx.sessionId && ctx.peerUserId?.trim()) {
          await callSendRemoteEnd({
            sessionId: ctx.sessionId,
            toUserId: ctx.peerUserId.trim(),
            reason: effect.reason ?? "end",
          });
        }
        break;
      case "AGORA_JOIN":
        if (!ctx.sessionId) break;
        {
          const tokenRes = await callFetchAgoraConnection(ctx.sessionId);
          if (!tokenRes.ok || !tokenRes.connection) {
            logCall("agora", "join_token_failed", { sessionId: ctx.sessionId });
            dispatch({ type: "CALL_JOIN_FAILED" });
            break;
          }
          dispatch({ type: "CALL_JOIN_START" });
          try {
            await callAgoraJoin({
              sessionId: ctx.sessionId,
              kind: ctx.kind,
              connection: tokenRes.connection,
              onRemoteUserPublished: () => dispatch({ type: "CALL_REMOTE_JOINED" }),
            });
            dispatch({ type: "CALL_JOINED" });
            logCall("agora", "join_ok", { sessionId: ctx.sessionId });
          } catch {
            logCall("agora", "join_failed", { sessionId: ctx.sessionId });
            dispatch({ type: "CALL_JOIN_FAILED" });
          }
        }
        break;
      case "AGORA_LEAVE":
        await runCallMediaCleanup("agora_leave", ctx.sessionId);
        break;
      case "CLEANUP_MEDIA":
        await runCallMediaCleanup("cleanup", ctx.sessionId);
        break;
      default:
        break;
    }
  }
}

export const useCallStore = create<CallStore>((set, get) => ({
  ctx: INITIAL_CALL_CONTEXT,
  router: null,
  setRouter: (router) => set({ router }),
  dispatch: (event) => {
    const { ctx, router } = get();
    const result = transitionCallState(ctx, event);
    if (result.ignored) return;
    logCall("state", "transition", { from: ctx.state, event: event.type, to: result.ctx.state });
    set({ ctx: result.ctx });
    void runEffects(result.effects, result.ctx, router, () => get().dispatch);
  },
}));

export function dispatchCallStoreEvent(event: CallEvent): void {
  useCallStore.getState().dispatch(event);
}

export function getCallContext(): CallContext {
  return useCallStore.getState().ctx;
}

export function subscribeCallContext(listener: (ctx: CallContext) => void): () => void {
  return useCallStore.subscribe((state) => {
    listener(state.ctx);
  });
}
