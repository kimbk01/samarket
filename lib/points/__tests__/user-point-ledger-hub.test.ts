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
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      // P0 DB-1 — 원자 RPC 를 메모리로 흉내 (실제 DB 동작은 scripts/qa/finance-p0-local-pg 에서 검증).
      if (name === "spend_user_points") {
        const amt = Number(args.p_amount);
        if (opts.existingRelated) return { data: { ok: true, duplicate: true, balance_after: ledgerSum }, error: null };
        if (ledgerSum < amt) return { data: { ok: false, error: "insufficient_balance", balance: ledgerSum }, error: null };
        ledgerSum -= amt;
        cache = ledgerSum;
        return { data: { ok: true, duplicate: false, ledger_id: "led-s", balance_after: ledgerSum }, error: null };
      }
      if (name === "credit_user_points") {
        if (opts.existingCredit) return { data: { ok: true, duplicate: true, balance_after: ledgerSum }, error: null };
        ledgerSum += Number(args.p_amount);
        cache = ledgerSum;
        return { data: { ok: true, duplicate: false, ledger_id: "led-c", balance_after: ledgerSum }, error: null };
      }
      if (name === "admin_adjust_user_points") {
        const d = Number(args.p_delta);
        if (d < 0 && ledgerSum < -d) return { data: { ok: false, error: "insufficient_balance", balance: ledgerSum }, error: null };
        ledgerSum += d;
        cache = ledgerSum;
        return { data: { ok: true, duplicate: false, ledger_id: "led-a", balance_after: ledgerSum }, error: null };
      }
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
    // DB-1: 같은 키 재요청은 duplicate (추가 지급 없음)
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
    if (res.ok) {
      expect(res.balanceAfter).toBe(10);
      expect(res.duplicate).toBe(true);
    }
    expect(getCache()).toBe(10);
  });

  it("spend/credit call only the atomic RPCs (no direct point_ledger insert)", async () => {
    const { sb } = mockLedgerOnly({ ledgerSum: 50, cache: 50 });
    const spent = await spendUserPoints(sb, {
      userId: "u1",
      amount: 20,
      entryType: "ad_hold",
      relatedType: "feed_ad_request",
      relatedId: "hold:r1",
      description: "hold",
      actorType: "user",
    });
    expect(spent).toMatchObject({ ok: true, balanceAfter: 30, ledgerId: "led-s" });
    const rpcNames = (sb as unknown as { rpc: { mock: { calls: unknown[][] } } }).rpc.mock.calls.map((c) => c[0]);
    expect(rpcNames).toEqual(["spend_user_points"]);
    expect((sb as unknown as { from: { mock: { calls: unknown[][] } } }).from.mock.calls.length).toBe(0);
  });

  it("appendUserPointLedgerAudit refuses non-zero amounts (balance changes go through RPCs)", async () => {
    const { sb } = mockLedgerOnly({ ledgerSum: 50, cache: 50 });
    const res = await appendUserPointLedgerAudit(sb, {
      userId: "u1",
      entryType: "ad_charge",
      relatedType: "trade_post_ad",
      relatedId: "finalize:x",
      description: "x",
      actorType: "system",
      amount: 5 as unknown as 0,
    });
    expect(res).toEqual({ ok: false, error: "invalid_input" });
  });
});
