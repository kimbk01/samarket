import { describe, expect, it } from "vitest";
import {
  decidePushRouteAck,
  isCallPushRoutePath,
  mayClearPendingOnDeliveryOnly,
  normalizePushRoutePath,
  pathsMatchForPushConsume,
} from "@/lib/push/push-route-consume-contract";

const ROOM = "/community-messenger/rooms/edba2412-8e39-409c-8081-1e98c053cd6d";

describe("push-route-consume-contract", () => {
  it("T3 — delivery alone must not clear pending", () => {
    expect(mayClearPendingOnDeliveryOnly()).toBe(false);
    expect(
      decidePushRouteAck({
        targetPath: ROOM,
        currentPath: "/",
        authGate: "allow",
        deliveryOnly: true,
      })
    ).toEqual({ action: "hold", reason: "delivery_only" });
  });

  it("T1 — cold start: pending held until path matches", () => {
    expect(
      decidePushRouteAck({
        targetPath: ROOM,
        currentPath: "/",
        authGate: "allow",
      })
    ).toEqual({ action: "hold", reason: "awaiting_navigation" });
    expect(
      decidePushRouteAck({
        targetPath: ROOM,
        currentPath: ROOM,
        authGate: "allow",
      })
    ).toEqual({ action: "ack", reason: "path_matched" });
  });

  it("T2 — background listener ready: matching path acks", () => {
    expect(pathsMatchForPushConsume(ROOM, ROOM)).toBe(true);
    expect(
      decidePushRouteAck({
        targetPath: ROOM,
        currentPath: ROOM,
        authGate: "allow",
      }).action
    ).toBe("ack");
  });

  it("T4 — duplicate target is idempotent (same path)", () => {
    expect(pathsMatchForPushConsume(`${ROOM}?x=1`, ROOM)).toBe(true);
    expect(normalizePushRoutePath(`${ROOM}#hash`)).toBe(ROOM);
  });

  it("T5 — foreground same route acks without requiring different path", () => {
    expect(
      decidePushRouteAck({
        targetPath: ROOM,
        currentPath: ROOM,
        authGate: "allow",
      })
    ).toEqual({ action: "ack", reason: "path_matched" });
  });

  it("T6 — auth hold keeps pending", () => {
    expect(
      decidePushRouteAck({
        targetPath: ROOM,
        currentPath: "/",
        authGate: "hold",
      })
    ).toEqual({ action: "hold", reason: "auth_hold" });
  });

  it("distinguishes call routes from chat room routes", () => {
    expect(isCallPushRoutePath("/community-messenger/calls/abc?action=accept")).toBe(true);
    expect(isCallPushRoutePath(ROOM)).toBe(false);
  });

  it("rejects messenger hub as match for exact room", () => {
    expect(pathsMatchForPushConsume("/community-messenger?section=chats", ROOM)).toBe(false);
    expect(pathsMatchForPushConsume("/", ROOM)).toBe(false);
  });

  it("T2 parent route must not decide ack for room pending", () => {
    expect(
      decidePushRouteAck({
        targetPath: ROOM,
        currentPath: "/community-messenger",
        authGate: "allow",
      })
    ).toEqual({ action: "hold", reason: "awaiting_navigation" });
  });

  it("T4 different room must not ack", () => {
    expect(pathsMatchForPushConsume(ROOM, "/community-messenger/rooms/other-id")).toBe(false);
  });
});
