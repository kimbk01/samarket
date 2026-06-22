"use client";

import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";

const CALL_V3_RETURN_PATH_KEY = "samarket.cm.call_v3_return_path.v1";

export const COMMUNITY_MESSENGER_CALL_LOGS_HREF = "/community-messenger?section=call_logs";

export function buildCallV3ScreenHref(callId: string): string {
  const sid = callId.trim();
  return `/community-messenger/calls-v3/${encodeURIComponent(sid)}`;
}

export function rememberCallV3ReturnPath(): void {
  if (typeof window === "undefined") return;
  try {
    const path = `${window.location.pathname}${window.location.search}`;
    if (path.includes("/community-messenger/calls-v3/")) return;
    if (path.includes("/community-messenger/calls/")) return;
    if (!path.startsWith("/") || path.startsWith("//") || path.length > 512) return;
    sessionStorage.setItem(CALL_V3_RETURN_PATH_KEY, path);
  } catch {
    /* quota / private mode */
  }
}

export function takeCallV3ReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(CALL_V3_RETURN_PATH_KEY)?.trim() ?? "";
    sessionStorage.removeItem(CALL_V3_RETURN_PATH_KEY);
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.length > 512) return null;
    if (value.includes("/community-messenger/calls-v3/")) return null;
    if (value.includes("/community-messenger/calls/")) return null;
    return value;
  } catch {
    return null;
  }
}

export function clearCallV3RouteState(_callId?: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CALL_V3_RETURN_PATH_KEY);
  } catch {
    /* noop */
  }
}

export function routeToCallV3Screen(
  router: { push: (href: string) => void; replace?: (href: string) => void },
  callId: string
): void {
  const href = buildCallV3ScreenHref(callId);
  logCallV3("route_to_screen", { callId, href });
  const go = router.replace ?? router.push;
  go(href);
}

export function routeBackFromCallV3(router: { replace: (href: string) => void; push?: (href: string) => void }): void {
  const back = takeCallV3ReturnPath() ?? COMMUNITY_MESSENGER_CALL_LOGS_HREF;
  router.replace(back);
}
