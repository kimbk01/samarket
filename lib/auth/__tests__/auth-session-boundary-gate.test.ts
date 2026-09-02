import { describe, expect, it } from "vitest";
import {
  isMessengerRoomOrCallPath,
  shouldBlockPrivateTreeForAuthSession,
  shouldFailOpenPrivateTreeWhileMembershipResolves,
} from "@/lib/auth/auth-session-boundary-gate";

describe("auth-session-boundary-gate SSOT", () => {
  it("fail-opens whenever session API proves authenticated and membership is not member", () => {
    expect(
      shouldFailOpenPrivateTreeWhileMembershipResolves({
        sessionApiAuthenticated: true,
        membershipStatus: "checking",
      }),
    ).toBe(true);
    expect(
      shouldFailOpenPrivateTreeWhileMembershipResolves({
        sessionApiAuthenticated: true,
        membershipStatus: "guest",
      }),
    ).toBe(true);
    expect(
      shouldFailOpenPrivateTreeWhileMembershipResolves({
        sessionApiAuthenticated: true,
        membershipStatus: "member",
      }),
    ).toBe(false);
    expect(
      shouldFailOpenPrivateTreeWhileMembershipResolves({
        sessionApiAuthenticated: false,
        membershipStatus: "checking",
      }),
    ).toBe(false);
  });

  it("never blocks private tree on Loading when session authenticated (messenger hang root)", () => {
    expect(
      shouldBlockPrivateTreeForAuthSession({
        sessionApiAuthenticated: true,
        membershipStatus: "checking",
        holdForRecovery: true,
        authExitStarted: false,
      }),
    ).toBe(false);
    expect(
      shouldBlockPrivateTreeForAuthSession({
        sessionApiAuthenticated: true,
        membershipStatus: "guest",
        holdForRecovery: true,
        authExitStarted: false,
      }),
    ).toBe(false);
  });

  it("blocks while membership checking when session not yet proven", () => {
    expect(
      shouldBlockPrivateTreeForAuthSession({
        sessionApiAuthenticated: false,
        membershipStatus: "checking",
        holdForRecovery: true,
        authExitStarted: false,
      }),
    ).toBe(true);
  });

  it("blocks on auth exit even if session probe was true", () => {
    expect(
      shouldBlockPrivateTreeForAuthSession({
        sessionApiAuthenticated: true,
        membershipStatus: "checking",
        holdForRecovery: true,
        authExitStarted: true,
      }),
    ).toBe(true);
  });

  it("identifies messenger room/call paths for shell fail-open", () => {
    expect(isMessengerRoomOrCallPath("/community-messenger/rooms/abc")).toBe(true);
    expect(isMessengerRoomOrCallPath("/community-messenger/calls/xyz")).toBe(true);
    expect(isMessengerRoomOrCallPath("/community-messenger")).toBe(false);
    expect(isMessengerRoomOrCallPath("/market")).toBe(false);
  });
});
