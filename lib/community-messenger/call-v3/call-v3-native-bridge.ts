"use client";

import { callV3Accept, callV3Reject, callV3IncomingDiscovered } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { callV3FetchSession } from "@/lib/community-messenger/call-v3/call-v3-api";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import {
  clearCallV3NativePendingForCall as clearCallV3NativePendingStoreForCall,
  drainCallV3NativePendingWakes,
  markCallV3NativeWakeReplayed,
  resetCallV3NativePendingForTests,
  storeCallV3NativePendingWake,
} from "@/lib/community-messenger/call-v3/call-v3-native-pending";
import { readCallV3ExitRouter } from "@/lib/community-messenger/call-v3/call-v3-route";
import {
  normalizeCallV3AppPath,
  readCallV3SessionIdFromRouteInput,
  readCallV3WakePathFromWindowLocation,
  resolveCallV3NotificationWakeSource,
  resolveCallV3NativeRouteSource,
} from "@/lib/push/native/call-v3-native-route";

export type CallV3NativeAction = "wake" | "accept" | "reject";

export type CallV3NativeEvent = {
  callId: string;
  action: CallV3NativeAction;
  source: string;
  path?: string | null;
};

let bridgeReady = false;
const pendingQueue: CallV3NativeEvent[] = [];
const replayedActionKeys = new Set<string>();

function replayKey(event: CallV3NativeEvent): string {
  return `${event.callId}:${event.action}`;
}

function fallbackRouter(): { push: (href: string) => void; replace: (href: string) => void } {
  const go = (href: string) => {
    if (typeof window !== "undefined") window.location.assign(href);
  };
  return { push: go, replace: go };
}

async function replayCallV3Wake(callId: string, source: string): Promise<void> {
  logCallV3("native_pending_replay", { callId, action: "wake", source });

  const session = await callV3FetchSession(callId);
  if (session?.status === "ringing" && !session.isMineInitiator) {
    callV3IncomingDiscovered(session);
    markCallV3NativeWakeReplayed(callId);
    logCallV3("native_replay_done", { callId, action: "wake", outcome: "incoming_discovered" });
    return;
  }

  markCallV3NativeWakeReplayed(callId);
  logCallV3("native_replay_done", {
    callId,
    action: "wake",
    outcome: "skipped",
    sessionStatus: session?.status ?? null,
  });
}

async function replayCallV3NativeEvent(event: CallV3NativeEvent): Promise<void> {
  const key = replayKey(event);
  if (replayedActionKeys.has(key)) {
    logCallV3("native_replay_skipped_duplicate", { callId: event.callId, action: event.action });
    return;
  }
  replayedActionKeys.add(key);

  if (event.action === "wake") {
    await replayCallV3Wake(event.callId, event.source);
    return;
  }

  logCallV3("native_pending_replay", { callId: event.callId, action: event.action, source: event.source });
  const router = readCallV3ExitRouter() ?? fallbackRouter();

  if (event.action === "accept") {
    await callV3Accept(event.callId, {
      push: router.push ?? router.replace ?? fallbackRouter().push,
      replace: router.replace,
    });
    logCallV3("native_replay_done", { callId: event.callId, action: "accept" });
    return;
  }

  if (event.action === "reject") {
    await callV3Reject(event.callId);
    logCallV3("native_replay_done", { callId: event.callId, action: "reject" });
  }
}

function flushPendingQueue(): void {
  const queued = pendingQueue.splice(0, pendingQueue.length);
  for (const event of queued) {
    void replayCallV3NativeEvent(event);
  }
}

function flushPendingWakeStore(): void {
  const wakes = drainCallV3NativePendingWakes();
  for (const wake of wakes) {
    void replayCallV3NativeEvent({
      callId: wake.callId,
      action: "wake",
      source: wake.source,
      path: wake.path,
    });
  }
}

export function markCallV3NativeBridgeReady(): void {
  if (bridgeReady) return;
  bridgeReady = true;
  flushPendingWakeStore();
  flushPendingQueue();
}

export function enqueueCallV3NativeEvent(event: CallV3NativeEvent): void {
  const callId = event.callId.trim();
  if (!callId) return;
  const normalized: CallV3NativeEvent = { ...event, callId };

  if (normalized.action === "wake") {
    if (!bridgeReady) {
      storeCallV3NativePendingWake({
        callId,
        source: normalized.source,
        path: normalized.path ?? null,
      });
      return;
    }
    void replayCallV3NativeEvent(normalized);
    return;
  }

  if (!bridgeReady) {
    pendingQueue.push(normalized);
    logCallV3("native_pending_queued", {
      callId,
      action: normalized.action,
      source: normalized.source,
    });
    return;
  }
  void replayCallV3NativeEvent(normalized);
}

/** Notification tap / FCM wake — discover incoming only (no PATCH). */
export function enqueueCallV3NativeNotificationWake(input: {
  callId: string;
  source: string;
  path?: string | null;
}): void {
  const callId = input.callId.trim();
  if (!callId) return;
  logCallV3("native_notification_click", { callId, source: input.source, path: input.path ?? null });
  enqueueCallV3NativeEvent({
    callId,
    action: "wake",
    source: input.source,
    path: input.path ?? null,
  });
}

/**
 * Parse call-route URL/path and enqueue V3 wake (no PATCH).
 * Used when native loads WebView URL directly without `dibay:call-route`.
 */
export function handleCallV3NotificationRouteWake(
  rawPath: string,
  options?: { source?: string | null },
): boolean {
  const path = normalizeCallV3AppPath(rawPath);
  const callId = readCallV3SessionIdFromRouteInput(path);
  if (!callId) return false;

  const source =
    options?.source != null
      ? resolveCallV3NotificationWakeSource(path, options.source)
      : resolveCallV3NativeRouteSource(path);

  enqueueCallV3NativeNotificationWake({
    callId,
    source,
    path,
  });
  return true;
}

/** Current WebView URL enter — fallback when only `webview_call_route_loaded` fired. */
export function handleCallV3WindowLocationRouteWake(options?: { source?: string | null }): boolean {
  const path = readCallV3WakePathFromWindowLocation();
  if (!path) return false;
  return handleCallV3NotificationRouteWake(path, {
    source: options?.source ?? "notification_tap",
  });
}

export function clearCallV3NativeBridgeForCall(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  clearCallV3NativePendingStoreForCall(sid);
  for (let i = pendingQueue.length - 1; i >= 0; i -= 1) {
    if (pendingQueue[i]?.callId === sid) pendingQueue.splice(i, 1);
  }
  replayedActionKeys.delete(`${sid}:wake`);
  replayedActionKeys.delete(`${sid}:accept`);
  replayedActionKeys.delete(`${sid}:reject`);
}

/** @deprecated alias — cleanup path */
export const clearCallV3NativePendingForCall = clearCallV3NativeBridgeForCall;

export function resetCallV3NativeBridgeForTests(): void {
  bridgeReady = false;
  pendingQueue.length = 0;
  replayedActionKeys.clear();
  resetCallV3NativePendingForTests();
}
