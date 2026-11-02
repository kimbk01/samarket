import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-11-02 F-5 — Capacitor 8 `registerPlugin` 과 같은 `get`-only Proxy 로
 * 알림 경로 함수가 네이티브 메서드에 실제로 도달하는지(`then` 동화로 거부되지 않는지) 고정한다.
 */
const calls: Array<{ method: string; options: unknown }> = [];

function createCapacitorLikePluginProxy(): object {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "$$typeof") return undefined;
        const method = String(prop);
        return (options?: unknown) => {
          if (method === "then") {
            return Promise.reject(new Error(`"NativeIncomingCall.then()" is not implemented on android`));
          }
          calls.push({ method, options });
          if (method === "getPendingPushRoute") {
            return Promise.resolve({ path: "/community-messenger/rooms/r1", at: Date.now() });
          }
          return Promise.resolve();
        };
      },
    }
  );
}

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => createCapacitorLikePluginProxy(),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
}));

import {
  ackNativePushRouteConsumed,
  clearNativePersistedPendingPushRoute,
  getNativeIncomingCallPlugin,
  notifyNativePushRouteConsumerReady,
  readNativePersistedPendingPushRoute,
} from "@/lib/push/native/push-route-native-bridge";

describe("push-route native bridge — plugin access on device", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("documents that the async accessor never settles with a get-only Capacitor proxy (call callers, design §4 B-5)", async () => {
    const unhandled = (e: unknown) => {
      void e;
    };
    process.on("unhandledRejection", unhandled);
    try {
      const settled = await Promise.race([
        getNativeIncomingCallPlugin().then(
          () => "resolved",
          () => "rejected"
        ),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 50)),
      ]);
      expect(settled).toBe("pending");
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("ackNativePushRouteConsumed reaches the native method", async () => {
    await ackNativePushRouteConsumed({ path: "/community-messenger/rooms/r1", notificationId: "n1" });
    expect(calls).toEqual([
      { method: "ackPushRouteConsumed", options: { path: "/community-messenger/rooms/r1", notificationId: "n1" } },
    ]);
  });

  it("notifyNativePushRouteConsumerReady reaches the native method", async () => {
    await notifyNativePushRouteConsumerReady();
    expect(calls.map((c) => c.method)).toEqual(["notifyPushRouteConsumerReady"]);
  });

  it("clearNativePersistedPendingPushRoute reaches the native method (force kept)", async () => {
    await clearNativePersistedPendingPushRoute({ force: true });
    expect(calls).toEqual([{ method: "clearPendingPushRoute", options: { force: true } }]);
  });

  it("readNativePersistedPendingPushRoute returns the native pending path", async () => {
    const pending = await readNativePersistedPendingPushRoute();
    expect(pending?.path).toBe("/community-messenger/rooms/r1");
  });
});
