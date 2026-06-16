export type IncomingCallSurface = "top-banner" | "system-notification";

export type IncomingCallSurfaceDeviceKind = "mobile" | "tablet" | "desktop";

export type ResolveIncomingCallSurfaceArgs = {
  visibilityState?: "visible" | "hidden" | "prerender" | "unloaded" | null;
  currentPathname?: string | null;
  isCallRoute?: boolean;
  isMessengerRoute?: boolean;
  isAppForeground?: boolean;
  sessionStatus?: string | null;
  callKind?: "voice" | "video" | string | null;
  deviceKind?: IncomingCallSurfaceDeviceKind | null;
  /** 수락 PATCH 직후 또는 권한/Agora join 단계처럼 통화 화면이 필요한 전환 */
  acceptInProgress?: boolean;
  /** 새로고침/복구가 active 통화 화면으로 되돌려야 하는 경우 */
  activeSessionRecovery?: boolean;
};

export function isCommunityMessengerCallSurfacePath(pathname: string | null | undefined): boolean {
  const path = normalizePathname(pathname);
  return /^\/community-messenger\/calls\/[^/]+$/.test(path) && path !== "/community-messenger/calls/outgoing";
}

export function isCommunityMessengerSurfacePath(pathname: string | null | undefined): boolean {
  const path = normalizePathname(pathname);
  return path === "/community-messenger" || path.startsWith("/community-messenger/");
}

export function resolveIncomingCallSurface(args: ResolveIncomingCallSurfaceArgs): IncomingCallSurface {
  const pathname = normalizePathname(args.currentPathname);
  const isCallRoute = args.isCallRoute ?? isCommunityMessengerCallSurfacePath(pathname);
  const visibilityState = args.visibilityState ?? "visible";
  const sessionStatus = args.sessionStatus?.trim().toLowerCase() ?? "";

  /**
   * 수신 UI 단일화 정책:
   * - `/calls/:id` 는 CallClient 전용(수신 배너/오버레이 금지)
   * - foreground `ringing` 만 상단 배너
   * - 그 외는 네이티브/알림 담당
   */
  if (isCallRoute) {
    return "system-notification";
  }

  if (visibilityState !== "visible" || args.isAppForeground === false) {
    return "system-notification";
  }

  if (args.acceptInProgress || args.activeSessionRecovery || sessionStatus === "active") {
    return "system-notification";
  }

  if (sessionStatus === "ringing") {
    return "top-banner";
  }

  return "system-notification";
}

export function shouldRenderInternalIncomingCallUi(surface: IncomingCallSurface | null | undefined): boolean {
  return surface === "top-banner";
}

/** foreground in-app UI가 있으면 Web Notification 은 중복 표시하지 않는다. */
export function shouldUseIncomingCallBrowserNotification(args: ResolveIncomingCallSurfaceArgs): boolean {
  return resolveIncomingCallSurface(args) === "system-notification";
}

function normalizePathname(pathname: string | null | undefined): string {
  const raw = pathname?.trim() ?? "";
  if (!raw) return "";
  return raw.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
}
