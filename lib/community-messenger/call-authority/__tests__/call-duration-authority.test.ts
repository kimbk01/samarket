import { describe, expect, it } from "vitest";
import { resolveAuthoritativeCallDurationSeconds } from "@/lib/community-messenger/call-authority/call-duration-authority";

describe("resolveAuthoritativeCallDurationSeconds", () => {
  it("uses endedAt - answeredAt (not started/ring)", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        clientDurationSeconds: 999,
        answeredAt: "2026-07-29T10:00:10.000Z",
        endedAt: "2026-07-29T10:01:15.000Z",
      }),
    ).toBe(65);
  });

  it("returns 0 when never connected (cancel/reject/timeout)", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        clientDurationSeconds: 30,
        answeredAt: null,
        endedAt: "2026-07-29T10:01:00.000Z",
      }),
    ).toBe(30);
    expect(
      resolveAuthoritativeCallDurationSeconds({
        clientDurationSeconds: 0,
        answeredAt: null,
        endedAt: "2026-07-29T10:01:00.000Z",
      }),
    ).toBe(0);
  });

  it("does not invent 1s from equal timestamps", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        answeredAt: "2026-07-29T10:00:00.000Z",
        endedAt: "2026-07-29T10:00:00.000Z",
      }),
    ).toBe(0);
  });

  it("floors sub-second to 0", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        answeredAt: "2026-07-29T10:00:00.000Z",
        endedAt: "2026-07-29T10:00:00.400Z",
      }),
    ).toBe(0);
  });
});
