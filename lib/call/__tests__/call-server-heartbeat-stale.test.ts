import { describe, expect, it } from "vitest";
import {
  CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS,
  CALL_SERVER_HEARTBEAT_STALE_MS,
  isCallSessionOneSidedHeartbeatStale,
} from "@/lib/call/call-server-heartbeat";

describe("isCallSessionOneSidedHeartbeatStale", () => {
  const base = {
    id: "s1",
    initiator_user_id: "u1",
    recipient_user_id: "u2",
    answered_at: new Date(Date.now() - 60_000).toISOString(),
    caller_last_heartbeat_at: new Date().toISOString(),
    callee_last_heartbeat_at: new Date().toISOString(),
  };

  it("returns false before grace after answer", () => {
    const now = Date.now();
    const row = {
      ...base,
      answered_at: new Date(now - 5_000).toISOString(),
      caller_last_heartbeat_at: new Date(now - 120_000).toISOString(),
      callee_last_heartbeat_at: new Date(now - 120_000).toISOString(),
    };
    expect(isCallSessionOneSidedHeartbeatStale(row, now)).toBe(false);
  });

  it("returns true when caller heartbeat is stale (one-sided) — deprecated helper only", () => {
    const now = Date.now();
    const row = {
      ...base,
      answered_at: new Date(now - CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS - 1_000).toISOString(),
      caller_last_heartbeat_at: new Date(now - CALL_SERVER_HEARTBEAT_STALE_MS - 1_000).toISOString(),
      callee_last_heartbeat_at: new Date(now - 5_000).toISOString(),
    };
    // Deprecated predicate still detects one-sided staleness — MUST NOT be used for session end.
    expect(isCallSessionOneSidedHeartbeatStale(row, now)).toBe(true);
  });

  it("returns false when both peers are fresh", () => {
    const now = Date.now();
    expect(isCallSessionOneSidedHeartbeatStale(base, now)).toBe(false);
  });

  it("returns false when either heartbeat missing", () => {
    const now = Date.now();
    expect(
      isCallSessionOneSidedHeartbeatStale(
        { ...base, callee_last_heartbeat_at: null },
        now,
      ),
    ).toBe(false);
  });
});
