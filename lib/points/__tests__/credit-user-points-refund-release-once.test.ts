/**
 * finance-ssot-19 — creditUserPoints: 23505 on `point_ledger_refund_release_once_uidx`
 * means "already processed" (ok:true, duplicate:true). Other 23505 (e.g. community_reward
 * unique index) keep failing as before.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX,
  creditUserPoints,
  isPointLedgerRefundReleaseOnceViolation,
} from "@/lib/points/user-point-ledger";

function mockSb(insertError: { code?: string; message?: string; details?: string } | null) {
  const ledgerSum = 1000;
  const sb = {
    rpc: vi.fn(async (name: string) => {
      if (name === "sum_user_point_ledger") return { data: ledgerSum, error: null };
      if (name === "project_user_point_balance_from_ledger") return { data: ledgerSum, error: null };
      return { data: null, error: { message: "unknown rpc" } };
    }),
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: "u1", points: ledgerSum }, error: null }) }),
          }),
        };
      }
      // point_ledger
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({ limit: async () => ({ data: [], error: null }) }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            maybeSingle: async () =>
              insertError ? { data: null, error: insertError } : { data: { id: "led-1" }, error: null },
          }),
        }),
      };
    }),
  } as unknown as SupabaseClient;
  return sb;
}

const input = {
  userId: "u1",
  amount: 100,
  entryType: "ad_refund" as const,
  relatedType: "feed_ad_request" as const,
  relatedId: "req-1",
  description: "refund",
  actorType: "system" as const,
};

describe("creditUserPoints refund/release once index", () => {
  it("23505 on point_ledger_refund_release_once_uidx (message) → ok:true duplicate", async () => {
    const r = await creditUserPoints(
      mockSb({
        code: "23505",
        message: `duplicate key value violates unique constraint "${POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX}"`,
      }),
      input
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.duplicate).toBe(true);
      expect(r.balanceAfter).toBe(1000);
      expect(r.ledgerId).toBeUndefined();
    }
  });

  it("23505 with index name only in details → ok:true duplicate", async () => {
    const r = await creditUserPoints(
      mockSb({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: `index ${POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX}`,
      }),
      input
    );
    expect(r).toMatchObject({ ok: true, duplicate: true });
  });

  it("other 23505 (community_reward unique index) still fails", async () => {
    const r = await creditUserPoints(
      mockSb({
        code: "23505",
        message: 'duplicate key value violates unique constraint "point_ledger_community_reward_once_uidx"',
      }),
      input
    );
    expect(r.ok).toBe(false);
  });

  it("non-23505 error mentioning the index name still fails", async () => {
    const r = await creditUserPoints(
      mockSb({ code: "42501", message: `permission denied ${POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX}` }),
      input
    );
    expect(r.ok).toBe(false);
  });

  it("successful insert unchanged (ledgerId, no duplicate flag)", async () => {
    const r = await creditUserPoints(mockSb(null), input);
    expect(r).toEqual({ ok: true, balanceAfter: 1000, ledgerId: "led-1" });
  });

  it("predicate is exact to the index name and code", () => {
    expect(isPointLedgerRefundReleaseOnceViolation(null)).toBe(false);
    expect(isPointLedgerRefundReleaseOnceViolation({ code: "23505", message: "other_uidx" })).toBe(false);
    expect(
      isPointLedgerRefundReleaseOnceViolation({ code: "23505", message: POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX })
    ).toBe(true);
  });
});
