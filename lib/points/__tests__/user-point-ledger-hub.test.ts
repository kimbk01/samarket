import { describe, expect, it, vi } from "vitest";
import {
  adjustUserPoints,
  appendUserPointLedgerAudit,
  creditUserPoints,
  spendUserPoints,
} from "@/lib/points/user-point-ledger";

function mockSb(opts: {
  balance?: number;
  existingRelated?: boolean;
  existingCredit?: boolean;
}) {
  const balance = opts.balance ?? 100;
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { points: balance }, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    }
    if (table === "point_ledger") {
      return {
        select: () => ({
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
        }),
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: { id: "ledger-1" }, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as never;
}

describe("user-point-ledger hub", () => {
  it("spendUserPoints rejects insufficient balance", async () => {
    const sb = mockSb({ balance: 5 });
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
  });

  it("adjustUserPoints credits via hub", async () => {
    const sb = mockSb({ balance: 10 });
    const res = await adjustUserPoints(sb, {
      userId: "u1",
      delta: 5,
      description: "bonus",
      actorUserId: "admin1",
      relatedId: "adjust:test:1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.balanceAfter).toBe(15);
  });

  it("adjustUserPoints debits via hub", async () => {
    const sb = mockSb({ balance: 20 });
    const res = await adjustUserPoints(sb, {
      userId: "u1",
      delta: -7,
      description: "penalty",
      actorUserId: "admin1",
      relatedId: "adjust:test:2",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.balanceAfter).toBe(13);
  });

  it("appendUserPointLedgerAudit does not require balance change", async () => {
    const sb = mockSb({ balance: 42 });
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
  });

  it("creditUserPoints is idempotent on same entry key", async () => {
    const sb = mockSb({ balance: 10, existingCredit: true });
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
  });
});
