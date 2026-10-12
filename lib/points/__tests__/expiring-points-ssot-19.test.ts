import { describe, expect, it } from "vitest";
import { computeExpiringPointsFromLedger } from "@/lib/points/point-expire-utils";

const NOW = "2026-10-12T00:00:00.000Z";

describe("SSOT-19 F-17 computeExpiringPointsFromLedger", () => {
  it("sums unexpired future-dated credit rows and reports the nearest expiry", () => {
    const r = computeExpiringPointsFromLedger(
      [
        { amount: 300, expires_at: "2026-12-01T00:00:00.000Z", expired_amount: null },
        { amount: 200, expires_at: "2026-11-01T00:00:00.000Z", expired_amount: null },
      ],
      1000,
      NOW
    );
    expect(r).toEqual({ totalExpiringPoint: 500, nearestExpireAt: "2026-11-01T00:00:00.000Z", expiringEntriesCount: 2 });
  });

  it("excludes rows without expiry, already expired, past-dated or non-positive", () => {
    const r = computeExpiringPointsFromLedger(
      [
        { amount: 100, expires_at: null, expired_amount: null },
        { amount: 100, expires_at: "2026-12-01T00:00:00.000Z", expired_amount: 100 },
        { amount: 100, expires_at: "2026-01-01T00:00:00.000Z", expired_amount: null },
        { amount: -50, expires_at: "2026-12-01T00:00:00.000Z", expired_amount: null },
      ],
      1000,
      NOW
    );
    expect(r).toEqual({ totalExpiringPoint: 0, nearestExpireAt: null, expiringEntriesCount: 0 });
  });

  it("never exceeds the current balance (used points are not shown as expiring)", () => {
    const r = computeExpiringPointsFromLedger(
      [{ amount: 1000, expires_at: "2026-12-01T00:00:00.000Z", expired_amount: null }],
      250,
      NOW
    );
    expect(r.totalExpiringPoint).toBe(250);
    expect(computeExpiringPointsFromLedger([{ amount: 1000, expires_at: "2026-12-01T00:00:00.000Z", expired_amount: null }], -10, NOW).totalExpiringPoint).toBe(0);
  });
});
