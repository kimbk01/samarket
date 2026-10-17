import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeStoreCashPosition,
  formatCashMinorSigned,
  normalizeStoreCashOrderGateMode,
  phpToCashMinor,
  splitStoreCommissionApproval,
  STORE_COMMISSION_CHARGED_ORDER_STATUSES,
} from "@/lib/stores/commission/store-commission-contract";
import {
  parseStoreCommissionLedgerQuery,
  resolveStoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import { platformHeldSaleAmountPhp } from "@/lib/currency/recognize-order-currency-on-completed";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const MIG = read("supabase/migrations/20270510120000_store_commission_cash_ssot.sql");

/** Body of one SQL function from the migration (for focused assertions). */
function fn(name: string): string {
  const start = MIG.indexOf(`FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = MIG.indexOf("\n$$;", start);
  return MIG.slice(start, end);
}

describe("A. commission is charged inside the status transaction (no bypass)", () => {
  it("trigger fires on INSERT and on every order_status change", () => {
    expect(MIG).toContain("AFTER INSERT OR UPDATE OF order_status ON public.store_orders");
    expect(fn("store_orders_commission_lifecycle")).toContain("store_commission_charge_order_internal(NEW.id, NEW.order_status)");
  });

  it("every cooking-or-later status charges (skipping 'preparing' cannot avoid the fee)", () => {
    const body = fn("store_orders_commission_lifecycle");
    for (const s of STORE_COMMISSION_CHARGED_ORDER_STATUSES) expect(body).toContain(`'${s}'`);
    expect(body).not.toContain("'accepted'");
    expect(body).not.toContain("'pending'");
  });

  it("a failed charge aborts the status change (RAISE → whole UPDATE rolls back)", () => {
    expect(fn("store_orders_commission_lifecycle")).toContain("RAISE EXCEPTION 'store_commission_charge_failed:%'");
    expect(fn("store_commission_charge_order_internal")).toContain("RAISE EXCEPTION 'store_commission_policy_missing");
  });

  it("exactly one charge per order (existing row / order_id unique / per-order key)", () => {
    const charge = fn("store_commission_charge_order_internal");
    expect(charge).toContain("FROM public.store_sale_fee_obligations WHERE order_id = p_order_id");
    expect(charge).toContain("'sale_fee:order:' || p_order_id::text");
    expect(fn("store_commission_debit_internal")).toContain("WHERE idempotency_key = p_idempotency_key OR order_id = p_order_id");
  });

  it("paid = min(balance, fee), outstanding = fee − paid; balance never negative", () => {
    const debit = fn("store_commission_debit_internal");
    expect(debit).toContain("v_cash_paid := LEAST(GREATEST(coalesce(v_cash_avail, 0), 0), p_fee_due_minor)");
    expect(debit).toContain("v_outstanding := p_fee_due_minor - v_cash_paid");
    expect(debit).toContain("FOR UPDATE");
  });

  it("calculator matches the TS calculator (floor, cap at base, fixed fee, delivery %)", () => {
    const c = fn("store_commission_charge_order_internal");
    expect(c).toContain("v_percent_fee := LEAST(v_base, floor(v_base * v_pct / 100))::bigint");
    expect(c).toContain("v_platform := LEAST(v_base, v_percent_fee + v_fixed)");
    expect(c).toContain("LEAST(v_delivery, floor(v_delivery * (v_policy->>'delivery_fee_percent')::numeric / 100))");
  });

  it("policy precedence = store → topic → category → default (same as TS resolver)", () => {
    const p = fn("store_commission_resolve_policy");
    const order = ["v_scope := 'store'", "v_scope := 'topic'", "v_scope := 'category'", "v_scope := 'default'"].map((s) => p.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(p).toContain("ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC");
  });

  it("TS never charges or reverses commission money", () => {
    const transition = read("lib/stores/apply-store-order-status-transition.ts");
    expect(transition).not.toMatch(/chargeStoreCommission|reverseSaleFeeForOrder|flagStoreCommissionReview/);
    const recognition = read("lib/currency/recognize-order-currency-on-completed.ts");
    expect(recognition).not.toMatch(/chargeStoreCommission|charge_sale_fee/);
  });
});

describe("B. cancel / refund → manual review only", () => {
  it("cancelled/refunded after a charge are flagged in the same transaction; pre-cooking cancel has no row", () => {
    const body = fn("store_orders_commission_lifecycle");
    expect(body).toContain("ELSIF NEW.order_status IN ('cancelled', 'refunded')");
    expect(body).toContain("adjustment_status = 'review_required'");
  });

  it("legacy automatic full reversal can no longer be executed by anyone", () => {
    expect(MIG).toContain("REVOKE ALL ON FUNCTION public.reverse_sale_fee_for_order(uuid, text) FROM PUBLIC, anon, authenticated, service_role;");
  });
});

describe("C. admin decision (approve full/partial | reject)", () => {
  const d = () => fn("admin_decide_store_commission_adjustment");

  it("requires platform admin, reason, review state, closed order", () => {
    expect(d()).toContain("NOT public.is_platform_admin(p_admin_user_id)");
    expect(d()).toContain("'reason_required'");
    expect(d()).toContain("'not_in_review'");
    expect(d()).toContain("'order_not_closed'");
  });

  it("idempotent replay returns the recorded decision; a second decision is refused", () => {
    expect(d()).toContain("WHERE idempotency_key = v_key");
    expect(d()).toContain("'idempotent', true");
    expect(MIG).toContain("CONSTRAINT store_commission_adjustments_one_per_obligation UNIQUE (obligation_id)");
  });

  it("lock order cash → obligation (same as charge/settle) to avoid deadlocks", () => {
    const body = d();
    expect(body.indexOf("FROM public.business_cash_accounts WHERE store_id = v_store FOR UPDATE")).toBeLessThan(
      body.indexOf("FROM public.store_sale_fee_obligations WHERE order_id = p_order_id FOR UPDATE")
    );
  });

  it("DB constraints forbid refunding Cash that was never paid / cancelling more than owed", () => {
    expect(MIG).toContain("CHECK (cash_refund_minor <= fee_paid_minor_before)");
    expect(MIG).toContain("CHECK (outstanding_cancel_minor <= fee_outstanding_minor_before)");
    expect(MIG).toContain("CHECK (approved_minor = cash_refund_minor + outstanding_cancel_minor)");
    expect(MIG).toContain("CHECK ((cash_refund_minor > 0) = (cash_ledger_id IS NOT NULL))");
  });

  it("decisions are immutable; corrections need a new record", () => {
    expect(MIG).toContain("BEFORE UPDATE OR DELETE ON public.store_commission_adjustments");
    expect(MIG).toContain("RAISE EXCEPTION 'store_commission_adjustments_immutable'");
  });

  it("TS split mirrors the DB rule: outstanding first, Cash only up to what was paid", () => {
    expect(splitStoreCommissionApproval({ approvedMinor: 3000, feePaidMinor: 0, feeOutstandingMinor: 7000 })).toEqual({
      outstandingCancelMinor: 3000,
      cashRefundMinor: 0,
    });
    expect(splitStoreCommissionApproval({ approvedMinor: 7000, feePaidMinor: 3000, feeOutstandingMinor: 4000 })).toEqual({
      outstandingCancelMinor: 4000,
      cashRefundMinor: 3000,
    });
    expect(splitStoreCommissionApproval({ approvedMinor: 7001, feePaidMinor: 3000, feeOutstandingMinor: 4000 })).toBeNull();
    expect(splitStoreCommissionApproval({ approvedMinor: 0, feePaidMinor: 3000, feeOutstandingMinor: 4000 })).toBeNull();
    expect(d()).toContain("v_cancel := LEAST(v_approved, v_ob.fee_outstanding_minor)");
  });
});

describe("D. Cash position and order gate", () => {
  it("net = balance − outstanding and goes negative", () => {
    const p = computeStoreCashPosition({ storeId: "s", balanceMinor: 0, outstandingMinor: 3800, gateMode: "off" });
    expect(p.netMinor).toBe(-3800);
    expect(p.orderable).toBe(true);
  });

  it("gate on: net <= 0 blocks, net > 0 opens — same rule as the DB trigger", () => {
    const g = "block_when_not_positive" as const;
    expect(computeStoreCashPosition({ storeId: "s", balanceMinor: 0, outstandingMinor: 0, gateMode: g }).orderable).toBe(false);
    expect(computeStoreCashPosition({ storeId: "s", balanceMinor: 100, outstandingMinor: 0, gateMode: g }).orderable).toBe(true);
    expect(fn("store_cash_position")).toContain("'orderable', (v_mode = 'off' OR v_net > 0)");
    expect(MIG).toContain("BEFORE INSERT ON public.store_orders");
    expect(normalizeStoreCashOrderGateMode("x")).toBe("off");
  });
});

describe("E. ledger integrity, privileges, history", () => {
  it("financial history cannot be cascade-deleted with orders/stores", () => {
    expect(MIG).toContain("FOREIGN KEY (order_id) REFERENCES public.store_orders (id) ON DELETE RESTRICT");
    expect(MIG).toContain("FOREIGN KEY (store_id) REFERENCES public.stores (id) ON DELETE RESTRICT");
  });

  it("no client or server role may write commission / Cash ledger tables directly", () => {
    expect(MIG).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_sale_fee_obligations FROM anon, authenticated, service_role;");
    expect(MIG).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.business_cash_ledger FROM anon, authenticated, service_role;");
  });

  it("integrity report checks charged/paid/status/review/balance invariants", () => {
    const r = fn("store_commission_integrity_report");
    for (const k of [
      "charged_eq_due_plus_adjustments",
      "cash_ledger_eq_fee_paid",
      "status_matches_amounts",
      "closed_orders_reviewed",
      "balance_eq_ledger_sum",
      "original_unknown",
    ]) {
      expect(r).toContain(k);
    }
  });

  it("legacy backfill uses ledger evidence only (no guessed amounts)", () => {
    expect(MIG).toContain("JOIN public.business_cash_ledger l\n      ON l.idempotency_key = 'sale_fee_reversal:order:' || ob.order_id::text");
    expect(MIG).toContain("'legacy_auto'");
  });

  it("state precedence keeps remaining debt visible after a partial refund / rejection", () => {
    const page = fn("store_commission_ledger_page");
    const review = page.indexOf("THEN 'review_required'");
    const outstanding = page.indexOf("THEN 'outstanding'");
    const refunded = page.indexOf("THEN 'refunded'");
    expect(review).toBeLessThan(outstanding);
    expect(outstanding).toBeLessThan(refunded);
  });

  it("summary totals and states are computed in SQL; pages cap at 500 rows but totals cover every row", () => {
    const page = fn("store_commission_ledger_page");
    expect(page).toContain("'reconciles', charged = paid + outstanding + refunded + cancelled");
    expect(page).toContain("LIMIT LEAST(500");
    expect(page.indexOf("sums AS")).toBeLessThan(page.indexOf("LIMIT LEAST(500"));
  });

  it("Admin and Owner routes call the same SQL readers", () => {
    for (const p of [
      "app/api/admin/store-commission-ledger/route.ts",
      "app/api/me/stores/[storeId]/commission-ledger/route.ts",
    ]) {
      expect(read(p)).toContain("loadStoreCommissionLedgerPage(");
    }
    for (const p of [
      "app/api/admin/store-commission-ledger/cash-ledger/route.ts",
      "app/api/me/stores/[storeId]/commission-ledger/cash-ledger/route.ts",
    ]) {
      expect(read(p)).toContain("loadStoreCashLedgerPage(");
    }
    expect(read("app/api/me/stores/[storeId]/commission-ledger/route.ts")).toContain("storeIds: [sid]");
    expect(read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx")).toContain("CommissionSummaryGrid");
    expect(read("components/business/owner/OwnerStoreSettlementsView.tsx")).toContain("CommissionSummaryGrid");
  });

  it("negative net renders with an explicit minus; PHP → centavos", () => {
    expect(formatCashMinorSigned(-3800, (php) => `₱${php.toFixed(2)}`)).toBe("-₱38.00");
    expect(phpToCashMinor(12.34)).toBe(1234);
  });
});

describe("F. periods (server-side, UTC)", () => {
  const now = new Date("2026-10-15T10:00:00Z"); // Thursday
  it("today / this week (Mon) / this month / custom → [from, to)", () => {
    expect(resolveStoreCommissionPeriod("today", null, null, now)).toEqual({
      fromIso: "2026-10-15T00:00:00.000Z",
      toIso: "2026-10-16T00:00:00.000Z",
    });
    expect(resolveStoreCommissionPeriod("this_week", null, null, now).fromIso).toBe("2026-10-12T00:00:00.000Z");
    expect(resolveStoreCommissionPeriod("this_month", null, null, now).fromIso).toBe("2026-10-01T00:00:00.000Z");
    expect(resolveStoreCommissionPeriod("custom", "2026-10-01", "2026-10-10", now)).toEqual({
      fromIso: "2026-10-01T00:00:00.000Z",
      toIso: "2026-10-11T00:00:00.000Z",
    });
  });

  it("parser clamps paging and filters kinds to known ledger kinds", () => {
    const q = parseStoreCommissionLedgerQuery(new URLSearchParams("limit=9999&offset=-5&kinds=TOP_UP,EVIL&state=decided"), now);
    expect(q.limit).toBe(500);
    expect(q.offset).toBe(0);
    expect(q.kinds).toEqual(["TOP_UP"]);
    expect(q.state).toBe("decided");
  });
});

describe("G. Coin = platform-held only (buyer pays the store directly)", () => {
  it("COD/GCash payment_amount is never minted", () => {
    expect(platformHeldSaleAmountPhp({ gift_redemption_amount: 0, platform_funded_amount: 0 })).toBe(0);
    expect(platformHeldSaleAmountPhp({ gift_redemption_amount: 300, platform_funded_amount: 50 })).toBe(350);
  });
});
