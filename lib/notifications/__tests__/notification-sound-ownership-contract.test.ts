import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveNotificationPolicyProfile,
  shouldUseOsNotificationForState,
} from "@/lib/notifications/policy/notification-policy-profiles";
import {
  resolveOsPushAppStateFromPresence,
  resolvePresenceSuppressDecision,
} from "@/lib/notifications/policy/notification-presence-policy";

const read = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("notification sound ownership contract", () => {
  it("assigns different-room foreground sound to in-app only", () => {
    const now = Date.now();
    const presence = {
      appVisibility: "foreground",
      activeRoomId: "room-other",
      lastPingAtMs: now,
    };
    const decision = resolvePresenceSuppressDecision(
      presence,
      "room-target",
      now
    );
    const appState = resolveOsPushAppStateFromPresence(presence, now);
    const profile = resolveNotificationPolicyProfile("chat_message");

    expect(decision.suppressSound).toBe(false);
    expect(appState).toBe("foreground");
    expect(shouldUseOsNotificationForState(profile, appState)).toBe(false);
  });

  it("suppresses every sound owner for the active foreground room", () => {
    const now = Date.now();
    const presence = {
      appVisibility: "foreground",
      activeRoomId: "room-target",
      lastPingAtMs: now,
    };
    const decision = resolvePresenceSuppressDecision(
      presence,
      "room-target",
      now
    );
    expect(decision.suppressPush).toBe(true);
    expect(decision.suppressSound).toBe(true);
    expect(decision.reason).toBe("same_room_foreground");
  });

  it("assigns background and terminated sound to native OS only", () => {
    const profile = resolveNotificationPolicyProfile("chat_message");
    expect(shouldUseOsNotificationForState(profile, "background")).toBe(true);
    expect(shouldUseOsNotificationForState(profile, "killed")).toBe(true);
  });

  it("keeps Android standard push data-only and skips tray while visible", () => {
    const fcmSender = read("lib/push/dispatch/fcm-sender-impl.ts");
    const androidFcm = read(
      "android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java"
    );
    expect(fcmSender).toContain('kind: "alert_data_only"');
    expect(androidFcm).toContain(
      "if (appVisible && FcmPayloadResolver.isStandardRouteType(type))"
    );
    expect(androidFcm).toContain(
      "foreground_skip_system_notification"
    );
  });

  it("keeps Call sound ownership outside the general notification registry", () => {
    const registry = read(
      "lib/notifications/core/notification-event-registry.ts"
    );
    expect(registry).toMatch(
      /incoming_call_signal:[\s\S]*?soundEventKey: null,[\s\S]*?androidChannelKey: null/
    );
  });
});
