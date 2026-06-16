import { describe, expect, it } from "vitest";
import {
  extractCommunityMessengerCallRouteSessionId,
  isCommunityMessengerCallSurfacePath,
  resolveIncomingCallSurface,
  resolveOverlayBusyLiveSessionId,
  shouldHideGlobalIncomingOverlayForSession,
  shouldRenderInternalIncomingCallUi,
  shouldUseIncomingCallBrowserNotification,
} from "@/lib/community-messenger/incoming-call-surface";
import { canShowIncoming } from "@/lib/community-messenger/call-state/call-terminal-tombstone";

describe("incoming-call-surface", () => {
  it("uses top banner for foreground app surfaces outside the call route", () => {
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/stores",
        isAppForeground: true,
        sessionStatus: "ringing",
        callKind: "voice",
        deviceKind: "mobile",
      })
    ).toBe("top-banner");

    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/community-messenger",
        isAppForeground: true,
        sessionStatus: "ringing",
        callKind: "video",
        deviceKind: "desktop",
      })
    ).toBe("top-banner");
  });

  it("uses full screen on dedicated call routes for the same incoming session", () => {
    expect(isCommunityMessengerCallSurfacePath("/community-messenger/calls/session-1")).toBe(true);
    expect(isCommunityMessengerCallSurfacePath("/community-messenger/calls/outgoing")).toBe(false);
    expect(extractCommunityMessengerCallRouteSessionId("/community-messenger/calls/session-1")).toBe(
      "session-1"
    );
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/community-messenger/calls/session-1",
        isAppForeground: true,
        sessionStatus: "ringing",
        incomingSessionId: "session-1",
      })
    ).toBe("system-notification");
  });

  it("shows top banner on dedicated call route when incoming session differs from route", () => {
    expect(
      shouldHideGlobalIncomingOverlayForSession("/community-messenger/calls/session-1", "session-1")
    ).toBe(true);
    expect(
      shouldHideGlobalIncomingOverlayForSession("/community-messenger/calls/session-1", "session-2")
    ).toBe(false);
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/community-messenger/calls/session-1",
        isAppForeground: true,
        sessionStatus: "ringing",
        incomingSessionId: "session-2",
      })
    ).toBe("top-banner");
  });

  it("does not treat stale live session on previous call route as busy for new incoming", () => {
    expect(
      resolveOverlayBusyLiveSessionId({
        viewerLiveSessionId: "session-1",
        pathname: "/community-messenger/calls/session-1",
        incomingSessionId: "session-2",
      })
    ).toBeNull();
    expect(
      resolveOverlayBusyLiveSessionId({
        viewerLiveSessionId: "session-1",
        pathname: "/community-messenger",
        incomingSessionId: "session-2",
      })
    ).toBe("session-1");
  });

  it("keeps messenger home incoming banner unchanged", () => {
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/community-messenger",
        isAppForeground: true,
        sessionStatus: "ringing",
        incomingSessionId: "session-2",
      })
    ).toBe("top-banner");
    expect(
      shouldHideGlobalIncomingOverlayForSession("/community-messenger", "session-2")
    ).toBe(false);
  });

  it("does not change tombstone gate for consumed call ids", () => {
    const hardClearedAt = new Map<string, number>([["session-ended", Date.now()]]);
    const ctx = { hardClearedAt };
    expect(canShowIncoming("session-ended", ctx)).toBe(false);
    expect(canShowIncoming("session-new", ctx)).toBe(true);
  });

  it("does not mount Global incoming UI while accepting or recovering an active session", () => {
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/market",
        isAppForeground: true,
        sessionStatus: "ringing",
        acceptInProgress: true,
      })
    ).toBe("system-notification");

    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/orders",
        isAppForeground: true,
        sessionStatus: "active",
        activeSessionRecovery: true,
      })
    ).toBe("system-notification");
  });

  it("does not render an internal banner when the document is hidden", () => {
    expect(
      resolveIncomingCallSurface({
        visibilityState: "hidden",
        currentPathname: "/stores",
        isAppForeground: false,
        sessionStatus: "ringing",
      })
    ).toBe("system-notification");
  });

  it("keeps the first foreground ringing session on a single banner surface", () => {
    const surfaces = ["session-1", "session-1"].map(() =>
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/my",
        isAppForeground: true,
        sessionStatus: "ringing",
      })
    );

    expect(new Set(surfaces)).toEqual(new Set(["top-banner"]));
  });

  it("keeps internal UI limited to top-banner only", () => {
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/stores",
        isAppForeground: true,
        sessionStatus: "ringing",
        acceptInProgress: true,
      })
    ).toBe("system-notification");
    expect(shouldRenderInternalIncomingCallUi("top-banner")).toBe(true);
    expect(shouldRenderInternalIncomingCallUi("system-notification")).toBe(false);
  });

  it("suppresses browser notification while foreground banner is active", () => {
    expect(
      shouldUseIncomingCallBrowserNotification({
        visibilityState: "visible",
        currentPathname: "/stores",
        isAppForeground: true,
        sessionStatus: "ringing",
      })
    ).toBe(false);
    expect(
      shouldUseIncomingCallBrowserNotification({
        visibilityState: "hidden",
        currentPathname: "/stores",
        isAppForeground: false,
        sessionStatus: "ringing",
      })
    ).toBe(true);
  });
});
