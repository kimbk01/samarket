import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("iOS push tap route contract", () => {
  it("routes Capacitor pushNotificationActionPerformed through the shared FCM/APNS resolver", () => {
    const source = read("components/push/PushRouteListener.tsx");
    expect(source).toContain('PushNotifications.addListener("pushNotificationActionPerformed"');
    expect(source).toContain("resolvePushRouteFromFcmData(data)");
    expect(source).toContain("shouldApplyMemberNotificationReadOnPushTap");
    expect(source).toContain("maybeMarkMemberAOnPushTap");
    expect(source).toContain("postNotificationEventOpenedRead");
  });

  it("keeps appUrlOpen and native pending route replay for cold-start restores", () => {
    const source = read("components/push/PushRouteListener.tsx");
    expect(source).toContain('App.addListener("appUrlOpen"');
    expect(source).toContain("readNativePersistedPendingPushRoute()");
    expect(source).toContain("window.addEventListener(\"dibay:push-route\"");
  });

  it("AUTH RESOLUTION GATE: recovering/loading holds — does not open login", () => {
    const source = read("components/push/PushRouteListener.tsx");
    expect(source).toContain("resolvePushAuthGate");
    expect(source).toContain("isRecoveringPhase");
    expect(source).toContain("writePendingPushRoute");
    expect(source).toContain("auth_resolution_hold");
    expect(source).toContain("auth_resolved_replay");
    expect(source).not.toMatch(
      /sessionPhaseRef\.current !== "authenticated" && isAuthRequiredPushRoute/
    );
  });
});
