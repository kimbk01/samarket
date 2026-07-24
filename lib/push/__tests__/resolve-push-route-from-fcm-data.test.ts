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

  it("prefers explicit routeUrl over inferred route", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "admin_marketing_banner",
        routeUrl: "/community?banner=camp-1",
        roomId: "room-ignored",
      })
    ).toBe("/community?banner=camp-1");
  });

  it("resolves missed_call to logs with callId", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "missed_call",
        callId: "sess-9",
      })
    ).toBe("/community-messenger/calls/logs?callId=sess-9");
  });

  it("resolves missed_call with roomId to call-history room focus like Android", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "missed_call",
        roomId: "room-9",
        callId: "sess-9",
      })
    ).toBe("/community-messenger/rooms/room-9?focus=call-history&callId=sess-9");
  });

  it("resolves chat, trade, order, and community route payloads", () => {
    expect(resolvePushRouteFromFcmData({ type: "chat_message", roomId: "cm-1" })).toBe(
      "/community-messenger/rooms/cm-1"
    );
    expect(resolvePushRouteFromFcmData({ type: "trade_message", roomId: "trade-room-1" })).toBe(
      "/community-messenger/rooms/trade-room-1"
    );
    expect(resolvePushRouteFromFcmData({ type: "delivery_order", orderId: "order-1" })).toBe(
      "/orders/store/order-1"
    );
    expect(
      resolvePushRouteFromFcmData({ type: "delivery_order", roomId: "so-room-1", orderId: "order-1" })
    ).toBe("/community-messenger/rooms/so-room-1");
    expect(resolvePushRouteFromFcmData({ type: "community_comment", postId: "post-1" })).toBe(
      "/philife/posts/post-1"
    );
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
