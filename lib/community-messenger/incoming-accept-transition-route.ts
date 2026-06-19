"use client";

import { readDibayCallPendingRoute } from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { readNativeCalleeAcceptPendingSessionId } from "@/lib/community-messenger/native-callee-accept-entry";

export function extractCommunityMessengerCallSessionIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/\/community-messenger\/calls\/([^/?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

export function isIncomingAcceptCallSurface(
  pathname: string,
  search: string,
  expectedSessionId: string
): boolean {
  const sid = expectedSessionId.trim();
  if (!sid) return false;
  const pathSid = extractCommunityMessengerCallSessionIdFromPathname(pathname);
  if (!pathSid || pathSid !== sid) return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("action") === "accept" || params.get("nativeAccept") === "1";
}

/** native accept PATCH 후 Web `router.replace` 전 — 통화 목록 등 중간 화면 가림용 */
export function readIncomingAcceptTransitionSessionId(): string | null {
  const pending = readNativeCalleeAcceptPendingSessionId();
  if (pending) return pending;

  const route = readDibayCallPendingRoute()?.trim();
  if (!route || !route.includes("action=accept")) return null;
  const match = route.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

export function shouldShowIncomingAcceptTransitionShell(pathname: string, search: string): {
  show: boolean;
  sessionId: string | null;
} {
  const sessionId = readIncomingAcceptTransitionSessionId();
  if (!sessionId) return { show: false, sessionId: null };
  if (isIncomingAcceptCallSurface(pathname, search, sessionId)) {
    return { show: false, sessionId };
  }
  return { show: true, sessionId };
}
