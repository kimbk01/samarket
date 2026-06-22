"use client";

/** Parse call session id from `/community-messenger/calls/:id` paths (notification replay). */
export function readCallV3SessionIdFromNativeRoute(path: string): string | null {
  const trimmed = path.trim();
  const match = trimmed.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  return id || null;
}

export function resolveCallV3NativeRouteSource(path: string): string {
  const trimmed = path.trim();
  if (trimmed.includes("source=activity")) return "native_activity_wake";
  if (trimmed.includes("source=native_push")) return "native_push_wake";
  if (trimmed.includes("source=native_resume")) return "native_notification_wake";
  if (trimmed.includes("incomingPreview=1")) return "native_incoming_preview_wake";
  if (trimmed.includes("action=accept")) return "native_notification_accept_wake";
  return "native_call_route_wake";
}

export function isCallV3NativeNotificationRoute(path: string): boolean {
  const trimmed = path.trim();
  return trimmed.startsWith("/community-messenger/calls/");
}
