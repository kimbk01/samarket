import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureStoreSettlementForCompletedOrder = vi.fn(async () => undefined);
const recognizeOrderCurrencyOnCompleted = vi.fn(async () => ({ ok: true }));
const reverseCoinCreditsForOrder = vi.fn(async () => ({ ok: true }));
const reverseSaleFeeForOrder = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/stores/ensure-store-settlement", () => ({
  ensureStoreSettlementForCompletedOrder: (...a: unknown[]) =>
    (ensureStoreSettlementForCompletedOrder as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/currency/recognize-order-currency-on-completed", () => ({
  recognizeOrderCurrencyOnCompleted: (...a: unknown[]) =>
    (recognizeOrderCurrencyOnCompleted as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/currency/coin-reversal-writer", () => ({
  coinReversalIdempotencyKeyForOrder: (id: string) => `coin_reversal:order:${id.trim()}`,
  reverseCoinCreditsForOrder: (...a: unknown[]) =>
    (reverseCoinCreditsForOrder as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/currency/sale-fee-writer", () => ({
  reverseSaleFeeForOrder: (...a: unknown[]) => (reverseSaleFeeForOrder as (...x: unknown[]) => unknown)(...a),
}));

let tryGetSb: unknown = null;
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => tryGetSb,
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));

import {
  RECONCILE_WRITE_MODE_APPROVED,
  applyOrderCurrencyReconcileWrites,
  buildOrderCurrencyReconcileReport,
  resolveReconcileWriteGate,
  type ReconcileCandidates,
} from "@/lib/currency/reconcile-order-currency";
import { GET } from "@/app/api/cron/store-currency-recognition-reconcile/route";

type Row = Record<string, unknown>;

/** Minimal PostgREST-like mock over in-memory tables. Records every rpc + mutation. */
function makeSb(tables: Record<string, Row[]>) {
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const mutations: string[] = [];
  const sb = {
    rpcCalls,
    mutations,
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { data: { ok: true }, error: null };
    }),
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let range: [number, number] | null = null;
      let single = false;
      const q = {
        select() {
          return this;
        },
        insert() {
          mutations.push(`insert:${table}`);
          return this;
        },
        update() {
          mutations.push(`update:${table}`);
          return this;
        },
        delete() {
          mutations.push(`delete:${table}`);
          return this;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return this;
        },
        neq(col: string, val: unknown) {
          filters.push((r) => r[col] !== val);
          return this;
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(r[col]));
          return this;
        },
        order() {
          return this;
        },
        range(a: number, b: number) {
          range = [a, b];
          return this;
        },
        maybeSingle() {
          single = true;
          return this;
        },
        then(res: (v: unknown) => void) {
          let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (single) return res({ data: rows[0] ?? null, error: null });
          return res({ data: rows, error: null });
        },
      };
      return q;
    },
  };
  return sb;
}

const OLD = "2026-01-01T00:00:00.000Z";
const NEW = "2026-10-01T00:00:00.000Z";

