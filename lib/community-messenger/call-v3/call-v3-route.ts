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

export type CallV3Router = { replace?: (href: string) => void; push?: (href: string) => void };

let registeredExitRouter: CallV3Router | null = null;

export function registerCallV3ExitRouter(router: CallV3Router | null): void {
  registeredExitRouter = router;
}

export function readCallV3ExitRouter(): CallV3Router | null {
  return registeredExitRouter;
}

export function isOnCallV3ScreenPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/community-messenger/calls-v3/");
}

export function routeToCallV3Screen(router: { push: (href: string) => void; replace?: (href: string) => void }, callId: string): void {
  const href = buildCallV3ScreenHref(callId);
  logCallV3("route_to_screen", { callId, href });
  const go = router.replace ?? router.push;
  go(href);
}

/**
 * Leave calls-v3 when terminal cleanup finished. Preserves return path until navigation.
 */
export function exitCallV3ScreenAfterCleanup(router?: CallV3Router): void {
  const onCallScreen = typeof window === "undefined" ? Boolean(router) : isOnCallV3ScreenPath();
  if (!onCallScreen) {
    clearCallV3RouteState();
    logCallV3("route_back_done", { skipped: true, reason: "not_on_call_screen" });
    return;
  }
  routeBackFromCallV3(router);
}

export function routeBackFromCallV3(router?: CallV3Router): void {
  const pathname = typeof window !== "undefined" ? window.location.pathname : null;
  logCallV3("route_back_start", { pathname, hasRouter: Boolean(router) });
  const back = takeCallV3ReturnPath() ?? COMMUNITY_MESSENGER_CALL_LOGS_HREF;
  if (router?.replace) {
    router.replace(back);
  } else if (router?.push) {
    router.push(back);
  } else if (typeof window !== "undefined") {
    window.location.assign(back);
  }
  logCallV3("route_back_done", { href: back });
}
