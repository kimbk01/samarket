/**
 * CUT 9 — Feed Ad HOLD apply Window A:
 * spendUserPoints success + feed_ad_point_holds insert fail
 * must credit back (no orphan ledger / no second debit on retry).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/points/user-point-ledger", () => ({
  spendUserPoints: vi.fn(),
  creditUserPoints: vi.fn(),
  appendUserPointLedgerAudit: vi.fn(async () => undefined),
}));

import { creditUserPoints, spendUserPoints } from "@/lib/points/user-point-ledger";
import { holdPointsForFeedAdRequest } from "@/lib/ads/feed-ad-request-point-flow";

describe("CUT9 feed ad hold apply Window A", () => {
  beforeEach(() => {
    vi.mocked(spendUserPoints).mockReset();
    vi.mocked(creditUserPoints).mockReset();
    vi.mocked(spendUserPoints).mockResolvedValue({ ok: true, balanceAfter: 100 });
    vi.mocked(creditUserPoints).mockResolvedValue({ ok: true, balanceAfter: 200 });
  });

  it("CASE C: spend ok + hold insert fail → credit release, no silent orphan debit", async () => {
    const sb = {
      from(table: string) {
        expect(table).toBe("feed_ad_point_holds");
        return {
          insert() {
            return this;
          },
          select() {
            return this;
          },
          maybeSingle: async () => ({
            data: null,
            error: { message: "insert_hold_failed" },
          }),
        };
      },
    } as unknown as SupabaseClient;

    const r = await holdPointsForFeedAdRequest(sb, {
      userId: "user-1",
      requestId: "req-1",
      pointCost: 1000,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("insert_hold_failed");
    expect(spendUserPoints).toHaveBeenCalledTimes(1);
    expect(spendUserPoints).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        relatedId: "hold:req-1",
        entryType: "ad_hold",
        amount: 1000,
      })
    );
    expect(creditUserPoints).toHaveBeenCalledTimes(1);
    expect(creditUserPoints).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        relatedId: "hold_insert_fail_release:req-1",
        entryType: "ad_hold_release",
        amount: 1000,
      })
    );
  });

  it("hold insert ok → no compensatory credit", async () => {
    const sb = {
      from() {
        return {
          insert() {
            return this;
          },
          select() {
            return this;
          },
          maybeSingle: async () => ({
            data: { id: "hold-row-1" },
            error: null,
          }),
        };
      },
    } as unknown as SupabaseClient;

    const r = await holdPointsForFeedAdRequest(sb, {
      userId: "user-1",
      requestId: "req-2",
      pointCost: 500,
    });

    expect(r).toEqual({ ok: true, holdId: "hold-row-1" });
    expect(creditUserPoints).not.toHaveBeenCalled();
  });
});
