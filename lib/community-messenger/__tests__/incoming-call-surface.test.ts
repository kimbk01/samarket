import { describe, expect, it } from "vitest";
import {
  isCommunityMessengerCallSurfacePath,
  resolveIncomingCallSurface,
  shouldRenderInternalIncomingCallUi,
  shouldUseIncomingCallBrowserNotification,
} from "@/lib/community-messenger/incoming-call-surface";

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

  it("uses full screen on dedicated call routes", () => {
    expect(isCommunityMessengerCallSurfacePath("/community-messenger/calls/session-1")).toBe(true);
    expect(isCommunityMessengerCallSurfacePath("/community-messenger/calls/outgoing")).toBe(false);
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/community-messenger/calls/session-1",
        isAppForeground: true,
        sessionStatus: "ringing",
      })
    ).toBe("full-screen");
  });

  it("uses full screen while accepting or recovering an active session", () => {
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/market",
        isAppForeground: true,
        sessionStatus: "ringing",
        acceptInProgress: true,
      })
    ).toBe("full-screen");

    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/orders",
        isAppForeground: true,
        sessionStatus: "active",
        activeSessionRecovery: true,
      })
    ).toBe("full-screen");
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

  it("routes accept-in-progress to full-screen before navigation completes", () => {
    expect(
      resolveIncomingCallSurface({
        visibilityState: "visible",
        currentPathname: "/stores",
        isAppForeground: true,
        sessionStatus: "ringing",
        acceptInProgress: true,
      })
    ).toBe("full-screen");
    expect(shouldRenderInternalIncomingCallUi("full-screen")).toBe(true);
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
