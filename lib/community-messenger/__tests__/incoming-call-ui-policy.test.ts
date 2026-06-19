import { describe, expect, it } from "vitest";
import {
  isNativeIncomingHydrateRoute,
  resolveIncomingAppForeground,
  shouldReplayCallPendingRoute,
  shouldSuppressWebIncomingPresenter,
} from "@/lib/community-messenger/incoming-call-ui-policy";

describe("incoming-call-ui-policy", () => {
  it("blocks native_push hydrate route identification", () => {
    expect(
      isNativeIncomingHydrateRoute("/community-messenger/calls/s1?source=native_push")
    ).toBe(true);
    expect(
      isNativeIncomingHydrateRoute("/community-messenger/calls/s1?action=accept&source=native_push")
    ).toBe(false);
  });

  it("resolveIncomingAppForeground requires visible + active on native", () => {
    expect(
      resolveIncomingAppForeground({
        isCapacitorNative: true,
        visibilityState: "hidden",
        capacitorAppActive: true,
      })
    ).toBe(false);
    expect(
      resolveIncomingAppForeground({
        isCapacitorNative: true,
        visibilityState: "visible",
        capacitorAppActive: false,
      })
    ).toBe(false);
  });

  it("shouldSuppressWebIncomingPresenter suppresses bg/lock and native pill", () => {
    expect(
      shouldSuppressWebIncomingPresenter({
        isCapacitorNative: true,
        visibilityState: "hidden",
        capacitorAppActive: false,
        preferNativeAndroidForegroundIncoming: true,
        incomingSessionId: "c1",
      })
    ).toEqual({ suppress: true, reason: "native_background_or_lock" });

    expect(
      shouldSuppressWebIncomingPresenter({
        isCapacitorNative: true,
        visibilityState: "visible",
        capacitorAppActive: true,
        preferNativeAndroidForegroundIncoming: true,
        nativeForegroundIncomingCallId: "c1",
        incomingSessionId: "c1",
      })
    ).toEqual({ suppress: true, reason: "native_foreground_pill_active" });

    expect(
      shouldSuppressWebIncomingPresenter({
        isCapacitorNative: true,
        visibilityState: "visible",
        capacitorAppActive: true,
        preferNativeAndroidForegroundIncoming: true,
        incomingSessionId: "c1",
      })
    ).toEqual({ suppress: true, reason: "native_foreground_primary" });
  });

  it("shouldReplayCallPendingRoute allows accept and blocks native_push hydrate", () => {
    expect(
      shouldReplayCallPendingRoute("/community-messenger/calls/s1?action=accept", {
        visibilityState: "hidden",
        capacitorAppActive: false,
      })
    ).toEqual({ allow: true, reason: "accept_route" });

    expect(
      shouldReplayCallPendingRoute("/community-messenger/calls/s1?source=native_push", {
        visibilityState: "visible",
        capacitorAppActive: true,
      })
    ).toEqual({ allow: false, reason: "native_push_hydrate_no_navigation" });

    expect(
      shouldReplayCallPendingRoute("/community-messenger/calls/s1?source=native_push", {
        visibilityState: "hidden",
        capacitorAppActive: false,
      })
    ).toEqual({ allow: false, reason: "defer_until_app_foreground" });
  });
});
