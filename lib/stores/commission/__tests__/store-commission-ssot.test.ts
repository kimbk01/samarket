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
  formatManilaDateTime,
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
    const ownerLedger = read("app/api/me/stores/[storeId]/commission-ledger/route.ts");
    expect(ownerLedger).toContain("const scope = [sid]");
    expect(ownerLedger).toContain("getStoreIfOwner(sb, userId, sid)");
    for (const p of ["app/api/admin/store-commission-ledger/route.ts", "app/api/me/stores/[storeId]/commission-ledger/route.ts"]) {
      expect(read(p)).toContain("loadStoreCommissionBreakdown(");
      expect(read(p)).toContain("loadStorePlatformPayable(");
    }
    expect(read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx")).toContain("CommissionSummaryGrid");
    expect(read("components/business/owner/OwnerStoreSettlementsView.tsx")).toContain("CommissionSummaryGrid");
  });

  it("negative net renders with an explicit minus; PHP → centavos", () => {
    expect(formatCashMinorSigned(-3800, (php) => `₱${php.toFixed(2)}`)).toBe("-₱38.00");
    expect(phpToCashMinor(12.34)).toBe(1234);
  });
});

describe("F. periods (server-side, Asia/Manila business days, UTC storage)", () => {
  const now = new Date("2026-10-15T10:00:00Z"); // Thursday 18:00 in Manila
  it("today / this week (Mon) / this month / custom → [from, to) as Manila midnights", () => {
    expect(resolveStoreCommissionPeriod("today", null, null, now)).toEqual({
      fromIso: "2026-10-14T16:00:00.000Z",
      toIso: "2026-10-15T16:00:00.000Z",
    });
    expect(resolveStoreCommissionPeriod("this_week", null, null, now).fromIso).toBe("2026-10-11T16:00:00.000Z");
    expect(resolveStoreCommissionPeriod("this_month", null, null, now).fromIso).toBe("2026-09-30T16:00:00.000Z");
    expect(resolveStoreCommissionPeriod("custom", "2026-10-01", "2026-10-10", now)).toEqual({
      fromIso: "2026-09-30T16:00:00.000Z",
      toIso: "2026-10-10T16:00:00.000Z",
    });
  });

  it("an order at 00:30 Manila belongs to that Manila day, not the previous UTC day", () => {
    const lateUtc = new Date("2026-10-15T17:00:00Z"); // 2026-10-16 01:00 Manila (Friday)
    expect(resolveStoreCommissionPeriod("today", null, null, lateUtc).fromIso).toBe("2026-10-15T16:00:00.000Z");
    expect(resolveStoreCommissionPeriod("this_month", null, null, new Date("2026-10-31T16:30:00Z")).fromIso).toBe(
      "2026-10-31T16:00:00.000Z"
    );
    expect(formatManilaDateTime("2026-10-15T16:30:00Z")).toBe("2026-10-16 00:30");
    expect(formatManilaDateTime(null)).toBe("—");
  });

  it("SQL buckets use the same Manila calendar", () => {
    const body = fn("store_commission_breakdown");
    expect(body).toContain("AT TIME ZONE 'Asia/Manila'");
    expect(body).toContain("'YYYY-MM-DD'");
    expect(body).toContain("'YYYY-MM'");
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
    // Stage 2-B (D-2 option A): gift money is paid on the gift rail — Coin = platform coupon only.
    expect(platformHeldSaleAmountPhp({ gift_redemption_amount: 300, platform_funded_amount: 50 })).toBe(50);
  });
});

