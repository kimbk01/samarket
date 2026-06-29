import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_SOUND_ASSETS,
  NOTIFICATION_SOUND_EVENTS,
  NOTIFICATION_SOUND_EVENT_KEYS,
  assertRegistryIntegrity,
  getRegistryAsset,
  getRegistryEvent,
  eventsByDomain,
} from "@/lib/notifications/notification-sound-registry";
import { NOTIFICATION_SOUND_DOMAINS } from "@/lib/notifications/notification-sound-types";

describe("notification-sound-registry", () => {
  it("passes integrity check", () => {
    expect(() => assertRegistryIntegrity()).not.toThrow();
  });

  it("has no duplicate asset ids", () => {
    const ids = NOTIFICATION_SOUND_ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate event keys", () => {
    expect(new Set(NOTIFICATION_SOUND_EVENT_KEYS).size).toBe(NOTIFICATION_SOUND_EVENT_KEYS.length);
  });

  it("every event references an existing default asset", () => {
    for (const e of NOTIFICATION_SOUND_EVENTS) {
      expect(getRegistryAsset(e.default_asset_id)).toBeDefined();
    }
  });

  it("every event has android_channel_id", () => {
    for (const e of NOTIFICATION_SOUND_EVENTS) {
      expect(e.android_channel_id.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers all sound domains with at least one event", () => {
    for (const d of NOTIFICATION_SOUND_DOMAINS) {
      if (d === "system") continue;
      expect(eventsByDomain(d).length).toBeGreaterThan(0);
    }
  });

  it("resolves system_default", () => {
    expect(getRegistryEvent("system_default")?.default_asset_id).toBe("DIBAY-SND-001");
  });

  it("includes call voice and video incoming events", () => {
    expect(getRegistryEvent("call_incoming_voice")).toBeDefined();
    expect(getRegistryEvent("call_incoming_video")).toBeDefined();
  });
});
