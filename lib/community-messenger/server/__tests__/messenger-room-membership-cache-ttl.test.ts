/**
 * P2-7 (SV-07) — kick/leave/ban 이후 다른 인스턴스의 stale 멤버십 읽기 창 ≤ 5s.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("messenger room membership cache TTL (P2-7)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("default TTL ≤ 5s and cached membership expires after 5s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T00:00:00Z"));
    const m = await import("@/lib/community-messenger/server/messenger-room-membership-cache");
    expect(m.MESSENGER_ROOM_MEMBERSHIP_CACHE_TTL_MS).toBeLessThanOrEqual(5_000);
    m.rememberMessengerRoomMembershipCache("u-ttl", "room-ttl", "room-ttl");
    expect(m.probeMessengerRoomMembershipCache("u-ttl", "room-ttl").hit).toBe(true);
    vi.advanceTimersByTime(5_001);
    expect(m.probeMessengerRoomMembershipCache("u-ttl", "room-ttl").hit).toBe(false);
  });

  it("env cannot extend the window beyond 5s", async () => {
    vi.stubEnv("SAMARKET_CM_ROOM_MEMBERSHIP_CACHE_TTL_MS", "45000");
    const m = await import("@/lib/community-messenger/server/messenger-room-membership-cache");
    expect(m.MESSENGER_ROOM_MEMBERSHIP_CACHE_TTL_MS).toBe(5_000);
  });
});
