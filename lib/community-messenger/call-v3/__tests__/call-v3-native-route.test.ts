import { describe, expect, it } from "vitest";
import {
  isCallV3NativeNotificationRoute,
  isCallV3NotificationWakeRoute,
  normalizeCallV3AppPath,
  readCallV3SessionIdFromNativeRoute,
  readCallV3SessionIdFromRouteInput,
  resolveCallV3NativeRouteSource,
  resolveCallV3NotificationWakeSource,
} from "@/lib/push/native/call-v3-native-route";

describe("call-v3-native-route", () => {
  it("reads session id from call route", () => {
    expect(readCallV3SessionIdFromNativeRoute("/community-messenger/calls/call-1?source=native_push")).toBe(
      "call-1"
    );
  });

  it("normalizes absolute call route URLs", () => {
    expect(
      normalizeCallV3AppPath(
        "https://samarket.vercel.app/community-messenger/calls/call-1?source=native_resume"
      )
    ).toBe("/community-messenger/calls/call-1?source=native_resume");
  });

  it("reads session id from query params", () => {
    expect(readCallV3SessionIdFromRouteInput("/community-messenger/rooms/x?sessionId=call-2")).toBe("call-2");
    expect(readCallV3SessionIdFromRouteInput("?callId=call-3&action=incoming_call")).toBe("call-3");
  });

  it("detects native notification routes", () => {
    expect(isCallV3NativeNotificationRoute("/community-messenger/calls/x")).toBe(true);
    expect(isCallV3NativeNotificationRoute("/community-messenger/rooms/x")).toBe(false);
  });

  it("detects notification wake routes from path or query", () => {
    expect(isCallV3NotificationWakeRoute("/community-messenger/calls/x?source=native_resume")).toBe(true);
    expect(isCallV3NotificationWakeRoute("/community-messenger/rooms/x?callId=y")).toBe(true);
    expect(isCallV3NotificationWakeRoute("/community-messenger/rooms/x")).toBe(false);
  });

  it("resolves wake source from query", () => {
    expect(resolveCallV3NativeRouteSource("/community-messenger/calls/x?source=native_push")).toBe(
      "native_push_wake"
    );
    expect(resolveCallV3NativeRouteSource("/community-messenger/calls/x?incomingPreview=1")).toBe(
      "native_incoming_preview_wake"
    );
    expect(resolveCallV3NotificationWakeSource("/community-messenger/calls/x")).toBe("notification_tap");
    expect(resolveCallV3NotificationWakeSource("/community-messenger/calls/x", "custom")).toBe("custom");
  });
});
