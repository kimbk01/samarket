import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("incoming call general notification separation", () => {
  it("keeps incoming call FCM on the native call delivery boundary", () => {
    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(fcm).toContain("handleIncomingCall(message, data, title, body, appVisible)");
    expect(fcm).toContain("IncomingCallPushDelivery.deliver(this, payload)");
    expect(fcm).not.toContain("createAndDispatchNotificationEvent");
    expect(fcm).not.toContain("notification_events");
  });

  it("keeps missed call as the only call path that creates notification_events", () => {
    const missed = read("lib/notifications/pipeline/notify-missed-call-pipeline.ts");
    expect(missed).toContain('type: "missed_call"');
    expect(missed).toContain('category: "missed_call"');
    expect(missed).not.toContain("incoming_call_signal");
  });
});
