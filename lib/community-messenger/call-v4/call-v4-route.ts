"use client";

import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCommunityMessengerCallScreenPathname } from "@/lib/community-messenger/call-screen-pathname";

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
 * 통화 종료 후 복귀 이동을 건너뛸지 — 사용자가 **통화를 시작한 화면과 다른 일반 화면**(dock·CallKit 통화 중 다른 채팅방 등)에
 * 있을 때만 true. 이동 강제(다른 화면으로 끌려감)를 막는다.
 *
 * 기존 동작을 유지하는 경우(false):
 * - 통화 화면(`/calls-v4/…` 등)에 있을 때 — 정상 복귀
 * - 현재 경로 = 통화 시작 시 저장한 복귀 경로 — 발신·수락 직후 실패로 **URL 이 아직 통화 화면으로 바뀌기 전**인 경우 포함
 *   (같은 경로로 replace 해 진행 중인 통화 화면 이동을 덮는다)
 * - 복귀 경로가 없음 — 판단 근거가 없으므로 이전과 같이 이동
 */
export function shouldSkipCallV4ExitNavigation(returnPath: string | null): boolean {
  if (typeof window === "undefined") return false;
  const pathname = window.location.pathname;
  if (isCommunityMessengerCallScreenPathname(pathname)) return false;
  if (!returnPath) return false;
  const returnPathname = returnPath.split(/[?#]/)[0] ?? returnPath;
  return returnPathname !== pathname;
}

export function exitCallV4ScreenAfterCleanup(router?: CallV4Router): void {
  const returnPath = takeCallV4ReturnPath();
  if (shouldSkipCallV4ExitNavigation(returnPath)) {
    logCallV4("exit_screen_skipped", {
      reason: "not_on_call_screen",
      currentPath: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : null,
      discardedReturnPath: returnPath,
    });
    return;
  }
  const exit = returnPath ?? COMMUNITY_MESSENGER_CALL_LOGS_HREF;
  logCallV4("exit_screen", { exit, establishmentRemoved: isLegacyWebCallEstablishmentRemoved() });
  const go = router?.replace ?? router?.push ?? registeredExitRouter?.replace ?? registeredExitRouter?.push;
  go?.(exit);
}
