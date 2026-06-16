"use client";

import { dispatchCallEvent } from "@/lib/call/call-events";
import { logCall } from "@/lib/call/call-log";

export type CallNativeBridgeDetail = {
  type?: string;
  sessionId?: string;
  roomId?: string;
  callKind?: "voice" | "video";
  callerId?: string;
  callerName?: string;
  callerAvatarUrl?: string | null;
};

export function handleCallNativeBridgeEvent(detail: CallNativeBridgeDetail): void {
  if (detail.type === "incoming_call" && detail.sessionId && detail.roomId) {
    logCall("native", "incoming_call_event", { sessionId: detail.sessionId });
    dispatchCallEvent({
      type: "CALL_INCOMING",
      payload: {
        sessionId: detail.sessionId,
        roomId: detail.roomId,
        callKind: detail.callKind ?? "voice",
        peerUserId: detail.callerId?.trim() || "",
        peerLabel: detail.callerName?.trim() || "",
        peerAvatarUrl: detail.callerAvatarUrl ?? null,
      },
    });
  }
}

export function installCallNativeEventListener(): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent).detail;
    if (detail && typeof detail === "object") {
      handleCallNativeBridgeEvent(detail as CallNativeBridgeDetail);
    }
  };
  window.addEventListener("dibay:call-event", handler);
  return () => window.removeEventListener("dibay:call-event", handler);
}

export function installCallRouteListener(onRoute: (path: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as { path?: string } | undefined;
    const path = detail?.path?.trim();
    if (path?.startsWith("/")) {
      logCall("native", "call_route", { path });
      onRoute(path);
    }
  };
  window.addEventListener("dibay:call-route", handler);
  return () => window.removeEventListener("dibay:call-route", handler);
}
