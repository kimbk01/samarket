import { describe, expect, it } from "vitest";
import {
  isCallV3NativeNotificationRoute,
  readCallV3SessionIdFromNativeRoute,
  resolveCallV3NativeRouteSource,
} from "@/lib/push/native/call-v3-native-route";

describe("call-v3-native-route", () => {
  it("reads session id from call route", () => {
    expect(readCallV3SessionIdFromNativeRoute("/community-messenger/calls/call-1?source=native_push")).toBe(
      "call-1"
    );
  });

  it("detects native notification routes", () => {
    expect(isCallV3NativeNotificationRoute("/community-messenger/calls/x")).toBe(true);
    expect(isCallV3NativeNotificationRoute("/community-messenger/rooms/x")).toBe(false);
  });

  it("resolves wake source from query", () => {
    expect(resolveCallV3NativeRouteSource("/community-messenger/calls/x?source=native_push")).toBe(
      "native_push_wake"
    );
    expect(resolveCallV3NativeRouteSource("/community-messenger/calls/x?incomingPreview=1")).toBe(
      "native_incoming_preview_wake"
    );
  });
});
