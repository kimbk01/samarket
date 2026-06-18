import { describe, expect, it } from "vitest";
import { resolvePresenceSuppressDecision } from "@/lib/notifications/policy/notification-presence-policy";

describe("notification-presence-policy", () => {
  const now = Date.now();

  it("suppresses push/sound/badge when same room foreground with fresh ping", () => {
    const decision = resolvePresenceSuppressDecision(
      {
        appVisibility: "foreground",
        activeRoomId: "room-1",
        lastPingAtMs: now - 1_000,
      },
      "room-1",
      now
    );
    expect(decision.reason).toBe("same_room_foreground");
    expect(decision.suppressPush).toBe(true);
    expect(decision.suppressSound).toBe(true);
    expect(decision.suppressBadge).toBe(true);
    expect(decision.autoRead).toBe(true);
  });

  it("allows push when active room differs", () => {
    const decision = resolvePresenceSuppressDecision(
      {
        appVisibility: "foreground",
        activeRoomId: "room-other",
        lastPingAtMs: now - 1_000,
      },
      "room-1",
      now
    );
    expect(decision.reason).toBeNull();
    expect(decision.suppressPush).toBe(false);
  });

  it("allows push when presence ping is stale", () => {
    const decision = resolvePresenceSuppressDecision(
      {
        appVisibility: "foreground",
        activeRoomId: "room-1",
        lastPingAtMs: now - 60_000,
      },
      "room-1",
      now
    );
    expect(decision.suppressPush).toBe(false);
  });
});
