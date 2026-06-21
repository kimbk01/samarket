/**
 * 수신 통화 레인 SSOT — 카카오톡/텔레그램식 단일 표면.
 *
 * | 앱 상태 | surface | 담당 |
 * |---------|---------|------|
 * | 앱 안 ringing | web_banner | `CommunityMessengerIncomingCallUi` |
 * | Lock / background / screen off | native_fullscreen | IncomingCallActivity |
 * | 수락 직후 connecting | call_screen_accept | CommunityMessengerCallClient |
 * | 그 외 | none | — |
 *
 * DO NOT: foreground 에 native pill + web banner 동시 노출.
 * DO NOT: ringing callee `/calls/:id` 에 IncomingCallView 전체화면.
 */

import { resolveIncomingCallSurface } from "@/lib/community-messenger/incoming-call-surface";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type IncomingCallLaneSurface =
  | "web_banner"
  | "native_fullscreen"
  | "call_screen_accept"
  | "none";

export type IncomingCallLaneInput = {
  visibilityState?: "visible" | "hidden" | "prerender" | "unloaded" | null;
  isAppForeground?: boolean;
  pathname?: string | null;
  sessionStatus: CommunityMessengerCallSession["status"] | null;
  callKind?: CommunityMessengerCallSession["callKind"];
  incomingSessionId?: string | null;
  /** `/calls/:id?action=accept` 등 수락 route */
  calleeAcceptRoute?: boolean;
};

export function resolveIncomingCallLane(input: IncomingCallLaneInput): {
  surface: IncomingCallLaneSurface;
  reason: string;
} {
  if (input.calleeAcceptRoute) {
    return { surface: "call_screen_accept", reason: "callee_accept_route" };
  }

  const sid = input.incomingSessionId?.trim() ?? "";
  if (!sid || input.sessionStatus !== "ringing") {
    return { surface: "none", reason: "not_ringing" };
  }

  const visibilityState = input.visibilityState ?? "visible";
  const isAppForeground = input.isAppForeground ?? visibilityState === "visible";
  const resolved = resolveIncomingCallSurface({
    visibilityState,
    currentPathname: input.pathname,
    isAppForeground,
    sessionStatus: input.sessionStatus,
    callKind: input.callKind ?? "voice",
    incomingSessionId: sid,
  });

  if (resolved === "top-banner") {
    return { surface: "web_banner", reason: "foreground_unlocked" };
  }
  return { surface: "native_fullscreen", reason: "system_notification_or_background" };
}
