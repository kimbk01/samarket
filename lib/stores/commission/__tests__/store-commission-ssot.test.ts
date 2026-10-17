import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeStoreCashPosition,
  formatCashMinorSigned,
  normalizeStoreCashOrderGateMode,
  resolveStoreCommissionRowState,
  STORE_COMMISSION_CHARGE_STATUS,
} from "@/lib/stores/commission/store-commission-contract";
import {
  projectStoreCommissionRow,
  summarizeStoreCommissionRows,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { platformHeldSaleAmountPhp } from "@/lib/currency/recognize-order-currency-on-completed";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const MIG = read("supabase/migrations/20270510120000_store_commission_cash_ssot.sql");

describe("cash position = DB gate rule", () => {
  it("net = balance − outstanding and goes negative", () => {
    const p = computeStoreCashPosition({ storeId: "s", balanceMinor: 0, outstandingMinor: 3800, gateMode: "off" });
    expect(p.netMinor).toBe(-3800);
    expect(p.orderable).toBe(true); // gate off → still orderable
  });

  it("gate on: net <= 0 blocks, net > 0 opens", () => {
    const g = "block_when_not_positive" as const;
    expect(computeStoreCashPosition({ storeId: "s", balanceMinor: 0, outstandingMinor: 0, gateMode: g }).orderable).toBe(false);
    expect(computeStoreCashPosition({ storeId: "s", balanceMinor: 100, outstandingMinor: 500, gateMode: g }).orderable).toBe(false);
    expect(computeStoreCashPosition({ storeId: "s", balanceMinor: 100, outstandingMinor: 0, gateMode: g }).orderable).toBe(true);
  });

  it("DB uses the same rule and setting key", () => {
    expect(MIG).toContain("'orderable', (v_mode = 'off' OR v_net > 0)");
    expect(MIG).toContain("key = 'store_cash_order_gate'");
    expect(MIG).toContain("BEFORE INSERT ON public.store_orders");
    expect(MIG).toContain("RAISE EXCEPTION 'store_cash_insufficient'");
  });

  it("unknown gate value is off", () => {
    expect(normalizeStoreCashOrderGateMode("x")).toBe("off");
    expect(normalizeStoreCashOrderGateMode("block_when_not_positive")).toBe("block_when_not_positive");
  });

  it("negative net renders with an explicit minus", () => {
    expect(formatCashMinorSigned(-3800, (php) => `₱${php.toFixed(2)}`)).toBe("-₱38.00");
    expect(formatCashMinorSigned(3800, (php) => `₱${php.toFixed(2)}`)).toBe("₱38.00");
  });
});

describe("commission timing and manual refunds", () => {
  it("charge point is 조리 시작 (preparing)", () => {
    expect(STORE_COMMISSION_CHARGE_STATUS).toBe("preparing");
  });

  it("cancel/refund never auto-reverses; admin RPC is the only reversal path", () => {
    expect(MIG).toContain("FUNCTION public.flag_store_commission_review");
    expect(MIG).toContain("FUNCTION public.admin_resolve_store_commission_adjustment");
    expect(MIG).toMatch(/admin_resolve_store_commission_adjustment[\s\S]*reverse_sale_fee_for_order/);
    expect(MIG).toContain("NOT public.is_platform_admin(p_admin_user_id)");
    expect(MIG).toContain("'note_required'");
    const transition = read("lib/stores/apply-store-order-status-transition.ts");
    expect(transition).not.toContain("reverseSaleFeeForOrder");
  });

  it("same idempotency key at preparing and completed → one charge per order", () => {
    const writer = read("lib/stores/commission/store-commission-writer.ts");
    expect(writer).toContain("p_idempotency_key: saleFeeIdempotencyKeyForOrder(quote.orderId)");
    expect(MIG).toContain("PERFORM 1 FROM public.store_orders WHERE id = p_order_id FOR UPDATE");
  });

  it("row state precedence: review > refunded > outstanding > charged", () => {
    expect(resolveStoreCommissionRowState({ status: "open", adjustmentStatus: "review_required", feeOutstandingMinor: 10 })).toBe("review_required");
    expect(resolveStoreCommissionRowState({ status: "waived", adjustmentStatus: "refunded", feeOutstandingMinor: 0 })).toBe("refunded");
    expect(resolveStoreCommissionRowState({ status: "waived", adjustmentStatus: "none", feeOutstandingMinor: 0 })).toBe("refunded");
    expect(resolveStoreCommissionRowState({ status: "open", adjustmentStatus: "kept", feeOutstandingMinor: 10 })).toBe("outstanding");
    expect(resolveStoreCommissionRowState({ status: "settled", adjustmentStatus: "kept", feeOutstandingMinor: 0 })).toBe("kept");
    expect(resolveStoreCommissionRowState({ status: "open", adjustmentStatus: "none", feeOutstandingMinor: 10 })).toBe("outstanding");
    expect(resolveStoreCommissionRowState({ status: "settled", adjustmentStatus: "none", feeOutstandingMinor: 0 })).toBe("charged");
  });
});

describe("ledger summary reconciles (Admin = Owner)", () => {
  const base = {
    store_id: "s1",
    confirmed_revenue_php: 1000,
    created_at: "2026-10-01T00:00:00Z",
    charge_stage: "preparing",
  };
  const rows = [
    // fully paid from Cash
    projectStoreCommissionRow({ ...base, id: "a", order_id: "o1", fee_due_minor: 5000, fee_paid_minor: 5000, fee_outstanding_minor: 0, status: "settled", original_fee_due_minor: 5000 }, undefined, "S"),
    // partly unpaid (Cash short)
    projectStoreCommissionRow({ ...base, id: "b", order_id: "o2", fee_due_minor: 5000, fee_paid_minor: 1200, fee_outstanding_minor: 3800, status: "open", original_fee_due_minor: 5000 }, undefined, "S"),
    // refunded by admin: reverse zeroes fee_* columns, adjustment columns keep the amounts
    projectStoreCommissionRow(
      {
        ...base,
        id: "c",
        order_id: "o3",
        fee_due_minor: 0,
        fee_paid_minor: 0,
        fee_outstanding_minor: 0,
        status: "waived",
        adjustment_status: "refunded",
        adjustment_cash_refunded_minor: 3000,
        adjustment_outstanding_cancelled_minor: 2000,
        original_fee_due_minor: 5000,
      },
      undefined,
      "S"
    ),
    // in review
    projectStoreCommissionRow({ ...base, id: "d", order_id: "o4", fee_due_minor: 5000, fee_paid_minor: 5000, fee_outstanding_minor: 0, status: "settled", adjustment_status: "review_required", original_fee_due_minor: 5000 }, undefined, "S"),
  ];

  it("charged = paid + unpaid + refunded + cancelled", () => {
    const s = summarizeStoreCommissionRows(rows);
    expect(s.feeChargedMinor).toBe(20000);
    expect(s.feePaidMinor).toBe(11200);
    expect(s.feeOutstandingMinor).toBe(3800);
    expect(s.cashRefundedMinor).toBe(3000);
    expect(s.outstandingCancelledMinor).toBe(2000);
    expect(s.netCommissionMinor).toBe(15000);
    expect(s.reviewCount).toBe(1);
    expect(s.reconciles).toBe(true);
  });

  it("Admin and Owner routes share one loader", () => {
    expect(read("app/api/admin/store-commission-ledger/route.ts")).toContain("loadStoreCommissionLedger(");
    expect(read("app/api/me/stores/[storeId]/commission-ledger/route.ts")).toContain("loadStoreCommissionLedger(");
    expect(read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx")).toContain("CommissionSummaryGrid");
    expect(read("components/business/owner/OwnerStoreSettlementsView.tsx")).toContain("CommissionSummaryGrid");
  });
});

describe("Coin = platform-held only (buyer pays the store directly)", () => {
  it("COD/GCash payment_amount is never minted", () => {
    expect(platformHeldSaleAmountPhp({ gift_redemption_amount: 0, platform_funded_amount: 0 })).toBe(0);
    expect(platformHeldSaleAmountPhp({ gift_redemption_amount: 300, platform_funded_amount: 50 })).toBe(350);
  });
});
