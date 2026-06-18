import { describe, expect, it } from "vitest";
import {
  CALL_SERVER_HEARTBEAT_ENDED_REASON,
  CALL_SERVER_HEARTBEAT_STALE_MS,
} from "@/lib/call/call-server-heartbeat";

describe("call-server-heartbeat constants", () => {
  it("server stale timeout exceeds native FGS watchdog (35s)", () => {
    expect(CALL_SERVER_HEARTBEAT_STALE_MS).toBeGreaterThan(35_000);
  });

  it("uses heartbeat_timeout ended reason", () => {
    expect(CALL_SERVER_HEARTBEAT_ENDED_REASON).toBe("heartbeat_timeout");
  });
});