function fixture() {
  return {
    store_orders: [
      // (a) completed without sale_coin
      { id: "c1", order_status: "completed", created_at: NEW, payment_amount: 500 },
      // completed with sale_coin — ok
      { id: "c2", order_status: "completed", created_at: NEW, payment_amount: 500 },
      // completed zero revenue — skipped
      { id: "c3", order_status: "completed", created_at: NEW, payment_amount: 0 },
      // (a) but settlement paid → excluded
      { id: "c4", order_status: "completed", created_at: NEW, payment_amount: 500 },
      // (b) refunded with sale_coin, no reversal
      { id: "r1", order_status: "refunded", created_at: NEW, payment_amount: 500 },
      // (b) refunded with open obligation
      { id: "r2", order_status: "refunded", created_at: OLD, payment_amount: 500 },
      // refunded fully reversed — ok
      { id: "r3", order_status: "refunded", created_at: NEW, payment_amount: 500 },
      // (c) cancelled with unreversed gift
      { id: "x1", order_status: "cancelled", created_at: NEW, payment_amount: 500 },
      // cancelled restored — ok
      { id: "x2", order_status: "cancelled", created_at: NEW, payment_amount: 500 },
    ],
    store_economic_point_ledger: [
      { idempotency_key: "sale_coin:c2" },
      { idempotency_key: "sale_coin:r1" },
      { idempotency_key: "sale_coin:r3" },
      { idempotency_key: "coin_reversal:order:r3" },
    ],
    store_sale_fee_obligations: [
      { order_id: "r2", status: "open" },
      { order_id: "r3", status: "waived" },
    ],
    gift_certificate_redemptions: [
      { order_id: "x1", reversed: false },
      { order_id: "x2", reversed: true },
    ],
    store_settlements: [{ order_id: "c4", settlement_status: "paid" }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DIBAY_CURRENCY_RECONCILE_APPLY_FROM;
  process.env.CRON_SECRET = "sekret";
  tryGetSb = null;
});

describe("reconcile report (read-only)", () => {
  it("classifies candidates, excludes paid settlements, and performs no writes", async () => {
    const sb = makeSb(fixture());
    const { report } = await buildOrderCurrencyReconcileReport(sb as never, NEW);
    expect(report.completedMissingSaleCoin.ids).toEqual(["c1"]);
    expect(report.completedZeroRevenueSkipped).toBe(1);
    expect(report.refundedUnreversed.ids.sort()).toEqual(["r1", "r2"]);
    expect(report.refundedUnreversed.missingCoinReversal).toBe(1);
    expect(report.refundedUnreversed.saleFeeNotWaived).toBe(1);
    expect(report.cancelledGiftNotRestored.ids).toEqual(["x1"]);
    expect(report.excludedPaidSettlement.ids).toEqual(["c4"]);
    expect(sb.rpcCalls).toEqual([]);
    expect(sb.mutations).toEqual([]);
    expect(ensureStoreSettlementForCompletedOrder).not.toHaveBeenCalled();
    expect(recognizeOrderCurrencyOnCompleted).not.toHaveBeenCalled();
    expect(reverseCoinCreditsForOrder).not.toHaveBeenCalled();
    expect(reverseSaleFeeForOrder).not.toHaveBeenCalled();
  });
});

describe("write gate", () => {
  it("hardcoded approval constant is false", () => {
    expect(RECONCILE_WRITE_MODE_APPROVED).toBe(false);
  });

  it("refuses with apply=1 AND env set while the constant is false", () => {
    const g = resolveReconcileWriteGate({ applyParam: "1", envApplyFrom: "2026-09-01T00:00:00Z" });
    expect(g).toEqual({ allowed: false, requested: true, reason: "write_mode_not_approved_in_code" });
  });

  it("not requested without apply=1", () => {
    expect(resolveReconcileWriteGate({ applyParam: null, envApplyFrom: "2026-09-01T00:00:00Z" }).allowed).toBe(false);
  });

  it("even with approval, env cutoff is required and must be ISO", () => {
    expect(resolveReconcileWriteGate({ applyParam: "1", envApplyFrom: "", approvedConstant: true })).toMatchObject({
      allowed: false,
      reason: "apply_from_env_missing",
    });
    expect(
      resolveReconcileWriteGate({ applyParam: "1", envApplyFrom: "yesterday", approvedConstant: true })
    ).toMatchObject({ allowed: false, reason: "apply_from_env_invalid" });
  });

  it("applyOrderCurrencyReconcileWrites refuses a disallowed gate and calls nothing", async () => {
    const sb = makeSb(fixture());
    const { candidates } = await buildOrderCurrencyReconcileReport(sb as never);
    const gate = resolveReconcileWriteGate({ applyParam: "1", envApplyFrom: "2026-01-01T00:00:00Z" });
    const res = await applyOrderCurrencyReconcileWrites(sb as never, candidates, gate);
    expect(res).toEqual({ ok: false, error: "write_mode_not_approved_in_code" });
    expect(sb.rpcCalls).toEqual([]);
    expect(recognizeOrderCurrencyOnCompleted).not.toHaveBeenCalled();
    expect(reverseCoinCreditsForOrder).not.toHaveBeenCalled();
  });
});

describe("write path status re-check (approved gate simulated)", () => {
  const gate = resolveReconcileWriteGate({
    applyParam: "1",
    envApplyFrom: "2026-06-01T00:00:00Z",
    approvedConstant: true,
  });

  it("never reverses an order that is no longer refunded; respects cutoff", async () => {
    const tables = fixture();
    const sb = makeSb(tables);
    const { candidates } = await buildOrderCurrencyReconcileReport(sb as never);
    // r1 got re-completed between report and write (status drift)
    (tables.store_orders.find((o) => o.id === "r1") as Row).order_status = "completed";
    expect(gate.allowed).toBe(true);
    const res = await applyOrderCurrencyReconcileWrites(sb as never, candidates, gate);
    expect(res.ok).toBe(true);
    expect(reverseCoinCreditsForOrder).not.toHaveBeenCalled();
    // r2 is before cutoff → untouched
    expect(reverseSaleFeeForOrder).not.toHaveBeenCalled();
    // completed c1 recognized via existing idempotent writers
    expect(ensureStoreSettlementForCompletedOrder).toHaveBeenCalledWith(sb, "c1");
    expect(recognizeOrderCurrencyOnCompleted).toHaveBeenCalledWith(sb, "c1");
    // cancelled x1 still cancelled → gift restore RPC
    expect(sb.rpcCalls).toEqual([{ fn: "gift_certificate_cancel_order_restore", args: { p_order_id: "x1" } }]);
  });

  it("reverses only after re-reading refunded", async () => {
    const tables = fixture();
    const sb = makeSb(tables);
    const { candidates } = await buildOrderCurrencyReconcileReport(sb as never);
    const cands: ReconcileCandidates = { completed: [], cancelled: [], refunded: candidates.refunded };
    await applyOrderCurrencyReconcileWrites(sb as never, cands, gate);
    expect(reverseCoinCreditsForOrder).toHaveBeenCalledTimes(1);
    expect(reverseCoinCreditsForOrder).toHaveBeenCalledWith(sb, expect.objectContaining({ orderId: "r1" }));
  });
});

describe("cron route", () => {
  it("requires auth", async () => {
    tryGetSb = makeSb(fixture());
    const res = await GET(new Request("https://x.test/api/cron/store-currency-recognition-reconcile"));
    expect(res.status).toBe(401);
    const bad = await GET(
      new Request("https://x.test/api/cron/store-currency-recognition-reconcile", {
        headers: { authorization: "Bearer nope" },
      })
    );
    expect(bad.status).toBe(401);
  });

  it("503 when CRON_SECRET missing", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(new Request("https://x.test/api/cron/store-currency-recognition-reconcile"));
    expect(res.status).toBe(503);
  });

  it("default is report-only and calls no write function", async () => {
    const sb = makeSb(fixture());
    tryGetSb = sb;
    const res = await GET(
      new Request("https://x.test/api/cron/store-currency-recognition-reconcile", {
        headers: { authorization: "Bearer sekret" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode: string; refused: string | null; report: { completedMissingSaleCoin: { count: number } } };
    expect(body.mode).toBe("report_only");
    expect(body.refused).toBeNull();
    expect(body.report.completedMissingSaleCoin.count).toBe(1);
    expect(sb.rpcCalls).toEqual([]);
    expect(sb.mutations.filter((m) => !m.endsWith(":audit_logs"))).toEqual([]);
    expect(recognizeOrderCurrencyOnCompleted).not.toHaveBeenCalled();
    expect(reverseCoinCreditsForOrder).not.toHaveBeenCalled();
    expect(reverseSaleFeeForOrder).not.toHaveBeenCalled();
  });

  it("apply=1 + env cutoff is still refused while the constant is false", async () => {
    process.env.DIBAY_CURRENCY_RECONCILE_APPLY_FROM = "2026-01-01T00:00:00Z";
    const sb = makeSb(fixture());
    tryGetSb = sb;
    const res = await GET(
      new Request("https://x.test/api/cron/store-currency-recognition-reconcile?apply=1", {
        headers: { authorization: "Bearer sekret" },
      })
    );
    const body = (await res.json()) as { mode: string; refused: string };
    expect(body.mode).toBe("report_only");
    expect(body.refused).toBe("write_mode_not_approved_in_code");
    expect(sb.rpcCalls).toEqual([]);
    expect(ensureStoreSettlementForCompletedOrder).not.toHaveBeenCalled();
    expect(recognizeOrderCurrencyOnCompleted).not.toHaveBeenCalled();
    expect(reverseCoinCreditsForOrder).not.toHaveBeenCalled();
    expect(reverseSaleFeeForOrder).not.toHaveBeenCalled();
  });

  it("route never passes approvedConstant (cannot bypass the hardcoded gate)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/cron/store-currency-recognition-reconcile/route.ts"),
      "utf8"
    );
    expect(src).not.toContain("approvedConstant");
    expect(src).toContain("verifyCronRequestAuthorization(req, secret)");
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const cron = vercel.crons.find((c) => c.path === "/api/cron/store-currency-recognition-reconcile");
    expect(cron?.schedule).toBe("17 */6 * * *");
  });
});
