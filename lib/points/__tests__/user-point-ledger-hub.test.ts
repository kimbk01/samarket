import { describe, expect, it, vi } from "vitest";
import {
  adjustUserPoints,
  appendUserPointLedgerAudit,
  creditUserPoints,
  projectUserPointBalanceFromLedger,
  reconcileUserPointBalance,
  spendUserPoints,
  sumUserPointLedger,
} from "@/lib/points/user-point-ledger";

/**
 * Ledger-only mock: SSOT amounts in memory; profiles.points is cache.
 * rpc sum/project preferred; select fallback also works.
 */
function mockLedgerOnly(opts: {
  ledgerSum?: number;
  cache?: number;
  existingRelated?: boolean;
  existingCredit?: boolean;
}) {
  let ledgerSum = opts.ledgerSum ?? opts.cache ?? 100;
  let cache = opts.cache ?? ledgerSum;

  const sb = {
    rpc: vi.fn(async (name: string, args: { p_user_id?: string }) => {
      void args;
      if (name === "sum_user_point_ledger") {
        return { data: ledgerSum, error: null };
      }
      if (name === "project_user_point_balance_from_ledger") {
        cache = Math.max(0, ledgerSum);
        return { data: cache, error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    }),
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: table === "profiles" ? { id: "u1", points: cache } : null,
                error: null,
              }),
            }),
          }),
          update: (patch: { points?: number }) => ({
            eq: async () => {
              if (typeof patch.points === "number") cache = patch.points;
              return { error: null };
            },
          }),
        };
      }
      if (table === "point_ledger") {
        return {
          select: (cols: string) => {
            if (cols === "amount") {
              return {
                eq: async () => ({
                  data: [{ amount: ledgerSum }],
                  error: null,
                }),
              };
            }
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      limit: async () => ({
                        data: opts.existingCredit ? [{ id: "x" }] : [],
                        error: null,
                      }),
                    }),
                    limit: async () => ({
                      data: opts.existingRelated ? [{ id: "x" }] : [],
                      error: null,
                    }),
                  }),
                  limit: async () => ({
                    data: opts.existingRelated ? [{ id: "x" }] : [],
                    error: null,
                  }),
                }),
              }),
            };
          },
          insert: (row: { amount?: number }) => {
            const amt = Math.trunc(Number(row.amount ?? 0));
            ledgerSum += amt;
            return {
              select: () => ({
                maybeSingle: async () => ({ data: { id: "ledger-1" }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };

  return {
    sb: sb as never,
    getCache: () => cache,
    getLedgerSum: () => ledgerSum,
    setCacheOnly: (n: number) => {
      cache = n;
    },
  };
}

describe("user-point-ledger ledger-only", () => {
  it("sumUserPointLedger uses SSOT sum", async () => {
    const { sb } = mockLedgerOnly({ ledgerSum: 42, cache: 0 });
    const res = await sumUserPointLedger(sb, "u1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sum).toBe(42);
  });

  it("spend uses ledger sum not stale cache", async () => {
    const { sb, getCache } = mockLedgerOnly({ ledgerSum: 5, cache: 100 });
    const res = await spendUserPoints(sb, {
      userId: "u1",
      amount: 10,
      entryType: "ad_hold",
      relatedType: "trade_post_ad",
      relatedId: "hold:ad1",
      description: "hold",
      actorType: "system",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("insufficient_balance");
    expect(getCache()).toBe(100);
  });

  it("adjustUserPoints credits via ledger then project", async () => {
    const { sb, getCache, getLedgerSum } = mockLedgerOnly({ ledgerSum: 10, cache: 10 });
    const res = await adjustUserPoints(sb, {
      userId: "u1",
      delta: 5,
      description: "bonus",
      actorUserId: "admin1",
      relatedId: "adjust:test:1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.balanceAfter).toBe(15);
    expect(getLedgerSum()).toBe(15);
    expect(getCache()).toBe(15);
  });

  it("adjustUserPoints debits via ledger then project", async () => {
    const { sb, getCache, getLedgerSum } = mockLedgerOnly({ ledgerSum: 20, cache: 20 });
    const res = await adjustUserPoints(sb, {
      userId: "u1",
      delta: -7,
      description: "penalty",
      actorUserId: "admin1",
      relatedId: "adjust:test:2",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.balanceAfter).toBe(13);
    expect(getLedgerSum()).toBe(13);
    expect(getCache()).toBe(13);
  });

  it("reconcile repairs mismatched cache", async () => {
    const { sb, setCacheOnly, getCache } = mockLedgerOnly({ ledgerSum: 50, cache: 50 });
    setCacheOnly(7);
    expect(getCache()).toBe(7);
    const res = await reconcileUserPointBalance(sb, "u1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repaired).toBe(true);
      expect(res.cacheBefore).toBe(7);
      expect(res.ledgerSum).toBe(50);
      expect(res.cacheAfter).toBe(50);
    }
    expect(getCache()).toBe(50);
  });

  it("projectUserPointBalanceFromLedger is sole cache writer path", async () => {
    const { sb, setCacheOnly, getCache } = mockLedgerOnly({ ledgerSum: 33, cache: 1 });
    setCacheOnly(1);
    const res = await projectUserPointBalanceFromLedger(sb, "u1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.balance).toBe(33);
    expect(getCache()).toBe(33);
  });

  it("appendUserPointLedgerAudit projects after insert", async () => {
    const { sb, getCache, getLedgerSum } = mockLedgerOnly({ ledgerSum: 42, cache: 42 });
    const res = await appendUserPointLedgerAudit(sb, {
      userId: "u1",
      entryType: "ad_charge",
      relatedType: "trade_post_ad",
      relatedId: "finalize:ad1",
      description: "finalize",
      actorType: "system",
      amount: 0,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.balanceAfter).toBe(42);
    expect(getLedgerSum()).toBe(42);
    expect(getCache()).toBe(42);
  });

  it("creditUserPoints is idempotent on same entry key", async () => {
    const { sb, getCache } = mockLedgerOnly({ ledgerSum: 10, cache: 10, existingCredit: true });
    const res = await creditUserPoints(sb, {
      userId: "u1",
      amount: 5,
      entryType: "ad_hold_release",
      relatedType: "trade_post_ad",
      relatedId: "release:h1",
      description: "release",
      actorType: "system",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.balanceAfter).toBe(10);
    expect(getCache()).toBe(10);
  });
});
