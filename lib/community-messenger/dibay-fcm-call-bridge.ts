"use client";

/** Android FCM → legacy 통화 수신 경로 어댑터 (OAuth/chat pending key 와 분리) */
export const DIBAY_CALL_PENDING_ROUTE_KEY = "dibay_call_pending_route";

type DibayFcmCallBridgeHandlers = {
  onIncomingWake: () => void;
  onCanceled: (sessionId: string) => void;
};

export function writeDibayCallPendingRoute(path: string): void {
  if (typeof window === "undefined") return;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return;
  sessionStorage.setItem(DIBAY_CALL_PENDING_ROUTE_KEY, JSON.stringify({ path: trimmed, at: Date.now() }));
}

export function readDibayCallPendingRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DIBAY_CALL_PENDING_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string; at?: number };
    const path = parsed.path?.trim();
    if (!path?.startsWith("/")) return null;
    if (parsed.at != null && Date.now() - parsed.at > 60_000) {
      sessionStorage.removeItem(DIBAY_CALL_PENDING_ROUTE_KEY);
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export function clearDibayCallPendingRoute(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DIBAY_CALL_PENDING_ROUTE_KEY);
}

/** `dibay:call-event` · `dibay:call-route` → legacy incoming wake / cancel / pending route */
export function installDibayFcmCallBridge(handlers: DibayFcmCallBridgeHandlers): () => void {
  if (typeof window === "undefined") return () => {};

  const onCallEvent = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as { type?: string; sessionId?: string } | undefined;
    if (!detail) return;
    if (detail.type === "incoming_call") {
      handlers.onIncomingWake();
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
