"use client";

import {
  clearCallPendingRoute,
  DIBAY_CALL_PENDING_ROUTE_KEY,
  readCallPendingRoute,
  writeCallPendingRoute,
} from "@/lib/call/routing/pending-call-route";

/** Android FCM → legacy 통화 수신 경로 어댑터 (OAuth/chat pending key 와 분리) */
export { DIBAY_CALL_PENDING_ROUTE_KEY };

export type DibayFcmIncomingWakeDetail = {
  sessionId?: string;
  callKind?: "voice" | "video";
  roomId?: string;
  callerId?: string;
  callerName?: string;
};

type DibayFcmCallBridgeHandlers = {
  onIncomingWake: (detail: DibayFcmIncomingWakeDetail) => void;
  onCanceled: (sessionId: string) => void;
  onTerminal?: (detail: { sessionId: string; status?: string }) => void;
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
          status?: string;
        }
      | undefined;
    if (!detail) return;
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
      });
      return;
    }
    if (detail.type === "call_terminal") {
      const sessionId = detail.sessionId?.trim();
      if (sessionId) {
        handlers.onTerminal?.({ sessionId, status: detail.status?.trim() || "cancelled" });
      }
      return;
    }
    if (detail.type === "call_canceled") {
      const sessionId = detail.sessionId?.trim();
      if (sessionId) handlers.onCanceled(sessionId);
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
