import { describe, expect, it } from "vitest";
import {
  DEFAULT_INCOMING_RING_TIMEOUT_SECONDS,
  clampIncomingRingTimeoutSeconds,
  computeIncomingRingRemainingSeconds,
  incomingRingTimeoutMsFromConfig,
} from "@/lib/community-messenger/messenger-call-ring-timeout";

describe("messenger-call-ring-timeout", () => {
  it("defaults to 30 seconds", () => {
    expect(DEFAULT_INCOMING_RING_TIMEOUT_SECONDS).toBe(30);
    expect(clampIncomingRingTimeoutSeconds(undefined)).toBe(30);
    expect(incomingRingTimeoutMsFromConfig(null)).toBe(30_000);
  });

  it("clamps admin config between 10 and 600 seconds", () => {
    expect(clampIncomingRingTimeoutSeconds(5)).toBe(10);
    expect(clampIncomingRingTimeoutSeconds(45)).toBe(45);
    expect(clampIncomingRingTimeoutSeconds(900)).toBe(600);
    expect(
      incomingRingTimeoutMsFromConfig({ incoming_ring_timeout_seconds: 45 } as Parameters<
        typeof incomingRingTimeoutMsFromConfig
      >[0])
    ).toBe(45_000);
  });

  it("computes remaining ring seconds for incoming UI", () => {
    const startedAt = new Date("2026-06-10T00:00:00.000Z").toISOString();
    expect(computeIncomingRingRemainingSeconds(startedAt, 30, Date.parse(startedAt) + 5_000)).toBe(25);
    expect(computeIncomingRingRemainingSeconds(startedAt, 30, Date.parse(startedAt) + 30_000)).toBeNull();
  });
});
