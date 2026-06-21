import { describe, expect, it } from "vitest";
import {
  isCalleeAcceptBridgeLayout,
  isCalleeAcceptInFlightUi,
  shouldClaimCallScreenSurfaceForCalleeAccept,
  shouldEjectCalleeFromRingingCallRoute,
} from "@/lib/community-messenger/call-client-incoming-boundary";

describe("call-client-incoming-boundary", () => {
  it("ejects ringing callee without accept action", () => {
    expect(
      shouldEjectCalleeFromRingingCallRoute({
        isMineInitiator: false,
        status: "ringing",
        requestedAction: null,
        busyAccept: false,
        calleeVideoConnectingShell: false,
      })
    ).toBe(true);
  });

  it("does not eject callee on accept route", () => {
    expect(
      shouldEjectCalleeFromRingingCallRoute({
        isMineInitiator: false,
        status: "ringing",
        requestedAction: "accept",
        busyAccept: false,
        calleeVideoConnectingShell: false,
      })
    ).toBe(false);
  });

  it("claims call_screen only for callee accept UI", () => {
    expect(
      shouldClaimCallScreenSurfaceForCalleeAccept({
        isMineInitiator: false,
        status: "ringing",
        requestedAction: "accept",
        calleeVideoConnectingShell: false,
      })
    ).toBe(true);
    expect(
      shouldClaimCallScreenSurfaceForCalleeAccept({
        isMineInitiator: false,
        status: "ringing",
        requestedAction: null,
        calleeVideoConnectingShell: false,
      })
    ).toBe(false);
  });

  it("bridges ringing to connecting during accept in-flight", () => {
    expect(
      isCalleeAcceptBridgeLayout({
        isMineInitiator: false,
        status: "ringing",
        requestedAction: "accept",
        busy: null,
        calleeVideoConnectingShell: false,
        nativeAcceptOwnedRoute: false,
        joined: false,
      })
    ).toBe(true);
    expect(
      isCalleeAcceptInFlightUi({
        isMineInitiator: false,
        status: "ringing",
        requestedAction: "accept",
        busy: "accept",
        calleeVideoConnectingShell: false,
        nativeAcceptOwnedRoute: false,
        joined: false,
      })
    ).toBe(true);
  });
});
