import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("push-route pending replay owner contract", () => {
  it("native keeps chat pending until ACK / path-matched clear", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("webview_route_delivered_awaiting_ack");
    expect(main).toContain("clear_refused_awaiting_ack");
    expect(main).toContain("onPushRouteConsumerReady");
    expect(main).toContain("ackPushRouteConsumed");
    expect(main).toContain("pending_route_cleared");
    expect(main).toContain("PushRouteAckMatch.matches");
    // Chat inject must not mark routeInjected before ACK (call branch still may).
    expect(main).toMatch(/webview_route_delivered_awaiting_ack[\s\S]*return false;/);
  });

  it("T5 chat ACK must not hide call overlay", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const ackStart = main.indexOf("public static void ackPushRouteConsumed");
    const ackEnd = main.indexOf("/** JS mount fallback when sessionStorage inject missed", ackStart);
    expect(ackStart).toBeGreaterThan(-1);
    expect(ackEnd).toBeGreaterThan(ackStart);
    const ackBody = main.slice(ackStart, ackEnd);
    expect(ackBody).not.toContain("hideCallRouteLoadingOverlay");
    expect(ackBody).toContain("PushRouteAckMatch.matches");
    expect(ackBody).toContain("path= empty");
  });

  it("ACK rejects prefix/empty (source contract)", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const match = read("android/app/src/main/java/com/dibay/app/PushRouteAckMatch.java");
    expect(main).not.toMatch(
      /ackPushRouteConsumed[\s\S]{0,800}pendingPath\.startsWith\(target/
    );
    expect(main).toMatch(
      /ackPushRouteConsumed[\s\S]{0,400}if \(target\.isEmpty\(\)\)/
    );
    expect(match).toContain("ACKED_ROUTE == PENDING_ROUTE");
  });

  it("plugin exposes consumer ready + ack on existing NativeIncomingCall bridge", () => {
    const plugin = read("android/app/src/main/java/com/dibay/app/NativeIncomingCallPlugin.java");
    expect(plugin).toContain("notifyPushRouteConsumerReady");
    expect(plugin).toContain("ackPushRouteConsumed");
    expect(plugin).toContain("clearPersistedPendingPushRouteIfConsumed");
  });

  it("SPA signals consumer ready and ACKs chat consume via path match", () => {
    const listener = read("components/push/PushRouteListener.tsx");
    expect(listener).toContain("notifyNativePushRouteConsumerReady");
    expect(listener).toContain("ackNativePushRouteConsumed");
    expect(listener).toContain("finalizePushRouteConsume");
    expect(listener).toContain("same_route_ack");
    expect(listener).toContain("consumer_ready");
  });

  it("T6 logout wipe force-clears native pending", () => {
    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(wipe).toContain('clearNativePersistedPendingPushRoute({ force: true })');
  });
});
