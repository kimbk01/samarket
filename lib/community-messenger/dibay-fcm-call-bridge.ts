"use client";

import {
  normalizeDibayBridgeCallEvent,
  type NormalizedFcmTerminalDispatch,
} from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import {
  clearCallPendingRoute,
  DIBAY_CALL_PENDING_ROUTE_KEY,
  readCallPendingRoute,
  writeCallPendingRoute,
} from "@/lib/call/routing/pending-call-route";

/** Android FCM → legacy 통화 수신 경로 어댑터 (OAuth/chat pending key 와 분리) */
export { DIBAY_CALL_PENDING_ROUTE_KEY };
export type { NormalizedFcmTerminalDispatch };

export type DibayFcmIncomingWakeDetail = {
  sessionId?: string;
  callKind?: "voice" | "video";
  roomId?: string;
  callerId?: string;
  callerName?: string;
  callerAvatarUrl?: string;
};

type DibayFcmCallBridgeHandlers = {
  onIncomingWake: (detail: DibayFcmIncomingWakeDetail) => void;
  /** FCM terminal — `call_terminal` · `call_canceled` 단일 경로 */
  onFcmTerminal: (detail: NormalizedFcmTerminalDispatch) => void;
  /** Android native foreground incoming pill visibility */
  onForegroundIncomingUi?: (detail: { sessionId: string; visible: boolean }) => void;
};

export function writeDibayCallPendingRoute(path: string): void {
  writeCallPendingRoute(path);
}

export function readDibayCallPendingRoute(): string | null {
  return readCallPendingRoute()?.path ?? null;
}

export function clearDibayCallPendingRoute(): void {
  clearCallPendingRoute();
}

function dispatchFcmTerminal(
  detail: { type?: string; sessionId?: string; status?: string },
  bridgeSource: NormalizedFcmTerminalDispatch["bridgeSource"],
  handlers: DibayFcmCallBridgeHandlers
): void {
  const normalized = normalizeDibayBridgeCallEvent(detail);
  if (normalized.action !== "terminal") return;
  handlers.onFcmTerminal({
    callId: normalized.callId,
    terminalKind: normalized.terminalKind,
    fcmType: normalized.fcmType,
    bridgeSource,
  });
}

/** `dibay:call-event` · `dibay:call-route` → legacy incoming wake / cancel / pending route */
export function installDibayFcmCallBridge(handlers: DibayFcmCallBridgeHandlers): () => void {
  if (typeof window === "undefined") return () => {};

  const onCallEvent = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as
      | {
          type?: string;
          sessionId?: string;
          callKind?: string;
          roomId?: string;
          callerId?: string;
          callerName?: string;
          callerAvatarUrl?: string;
          status?: string;
          visible?: boolean;
        }
      | undefined;
    if (!detail) return;
    if (detail.type === "foreground_incoming_ui") {
      const sessionId = detail.sessionId?.trim() ?? "";
      handlers.onForegroundIncomingUi?.({
        sessionId,
        visible: detail.visible !== false,
      });
      return;
    }
    if (detail.type === "incoming_call") {
      const callKind =
        detail.callKind === "video"
          ? "video"
          : detail.callKind === "voice" || detail.callKind === "audio"
            ? "voice"
            : undefined;
      handlers.onIncomingWake({
        sessionId: detail.sessionId?.trim() || undefined,
        callKind,
        roomId: detail.roomId?.trim() || undefined,
        callerId: detail.callerId?.trim() || undefined,
        callerName: detail.callerName?.trim() || undefined,
        callerAvatarUrl: detail.callerAvatarUrl?.trim() || undefined,
      });
      return;
    }
    if (detail.type === "call_terminal") {
      dispatchFcmTerminal(detail, "call_terminal", handlers);
      return;
    }
    if (detail.type === "call_canceled") {
      dispatchFcmTerminal(detail, "call_canceled", handlers);
    }
  };

  const onCallRoute = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as { path?: string } | undefined;
    const path = detail?.path?.trim();
    if (path?.startsWith("/")) writeDibayCallPendingRoute(path);
  };

  window.addEventListener("dibay:call-event", onCallEvent);
  window.addEventListener("dibay:call-route", onCallRoute);
  return () => {
    window.removeEventListener("dibay:call-event", onCallEvent);
    window.removeEventListener("dibay:call-route", onCallRoute);
  };
}
