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

/**
 * D5 (Owner 승인 2026-11-09 · docs/audit/call-v4-exit-navigation-d5-plan-2026-11-09.md) —
 * 「통화 화면」 경로인가. `/community-messenger/calls-v4/…`, `/community-messenger/calls/…`(발신·세션 경유)이고
 * 통화 기록(`/community-messenger/calls/logs`)은 통화 화면이 아니다.
 */
export function isCallV4ScreenRoutePath(pathname: string | null | undefined): boolean {
  const p = String(pathname ?? "").split(/[?#]/)[0]!.replace(/\/+$/, "");
  if (p.startsWith("/community-messenger/calls-v4/")) return true;
  if (p === "/community-messenger/calls/logs" || p.startsWith("/community-messenger/calls/logs/")) return false;
  return p.startsWith("/community-messenger/calls/");
}

export function isOnCallV4ScreenRoute(): boolean {
  if (typeof window === "undefined") return false;
  return isCallV4ScreenRoutePath(window.location.pathname);
}

export function exitCallV4ScreenAfterCleanup(router?: CallV4Router, opts?: { wasOnCallScreen?: boolean }): void {
  /**
   * D5: 통화 화면에 있을 때만 나간다. 일반 화면(배너 수신 중 거절·취소·부재중, 도크 축소 후 다른 화면)에서는
   * 보던 화면을 유지하고, 다음 통화에 오래된 경로가 쓰이지 않도록 저장된 복귀 경로만 지운다.
   * 종료가 시작될 때 통화 화면이었으면(`wasOnCallScreen`) 정리 중 경로가 바뀌었어도 기존대로 나간다.
   */
  if (!isOnCallV4ScreenRoute() && opts?.wasOnCallScreen !== true) {
    takeCallV4ReturnPath();
    logCallV4("exit_screen_skipped_not_on_call_screen", {
      path: typeof window !== "undefined" ? window.location.pathname : null,
    });
    return;
  }
  const exit = takeCallV4ReturnPath() ?? COMMUNITY_MESSENGER_CALL_LOGS_HREF;
  logCallV4("exit_screen", { exit, establishmentRemoved: isLegacyWebCallEstablishmentRemoved() });
  const go = router?.replace ?? router?.push ?? registeredExitRouter?.replace ?? registeredExitRouter?.push;
  go?.(exit);
}
