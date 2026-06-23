"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

const CALL_V4_RETURN_PATH_KEY = "samarket.cm.call_v4_return_path.v1";

export const COMMUNITY_MESSENGER_CALL_LOGS_HREF = "/community-messenger?section=call_logs";

export function buildCallV4ScreenHref(callId: string): string {
  return `/community-messenger/calls-v4/${encodeURIComponent(callId.trim())}`;
}

export function buildCallV4AcceptHref(callId: string, source: string): string {
  const sid = callId.trim();
  const src = source.trim() || "native";
  return `/community-messenger/calls-v4/${encodeURIComponent(sid)}?action=accept&source=${encodeURIComponent(src)}`;
}

export function rememberCallV4ReturnPath(): void {
  if (typeof window === "undefined") return;
  try {
    const path = `${window.location.pathname}${window.location.search}`;
    if (path.includes("/community-messenger/calls-v4/")) return;
    if (!path.startsWith("/") || path.startsWith("//") || path.length > 512) return;
    sessionStorage.setItem(CALL_V4_RETURN_PATH_KEY, path);
  } catch {
    /* noop */
  }
}

export function takeCallV4ReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(CALL_V4_RETURN_PATH_KEY)?.trim() ?? "";
    sessionStorage.removeItem(CALL_V4_RETURN_PATH_KEY);
    if (!value || !value.startsWith("/") || value.includes("/community-messenger/calls-v4/")) return null;
    return value;
  } catch {
    return null;
  }
}

export type CallV4Router = { replace?: (href: string) => void; push?: (href: string) => void };

let registeredExitRouter: CallV4Router | null = null;

export function registerCallV4ExitRouter(router: CallV4Router | null): void {
  registeredExitRouter = router;
}

export function readCallV4ExitRouter(): CallV4Router | null {
  return registeredExitRouter;
}

export function routeToCallV4Screen(router: { push: (href: string) => void; replace?: (href: string) => void }, callId: string, source = "sheet"): void {
  const href = buildCallV4AcceptHref(callId, source);
  logCallV4("route_to_screen", { callId, href });
  const go = router.replace ?? router.push;
  go(href);
}

export function exitCallV4ScreenAfterCleanup(router?: CallV4Router): void {
  const exit = takeCallV4ReturnPath() ?? COMMUNITY_MESSENGER_CALL_LOGS_HREF;
  logCallV4("exit_screen", { exit });
  const go = router?.replace ?? router?.push ?? registeredExitRouter?.replace ?? registeredExitRouter?.push;
  go?.(exit);
}
