import { describe, expect, it } from "vitest";
import { resolveAuthoritativeCallDurationSeconds } from "@/lib/community-messenger/call-authority/call-duration-authority";

describe("resolveAuthoritativeCallDurationSeconds (CUT6)", () => {
  it("D6/D38: duration = endedAt - connectedAt (excludes accept→connect gap)", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        clientDurationSeconds: 999,
        answeredAt: "2026-07-29T12:00:05.000Z",
        connectedAt: "2026-07-29T12:00:08.000Z",
        endedAt: "2026-07-29T12:03:08.000Z",
        connectedAtAuthority: true,
      }),
    ).toBe(180);
  });

  it("D5: never-connected after accept → 0 under connectedAtAuthority", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        clientDurationSeconds: 30,
        answeredAt: "2026-07-29T12:00:05.000Z",
        connectedAt: null,
        endedAt: "2026-07-29T12:00:35.000Z",
        connectedAtAuthority: true,
      }),
    ).toBe(0);
  });

  it("missed/reject/cancel without connected → 0 under connectedAtAuthority", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        clientDurationSeconds: 30,
        answeredAt: null,
        connectedAt: null,
        endedAt: "2026-07-29T10:01:00.000Z",
        connectedAtAuthority: true,
      }),
    ).toBe(0);
  });

  it("legacy display without connectedAtAuthority still uses answered_at proxy", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        clientDurationSeconds: 999,
        answeredAt: "2026-07-29T10:00:10.000Z",
        endedAt: "2026-07-29T10:01:15.000Z",
      }),
    ).toBe(65);
  });

  it("legacy / call_log display falls back to client duration when no timestamps", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        clientDurationSeconds: 30,
        answeredAt: null,
        endedAt: "2026-07-29T10:01:00.000Z",
      }),
    ).toBe(30);
  });

  it("does not invent 1s from equal connected/ended timestamps", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        connectedAt: "2026-07-29T10:00:00.000Z",
        endedAt: "2026-07-29T10:00:00.000Z",
        connectedAtAuthority: true,
      }),
    ).toBe(0);
  });

  it("floors sub-second to 0", () => {
    expect(
      resolveAuthoritativeCallDurationSeconds({
        connectedAt: "2026-07-29T10:00:00.000Z",
        endedAt: "2026-07-29T10:00:00.400Z",
        connectedAtAuthority: true,
      }),
    ).toBe(0);
  });
});
