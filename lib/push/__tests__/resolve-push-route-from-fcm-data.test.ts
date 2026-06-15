import { describe, expect, it } from "vitest";
import {
  resolveFcmPushTypeFromData,
  resolvePushRouteFromFcmData,
} from "@/lib/push/resolve-push-route-from-fcm-data";

describe("resolvePushRouteFromFcmData", () => {
  it("prefers relative url", () => {
    expect(resolvePushRouteFromFcmData({ url: "/community-messenger/rooms/r1" })).toBe(
      "/community-messenger/rooms/r1"
    );
  });

  it("resolves missed_call to logs with callId", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "missed_call",
        callId: "sess-9",
      })
    ).toBe("/community-messenger/calls/logs?callId=sess-9");
  });

  it("falls back to legacy sessionId for incoming_call", () => {
    expect(
      resolvePushRouteFromFcmData({
        call_push_kind: "incoming_call",
        sessionId: "sess-legacy",
      })
    ).toBe("/community-messenger/calls/sess-legacy");
  });

  it("detects type from legacy dibay_call", () => {
    expect(resolveFcmPushTypeFromData({ dibay_call: "1" })).toBe("incoming_call");
  });
});
