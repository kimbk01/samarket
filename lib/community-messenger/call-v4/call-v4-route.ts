"use client";

import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

const CALL_V4_RETURN_PATH_KEY = "samarket.cm.call_v4_return_path.v1";

export const COMMUNITY_MESSENGER_CALL_LOGS_HREF = "/community-messenger?section=call_logs";

export function buildCallV4ScreenHref(callId: string, source = "sheet"): string {
  const sid = callId.trim();
  const src = source.trim() || "sheet";
  return `/community-messenger/calls-v4/${encodeURIComponent(sid)}?source=${encodeURIComponent(src)}`;
}

export function buildCallV4IncomingPreviewHref(callId: string): string {
  const sid = callId.trim();
  return `/community-messenger/calls-v4/${encodeURIComponent(sid)}?incomingPreview=1&source=banner_expand`;
}

export function buildCallV4OutgoingHref(callId: string): string {
  return buildCallV4ScreenHref(callId, "outgoing");
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

/** Android sync-only에서도 발신 링 UI(`/calls-v4?source=outgoing`)는 허용한다 — establishment 는 Native SSOT. */
export function isCallV4OutgoingPresentationSource(source: string | null | undefined): boolean {
  return source?.trim() === "outgoing";
}

export function routeToCallV4Screen(router: { push: (href: string) => void; replace?: (href: string) => void }, callId: string, source = "sheet"): void {
  const sid = callId.trim();
  const href = buildCallV4ScreenHref(sid, source);
  const outgoingPresentation = isCallV4OutgoingPresentationSource(source);
  if (isLegacyWebCallEstablishmentRemoved() && !outgoingPresentation) {
    logCallV4("legacy_web_establishment_removed", { callId: sid, href, source, trigger: "route_to_screen" });
    return;
  }
  const go = router.replace ?? router.push;
  logCallV4("route_to_screen", { callId: sid, href, outgoingPresentation });
  go(href);
}

/** 웹 통화 화면 라우트(`/community-messenger/calls-v4/<id>`) 위에 있는지 — 통화 기록(`/calls/logs`)은 아님 */
export function isOnCallV4ScreenRoute(pathname: string | null | undefined): boolean {
  return /^\/community-messenger\/calls-v4\/[^/]+/.test(String(pathname ?? ""));
}

export function exitCallV4ScreenAfterCleanup(router?: CallV4Router): void {
  /**
   * C-16 / L-3 R1 — 네이티브 소유 통화(iOS VC·Android Activity)는 웹 이동 0회.
   * 통화 화면 라우트가 아닌 곳(채팅방 등)에서 종료되면 복귀 주소만 소비하고 이동하지 않는다
   * (이전: 원격 거절·부재중에 같은 방으로 replace 하거나, 복귀 주소가 없으면 통화 탭으로 튐).
   */
  if (typeof window !== "undefined" && !isOnCallV4ScreenRoute(window.location.pathname)) {
    const consumed = takeCallV4ReturnPath();
    logCallV4("exit_screen_skipped_not_on_call_route", { path: window.location.pathname, consumed: Boolean(consumed) });
    return;
  }
  const exit = takeCallV4ReturnPath() ?? COMMUNITY_MESSENGER_CALL_LOGS_HREF;
  logCallV4("exit_screen", { exit, establishmentRemoved: isLegacyWebCallEstablishmentRemoved() });
  const go = router?.replace ?? router?.push ?? registeredExitRouter?.replace ?? registeredExitRouter?.push;
  go?.(exit);
}
