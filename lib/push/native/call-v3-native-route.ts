"use client";

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed) return trimmed;
  }
  return null;
}

/** Normalize app path from `/path`, `?query`, or absolute URL. */
export function normalizeCallV3AppPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
}

/** Parse call session id from `/community-messenger/calls/:id` paths (notification replay). */
export function readCallV3SessionIdFromNativeRoute(path: string): string | null {
  const trimmed = normalizeCallV3AppPath(path);
  const match = trimmed.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  return id || null;
}

/** Parse call id from path segment or `callId` / `sessionId` query params. */
export function readCallV3SessionIdFromRouteInput(input: string): string | null {
  const path = normalizeCallV3AppPath(input);
  const fromPath = readCallV3SessionIdFromNativeRoute(path);
  if (fromPath) return fromPath;

  const queryStart = path.indexOf("?");
  if (queryStart < 0) return null;
  try {
    const params = new URLSearchParams(path.slice(queryStart));
    return firstNonEmpty(params.get("callId"), params.get("sessionId"), params.get("session_id"));
  } catch {
    return null;
  }
}

export function isCallV3CalleeAcceptRoute(path: string): boolean {
  const trimmed = normalizeCallV3AppPath(path);
  return trimmed.includes("action=accept") || trimmed.includes("callAction=accept");
}

export function isCallV3CalleeRejectRoute(path: string): boolean {
  const trimmed = normalizeCallV3AppPath(path);
  return trimmed.includes("action=reject") || trimmed.includes("callAction=reject");
}

export function resolveCallV3NativeAcceptSource(path: string): string {
  const trimmed = normalizeCallV3AppPath(path);
  if (trimmed.includes("source=activity")) return "native_activity_accept";
  return "native_notification_accept";
}

export function resolveCallV3NativeRejectSource(path: string): string {
  const trimmed = normalizeCallV3AppPath(path);
  if (trimmed.includes("source=activity")) return "native_activity_reject";
  return "native_notification_reject";
}

export function isCallV3IncomingCallRouteSignal(path: string): boolean {
  const trimmed = normalizeCallV3AppPath(path);
  if (isCallV3NativeNotificationRoute(trimmed)) return true;
  const queryStart = trimmed.indexOf("?");
  if (queryStart < 0) return false;
  try {
    const params = new URLSearchParams(trimmed.slice(queryStart));
    const action = firstNonEmpty(params.get("action"), params.get("callAction"));
    if (action === "incoming_call") return Boolean(readCallV3SessionIdFromRouteInput(trimmed));
    return Boolean(
      firstNonEmpty(params.get("callId"), params.get("sessionId"), params.get("session_id"))
    );
  } catch {
    return false;
  }
}

export function resolveCallV3NativeRouteSource(path: string): string {
  const trimmed = normalizeCallV3AppPath(path);
  if (trimmed.includes("source=activity")) return "native_activity_wake";
  if (trimmed.includes("source=native_push")) return "native_push_wake";
  if (trimmed.includes("source=native_resume")) return "native_notification_wake";
  if (trimmed.includes("incomingPreview=1")) return "native_incoming_preview_wake";
  if (trimmed.includes("action=accept")) return "native_notification_accept_wake";
  return "native_call_route_wake";
}

export function resolveCallV3NotificationWakeSource(path: string, hint?: string | null): string {
  const override = hint?.trim();
  if (override) return override;
  return "notification_tap";
}

export function isCallV3NativeNotificationRoute(path: string): boolean {
  const trimmed = normalizeCallV3AppPath(path);
  return trimmed.startsWith("/community-messenger/calls/");
}

export function isCallV3NotificationWakeRoute(path: string): boolean {
  const trimmed = normalizeCallV3AppPath(path);
  if (!isCallV3IncomingCallRouteSignal(trimmed)) return false;
  return Boolean(readCallV3SessionIdFromRouteInput(trimmed));
}

export function readCallV3WakePathFromWindowLocation(): string | null {
  if (typeof window === "undefined") return null;
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return isCallV3NotificationWakeRoute(path) ? path : null;
}