describe("H. platform payable = only platform-held money (legacy snapshots are not payouts)", () => {
  it("payable = held − gift rail − coin; direct (COD/GCash) is never payable", () => {
    const body = fn("store_platform_payable_page");
    // gift redemptions with a live redemption row are owed on the gift-certificate rail, not here
    expect(body).toContain("held_php - gift_rail_php AS rail_free_held_php");
    expect(body).toContain("NOT coalesce(r.reversed, false)");
    expect(body).toContain("rail_free_held_php - LEAST(rail_free_held_php, coin_minted) AS payable_php");
    expect(body).toContain("'gift_rail'");
    expect(body).toContain("class IN ('payable', 'legacy_manual_paid')");
    expect(body).toContain("'direct_collected'");
    expect(body).toContain("'legacy_manual_paid'");
    expect(body).toContain("legacy_open_settlement_php");
  });

  it("new read functions are service_role only", () => {
    for (const f of ["store_commission_breakdown", "store_platform_payable_page"]) {
      expect(MIG).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC`));
      expect(MIG).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role`));
    }
  });

  it("legacy waived rows on non-cancelled orders keep a distinct trigger (no fake cancel/refund)", () => {
    expect(MIG).toContain("'legacy_other'");
    expect(MIG).toContain("store_commission_adjustments_legacy_trigger_chk");
  });

  it("no admin/owner screen treats legacy scheduled settlements as a payout queue", () => {
    for (const p of [
      "lib/admin/finance-control-plane/load-finance-control-plane.ts",
      "lib/admin/domain-dashboard/load-delivery-domain-dashboard.ts",
      "lib/admin-business/load-admin-business-list.ts",
      "lib/admin-business/load-business-control-center-detail.ts",
      "lib/admin-business/load-business-cc-kpi.ts",
    ]) {
      const src = read(p);
      expect(src, p).not.toContain("settlement_status=scheduled");
      expect(src, p).not.toMatch(/\.in\("settlement_status", \[[^\]]*"scheduled"/);
    }
    expect(read("lib/admin/finance-control-plane/load-finance-control-plane.ts")).toContain("loadStorePlatformPayable(");
    expect(read("app/api/admin/stats/delivery-operations/route.ts")).toContain("loadStorePlatformPayable(");
  });

  it("payable routes: admin permission gate / owner store gate", () => {
    expect(read("app/api/admin/store-commission-ledger/payable/route.ts")).toContain('requireAdminPermission("business")');
    const owner = read("app/api/me/stores/[storeId]/commission-ledger/payable/route.ts");
    expect(owner).toContain("getStoreIfOwner(sb, userId, sid)");
    expect(owner).toContain("storeIds: [sid]");
  });

  it("Admin and Owner render the same payable + breakdown components", () => {
    for (const p of ["components/admin/stores/AdminStoreCommissionLedgerPage.tsx", "components/business/owner/OwnerStoreSettlementsView.tsx"]) {
      const src = read(p);
      expect(src, p).toContain("PlatformPayableSummaryGrid");
      expect(src, p).toContain("PlatformPayableTable");
      expect(src, p).toContain("CommissionBreakdownTable");
    }
  });
});

