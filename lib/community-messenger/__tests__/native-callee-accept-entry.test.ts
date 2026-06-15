import { describe, expect, it } from "vitest";
import {
  isNativeCalleeAcceptRoute,
  shouldDeferCalleeGenericAutoJoin,
  shouldSuppressCalleeIncomingRingingUi,
} from "@/lib/community-messenger/native-callee-accept-entry";

describe("native-callee-accept-entry", () => {
  it("detects native accept route", () => {
    expect(isNativeCalleeAcceptRoute({ action: "accept", nativeAccept: "1" })).toBe(true);
    expect(isNativeCalleeAcceptRoute({ action: "accept", nativeAccept: null })).toBe(false);
  });

  it("suppresses ringing UI for accept route until joined", () => {
    expect(
      shouldSuppressCalleeIncomingRingingUi({
        isCallee: true,
        joined: false,
        acceptRoute: { action: "accept", nativeAccept: "1" },
        busyAcceptOrJoin: false,
      })
    ).toBe(true);
    expect(
      shouldSuppressCalleeIncomingRingingUi({
        isCallee: true,
        joined: true,
        acceptRoute: { action: "accept", nativeAccept: "1" },
        busyAcceptOrJoin: false,
      })
    ).toBe(false);
  });

  it("defers generic auto-join while accept route is active", () => {
    expect(
      shouldDeferCalleeGenericAutoJoin({
        isCallee: true,
        joined: false,
        joining: false,
        acceptRoute: { action: "accept", nativeAccept: "1" },
        busyAcceptOrJoin: false,
      })
    ).toBe(true);
    expect(
      shouldDeferCalleeGenericAutoJoin({
        isCallee: true,
        joined: false,
        joining: false,
        acceptRoute: { action: null, nativeAccept: null },
        busyAcceptOrJoin: false,
      })
    ).toBe(false);
  });
});
