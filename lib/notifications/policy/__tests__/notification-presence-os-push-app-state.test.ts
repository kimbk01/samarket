import { describe, expect, it } from "vitest";
import {
  resolveOsPushAppStateFromPresence,
  resolvePresenceSuppressDecision,
  type RecipientPresenceSnapshot,
} from "@/lib/notifications/policy/notification-presence-policy";

const now = Date.parse("2026-07-24T18:00:00.000Z");

describe("resolveOsPushAppStateFromPresence", () => {
  it("treats stale foreground presence as background for OS FCM", () => {
    const presence: RecipientPresenceSnapshot = {
      appVisibility: "foreground",
      activeRoomId: null,
      lastPingAtMs: now - 60 * 60 * 1000,
    };
    expect(resolveOsPushAppStateFromPresence(presence, now)).toBe("background");
  });

  it("keeps fresh foreground as foreground", () => {
    const presence: RecipientPresenceSnapshot = {
      appVisibility: "foreground",
      activeRoomId: null,
      lastPingAtMs: now - 5_000,
    };
    expect(resolveOsPushAppStateFromPresence(presence, now)).toBe("foreground");
  });

  it("does not change same-room suppress (still requires fresh ping)", () => {
    const stale: RecipientPresenceSnapshot = {
      appVisibility: "foreground",
      activeRoomId: "room-1",
      lastPingAtMs: now - 60_000,
    };
    expect(resolvePresenceSuppressDecision(stale, "room-1", now).suppressPush).toBe(false);
    const fresh: RecipientPresenceSnapshot = {
      appVisibility: "foreground",
      activeRoomId: "room-1",
      lastPingAtMs: now - 1_000,
    };
    expect(resolvePresenceSuppressDecision(fresh, "room-1", now).reason).toBe("same_room_foreground");
  });
});
