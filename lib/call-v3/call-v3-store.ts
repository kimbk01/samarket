"use client";

import { create } from "zustand";
import type { CallV3Context, CallV3Effect, CallV3Event } from "@/lib/call-v3/call-v3-types";
import { INITIAL_CALL_V3_CONTEXT } from "@/lib/call-v3/call-v3-types";
import {
  transitionCallState,
  transitionCallStateAfterPatchOk,
} from "@/lib/call-v3/call-v3-state-machine";
import { runCallV3MediaCleanup } from "@/lib/call-v3/call-v3-cleanup";
import { callV3FetchAgoraConnection, callV3SendRemoteEnd } from "@/lib/call-v3/call-v3-api";
import { callV3AgoraJoin } from "@/lib/call-v3/call-v3-agora";
import {
  navigateBackFromCallV3,
  navigateToCallV3Session,
  runCallV3PatchEffect,
  startCallV3Ring,
  stopCallV3Ring,
} from "@/lib/call-v3/call-v3-navigation";
import { requestCloseMessengerCallNotifications } from "@/lib/push/push-manager";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type CallV3Store = {
  ctx: CallV3Context;
  router: AppRouterInstance | null;
  setRouter: (router: AppRouterInstance) => void;
  dispatch: (event: CallV3Event) => void;
};

let patchInFlight = false;
let missedTimerId: ReturnType<typeof setTimeout> | null = null;

function clearCallV3MissedTimer(): void {
  if (missedTimerId != null) {
    clearTimeout(missedTimerId);
    missedTimerId = null;
  }
}

function scheduleCallV3MissedTimer(
  sessionId: string | null,
  dispatch: (event: CallV3Event) => void
): void {
  clearCallV3MissedTimer();
  if (!sessionId) return;
  missedTimerId = setTimeout(() => {
    const cur = useCallV3Store.getState().ctx;
    if (cur.sessionId !== sessionId || cur.terminalConsumed) return;
    if (cur.state === "incoming" || cur.state === "outgoing") {
      dispatch({ type: "CALL_TIMEOUT" });
    }
  }, 30_000);
}

async function runEffects(
  effects: CallV3Effect[],
  ctx: CallV3Context,
  router: AppRouterInstance | null,
  getDispatch: () => (event: CallV3Event) => void
): Promise<void> {
  const dispatch = getDispatch();
  for (const effect of effects) {
    switch (effect.type) {
      case "START_RING":
        startCallV3Ring(ctx.role === "callee" ? "incoming" : "outgoing", ctx.kind);
        break;
      case "STOP_RING":
        stopCallV3Ring();
        break;
      case "START_MISSED_TIMER":
        scheduleCallV3MissedTimer(ctx.sessionId, dispatch);
        break;
      case "STOP_MISSED_TIMER":
        clearCallV3MissedTimer();
        break;
      case "DISMISS_NOTIFICATION":
        if (ctx.sessionId) requestCloseMessengerCallNotifications(ctx.sessionId);
        break;
      case "NAVIGATE_TO_CALL":
        if (ctx.sessionId && router) navigateToCallV3Session(router, ctx.sessionId);
        break;
      case "NAVIGATE_BACK":
        if (router) navigateBackFromCallV3(router, ctx.roomId);
        break;
      case "PATCH_ACCEPT":
      case "PATCH_REJECT":
      case "PATCH_END":
      case "PATCH_CANCEL":
      case "PATCH_MISSED": {
        if (!ctx.sessionId || patchInFlight) break;
        patchInFlight = true;
        try {
          const ok = await runCallV3PatchEffect(effect.type, ctx.sessionId, ctx.peerUserId);
          if (
            ok &&
            (effect.type === "PATCH_END" ||
              effect.type === "PATCH_CANCEL" ||
              effect.type === "PATCH_REJECT" ||
              effect.type === "PATCH_MISSED")
          ) {
            const store = useCallV3Store.getState();
            const after = transitionCallStateAfterPatchOk(store.ctx);
            useCallV3Store.setState({ ctx: after.ctx });
            await runEffects(after.effects, after.ctx, router, () => useCallV3Store.getState().dispatch);
          }
        } finally {
          patchInFlight = false;
        }
        break;
      }
      case "SEND_HANGUP_SIGNAL":
        if (ctx.sessionId && ctx.peerUserId?.trim()) {
          await callV3SendRemoteEnd({
            sessionId: ctx.sessionId,
            toUserId: ctx.peerUserId.trim(),
            reason: effect.reason ?? "end",
          });
        }
        break;
      case "AGORA_JOIN":
        if (!ctx.sessionId) break;
        {
          const tokenRes = await callV3FetchAgoraConnection(ctx.sessionId);
          if (!tokenRes.ok || !tokenRes.connection) break;
          dispatch({ type: "CALL_JOIN_START" });
          try {
            await callV3AgoraJoin({
              sessionId: ctx.sessionId,
              kind: ctx.kind,
              connection: tokenRes.connection,
              onRemoteUserPublished: () => dispatch({ type: "CALL_REMOTE_JOINED" }),
            });
            dispatch({ type: "CALL_JOINED" });
          } catch {
            /* join failed */
          }
        }
        break;
      case "AGORA_LEAVE":
        await runCallV3MediaCleanup("agora_leave", ctx.sessionId);
        break;
      case "CLEANUP_MEDIA":
        await runCallV3MediaCleanup("cleanup", ctx.sessionId);
        break;
      default:
        break;
    }
  }
}

export const useCallV3Store = create<CallV3Store>((set, get) => ({
  ctx: INITIAL_CALL_V3_CONTEXT,
  router: null,
  setRouter: (router) => set({ router }),
  dispatch: (event) => {
    const { ctx, router } = get();
    const result = transitionCallState(ctx, event);
    if (result.ignored) return;
    set({ ctx: result.ctx });
    void runEffects(result.effects, result.ctx, router, () => get().dispatch);
  },
}));

export function dispatchCallV3StoreEvent(event: CallV3Event): void {
  useCallV3Store.getState().dispatch(event);
}

export function getCallV3Context(): CallV3Context {
  return useCallV3Store.getState().ctx;
}

export function subscribeCallV3Context(listener: (ctx: CallV3Context) => void): () => void {
  return useCallV3Store.subscribe((state) => {
    listener(state.ctx);
  });
}
