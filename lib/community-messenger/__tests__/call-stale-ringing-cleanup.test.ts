import { describe, expect, it } from "vitest";
import type { MessengerCallAdminPolicy } from "@/lib/community-messenger/messenger-call-admin-policy";
import {
  isDirectRingingSessionExpired,
  isStaleRingingRow,
  STALE_RINGING_GRACE_MS,
} from "@/lib/community-messenger/call-stale-ringing-cleanup";

const TEST_POLICY: MessengerCallAdminPolicy = {
  incoming_ring_timeout_seconds: 30,
  incoming_ringtone_volume: 0.72,
  busy_auto_reject_enabled: false,
  repeated_call_cooldown_seconds: 0,
  suppress_incoming_local_notifications: false,
};

describe("call-stale-ringing-cleanup", () => {
  it("treats ringing past timeout+grace as expired", () => {
    const now = Date.now();
    const startedAt = new Date(now - 30_000 - STALE_RINGING_GRACE_MS - 1).toISOString();
    expect(isDirectRingingSessionExpired(startedAt, TEST_POLICY, now)).toBe(true);
  });

  it("keeps fresh ringing within timeout window", () => {
    const now = Date.now();
    const startedAt = new Date(now - 5_000).toISOString();
    expect(isDirectRingingSessionExpired(startedAt, TEST_POLICY, now)).toBe(false);
  });

  it("isStaleRingingRow ignores non-ringing", () => {
    expect(isStaleRingingRow({ status: "active", started_at: null }, TEST_POLICY)).toBe(false);
  });
});
