import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeFakeSupabase } from "@/lib/admin/__tests__/r7-delivery-b-fake-supabase";
import { loadDailyStatements } from "@/lib/finance/daily-statement/load-daily-statement";
import { loadStoreStatement } from "@/lib/finance/store-statement/load-store-statement";

/**
 * FIN-07 — admin statements read the commission SSOT SQL (same as Admin/Owner settlement screens):
 * sales = completed orders (`store_platform_payable_page`), fee = `store_commission_breakdown`.
 * Legacy `store_settlements` snapshots are never a numeric source.
 */
const STORE = "e0000000-0000-4000-8000-0000000000aa";

function payableRow(id: string, createdAt: string, direct: number, held: number) {
  return {
    order_id: id,
    order_no: `SO-${id}`,
    store_id: STORE,
    store_name: "S",
    created_at: createdAt,
    direct_php: direct,
    held_php: held,
    coin_minted: 0,
    gift_rail_php: 0,
    held_paid_by_coin_php: 0,
    payable_php: held,
    coin_over_credit: 0,
    settlement_status: null,
    legacy_net_php: 0,
    class: held > 0 ? "payable" : "direct_collected",
  };
}

function fixture() {
  const rows = [
    // 2026-10-19 17:30 UTC = 2026-10-20 01:30 Manila
    payableRow("a", "2026-10-19T17:30:00Z", 610, 340),
    payableRow("b", "2026-10-20T02:00:00Z", 100, 0),
    payableRow("c", "2026-10-18T05:00:00Z", 200, 0),
  ];
  return makeFakeSupabase(
    {
      stores: [{ id: STORE, store_name: "S", owner_user_id: null }],
      store_settlements: [{ id: "legacy", store_id: STORE, order_id: "x", gross_amount: 99999 }],
      store_sale_fee_obligations: [],
      store_economic_point_ledger: [],
      business_cash_ledger: [],
    },
    (name, args) => {
      if (name === "store_platform_payable_page") {
        const offset = Number(args.p_offset) || 0;
        const limit = Number(args.p_limit) || 100;
        return {
          data: {
            summary: {
              orders: 3,
              direct_collected_php: 910,
              platform_held_php: 340,
              legacy_open_settlement_php: 5000,
              legacy_open_settlement_count: 7,
            },
            total: rows.length,
            rows: rows.slice(offset, offset + limit),
          },
          error: null,
        };
      }
      if (name === "store_commission_breakdown") {
        if (args.p_group === "store") {
          return { data: [{ bucket: STORE, count: 2, net_commission_minor: 13300 }], error: null };
        }
        return {
          data: [
            { bucket: "2026-10-20", count: 1, net_commission_minor: 6600 },
            { bucket: "2026-10-18", count: 1, net_commission_minor: 6700 },
          ],
          error: null,
        };
      }
      return { data: null, error: { message: "unknown rpc" } };
    }
  );
}

describe("FIN-07 statements = commission SSOT", () => {
  it("daily statement: completed orders by Manila order day + breakdown fee; no store_settlements read", async () => {
    const f = fixture();
    const rows = await loadDailyStatements(f.sb as never, {
      storeId: STORE,
      fromIso: "2026-10-17T16:00:00.000Z",
      toIso: "2026-10-20T16:00:00.000Z",
    });
    expect(f.calls.some((c) => c.table === "store_settlements")).toBe(false);
    const payableCall = f.rpcCalls.find((c) => c.name === "store_platform_payable_page");
    expect(payableCall?.args).toMatchObject({ p_store_ids: [STORE], p_view: "all", p_limit: 500, p_offset: 0 });
    expect(f.rpcCalls.find((c) => c.name === "store_commission_breakdown")?.args).toMatchObject({ p_group: "day" });
    const byDay = Object.fromEntries(rows.map((r) => [r.date, r]));
    expect(byDay["2026-10-20"]).toMatchObject({ orders: 2, gross: 610 + 340 + 100, feeDue: 66 });
    expect(byDay["2026-10-18"]).toMatchObject({ orders: 1, gross: 200, feeDue: 67 });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-20", "2026-10-18"]);
  });

  it("store statement: sales from payable summary, fee from breakdown; daily sums reconcile", async () => {
    const f = fixture();
    const st = await loadStoreStatement(f.sb as never, {
      storeId: STORE,
      fromIso: "2026-10-17T16:00:00.000Z",
      toIso: "2026-10-20T16:00:00.000Z",
    });
    expect(st?.sales).toMatchObject({ orders: 3, gross: 1250, settlementFee: 133 });
    expect(f.calls.some((c) => c.table === "store_settlements")).toBe(false);

    const daily = await loadDailyStatements(fixture().sb as never, {
      storeId: STORE,
      fromIso: "2026-10-17T16:00:00.000Z",
      toIso: "2026-10-20T16:00:00.000Z",
    });
    expect(daily.reduce((n, r) => n + r.orders, 0)).toBe(st?.sales.orders);
    expect(daily.reduce((n, r) => n + r.gross, 0)).toBe(st?.sales.gross);
    expect(daily.reduce((n, r) => n + r.feeDue, 0)).toBe(st?.sales.settlementFee);
  });

  it("store statement fails closed (null) when the SSOT reader errors", async () => {
    const f = makeFakeSupabase({ stores: [{ id: STORE, store_name: "S" }] }, () => ({
      data: null,
      error: { message: "boom" },
    }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      loadStoreStatement(f.sb as never, { storeId: STORE, fromIso: "2026-10-01T00:00:00Z", toIso: "2026-10-02T00:00:00Z" })
    ).resolves.toBeNull();
    err.mockRestore();
  });

  it("financial statement / control plane / overview no longer use store_settlements as numbers", () => {
    const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
    const fin = read("lib/admin/store-financial-statement/load-store-financial-statement.ts");
    expect(fin).not.toContain("settlementSummary");
    expect(fin).toContain('.eq("order_status", "refunded")');
    const cp = read("lib/admin/finance-control-plane/load-finance-control-plane.ts");
    expect(cp).not.toContain('.from("store_settlements")');
    expect(cp).toContain('type: "ORDER_REFUND"');
    const ov = read("app/api/admin/store-fee-policies/overview/route.ts");
    expect(ov).not.toContain('.from("store_settlements")');
    for (const rel of ["lib/finance/daily-statement/load-daily-statement.ts", "lib/finance/store-statement/load-store-statement.ts"]) {
      expect(read(rel)).not.toContain("loadStoreSettlementFinancialFacts");
    }
  });
});

describe("FIN-07 legacy settlement list APIs retired (410)", () => {
  it("GET /api/me/store-settlements → 401 anon, 410 signed-in", async () => {
    vi.resetModules();
    const uid = vi.fn<() => Promise<string | null>>(async () => null);
    vi.doMock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: () => uid() }));
    const { GET } = await import("@/app/api/me/store-settlements/route");
    expect((await GET()).status).toBe(401);
    uid.mockResolvedValue("u1");
    const res = await GET();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ ok: false, error: "legacy_store_settlements_retired" });
    vi.doUnmock("@/lib/auth/get-route-user-id");
  });

  it("GET /api/admin/store-settlements → 403 non-admin, 410 admin", async () => {
    vi.resetModules();
    const admin = vi.fn(async () => false);
    vi.doMock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: () => admin() }));
    const { GET } = await import("@/app/api/admin/store-settlements/route");
    expect((await GET()).status).toBe(403);
    admin.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ ok: false, error: "legacy_store_settlements_retired" });
    vi.doUnmock("@/lib/auth/is-route-admin");
  });
});