describe("I. settlement UI/CTA SSOT (Admin = Owner components, exceptions-only manual work)", () => {
  const baseRow = {
    obligationId: "ob1",
    orderId: "o1",
    orderNo: "S0QA1",
    orderStatus: "cancelled",
    paymentMethod: "gcash",
    storeId: "s1",
    storeName: "QA",
    chargeStage: "preparing" as const,
    chargedAt: "2026-10-10T03:05:00Z",
    commissionBasePhp: 3000,
    feePercent: 7,
    feeBreakdown: null,
    feeChargedMinor: 21000,
    feePaidMinor: 0,
    feeOutstandingMinor: 21000,
    state: "outstanding" as const,
    adjustmentStatus: "kept" as const,
    adjustmentTrigger: "cancelled" as const,
    reviewFlaggedAt: "2026-10-10T03:06:00Z",
    decision: null,
  };
  const decision = (d: "approve" | "reject") => ({
    id: "a1",
    decision: d,
    approvedMinor: d === "approve" ? 1000 : 0,
    cashRefundMinor: 0,
    outstandingCancelMinor: d === "approve" ? 1000 : 0,
    reason: "qa",
    adminUserId: "u1",
    decidedAt: "2026-10-17T00:00:00Z",
  });

  it("row tone: decision outranks state (a rejected row that still owes fee is 'rejected', not plain unpaid)", async () => {
    const { commissionRowTone } = await import("@/components/stores/commission/StoreCommissionLedgerTable");
    expect(commissionRowTone({ ...baseRow, state: "review_required", adjustmentStatus: "review_required" })).toBe("review");
    expect(commissionRowTone({ ...baseRow, decision: decision("reject") })).toBe("rejected");
    expect(commissionRowTone({ ...baseRow, decision: decision("approve") })).toBe("approved");
    expect(commissionRowTone({ ...baseRow, state: "charged", adjustmentStatus: "none", adjustmentTrigger: null })).toBe("normal");
    expect(commissionRowTone({ ...baseRow, decision: decision("approve") }, new Set(["ob1"]))).toBe("anomaly");
  });

  it("tabs: A 전체 거래 · B 취소·환불 검토 · C 매장 캐시 · D 금융 예외 · 플랫폼 지급 의무; legacy tab names still resolve", async () => {
    const { resolveCommissionTab, tabLedgerState } = await import("@/components/stores/commission/StoreCommissionLedgerParts");
    const all = ["ledger", "review", "cash", "exceptions", "payable"] as const;
    expect(resolveCommissionTab("decided", all)).toEqual({ tab: "review", review: "decided" });
    expect(resolveCommissionTab("overview", all)).toEqual({ tab: "cash", review: null });
    expect(resolveCommissionTab("exceptions", ["ledger", "review", "cash", "payable"])).toEqual({ tab: null, review: null });
    expect(tabLedgerState("review", "all", "rejected")).toBe("rejected");
    expect(tabLedgerState("ledger", "outstanding", "rejected")).toBe("outstanding");
  });

  it("decision views are SQL filters (approved incl. legacy auto reversal / rejected)", () => {
    const body = fn("store_commission_ledger_page");
    expect(body).toContain("p_state = 'approved' AND adj_decision IN ('approve', 'legacy_auto')");
    expect(body).toContain("p_state = 'rejected' AND adj_decision = 'reject'");
    expect(fn("store_platform_payable_page")).toContain("WHEN 'exceptions' THEN coin_over_credit > 0 OR class = 'legacy_manual_paid'");
  });

  it("no manual settle/pay CTA on normal orders; decide only on rows in review; legacy queue links land on payable with a notice", () => {
    const admin = read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx");
    expect(admin).toContain('r.state === "review_required" ? (');
    // no CTA label for per-order settlement (the legacy notice may *mention* the retired queue)
    expect(admin).not.toMatch(/pickCommissionCopy\(\s*lang,\s*"(정산 검토|정산 완료|지급 완료|지급 처리)"/);
    expect(admin).not.toMatch(/markPaid|mark_paid|settlement_status: "paid"/);
    expect(admin).toContain('const LEGACY_QUEUE_PARAMS = ["unpaid_only", "settlement_status", "id"] as const;');
    expect(admin).toContain('legacyQueueLink ? "payable"');
    expect(admin).toContain("idempotencyKey: newKey()");
    expect(admin).toContain("busyRef.current");
  });

  it("Owner uses the same table + detail panel, read-only (no decision endpoint, no CTA)", () => {
    const owner = read("components/business/owner/OwnerStoreSettlementsView.tsx");
    expect(owner).toContain("CommissionLedgerTable");
    expect(owner).toContain("CommissionOrderDetailPanel");
    expect(owner).not.toContain("renderAction");
    expect(owner).not.toContain("/adjustments");
    const admin = read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx");
    expect(admin).toContain("CommissionLedgerTable");
    expect(admin).toContain("CommissionOrderDetailPanel");
  });

  it("row colours use design tokens (light + dark), never raw palette classes", () => {
    const table = read("components/stores/commission/StoreCommissionLedgerTable.tsx");
    for (const t of ["bg-sam-warning-soft", "bg-sam-success-soft", "bg-sam-danger-soft"]) expect(table).toContain(t);
    expect(table).not.toMatch(/bg-(amber|emerald|red|green|yellow)-\d/);
  });
});
