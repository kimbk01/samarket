import { describe, expect, it } from "vitest";
import { shouldDeferCalleeRingingTerminalDismiss } from "@/lib/community-messenger/call-client-accept-route-surface";

describe("call-client-accept-route-surface", () => {
  it("defers ringing dismiss only while session is ringing on accept route", () => {
    expect(
      shouldDeferCalleeRingingTerminalDismiss({
        sessionId: "s1",
        sessionStatus: "ringing",
        requestedAction: "accept",
        nativeAcceptOwnedRoute: false,
        directPatchInFlight: false,
        busy: null,
        calleeVideoConnectingShell: false,
      })
    ).toBe(true);
  });

  it("does not defer after server terminal snapshot", () => {
    expect(
      shouldDeferCalleeRingingTerminalDismiss({
        sessionId: "s1",
        sessionStatus: "cancelled",
        requestedAction: "accept",
        nativeAcceptOwnedRoute: false,
        directPatchInFlight: false,
        busy: null,
        calleeVideoConnectingShell: false,
      })
    ).toBe(false);
  });

  it("defers on native accept owned route while ringing", () => {
    expect(
      shouldDeferCalleeRingingTerminalDismiss({
        sessionId: "s1",
        sessionStatus: "ringing",
        requestedAction: "accept",
        nativeAcceptOwnedRoute: true,
        directPatchInFlight: false,
        busy: null,
        calleeVideoConnectingShell: false,
      })
    ).toBe(true);
  });
});
