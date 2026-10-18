import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildAdminOrderMoney,
  mapAdminOrderItem,
  parseOrderItemOptions,
  representativeItemLabel,
  type AdminOrderGiftLedger,
} from "@/lib/admin/store-orders/admin-store-order-detail-contract";
import {
  describeStoreOrderAudit,
  STORE_ORDER_AUDIT_ACTION_LABEL,
} from "@/lib/admin/store-orders/admin-store-order-audit-labels";

const order = (o: Record<string, unknown>) => ({
  total_amount: 0,
  discount_amount: 0,
  payment_amount: 0,
  gift_redemption_amount: 0,
  platform_funded_amount: 0,
  store_funded_amount: 0,
  delivery_fee_amount: 0,
  order_status: "completed",
  ...o,
});
const gift = (g: Partial<AdminOrderGiftLedger>): AdminOrderGiftLedger => ({ rows: 1, redeemed: 0, reversed: false, forfeited: 0, ...g });

describe("money SSOT (production exception groups, docs §2-3)", () => {
  it("normal order reconciles: total − coupon − gift = paid, commission base = paid + gift + platform", () => {
    const m = buildAdminOrderMoney(
      order({ total_amount: 1000, discount_amount: 100, platform_funded_amount: 60, store_funded_amount: 40, gift_redemption_amount: 200, payment_amount: 700 }),
      [],
      gift({ redeemed: 200 })
    );
    expect(m.consistent).toBe(true);
    expect(m.mismatches).toEqual([]);
    expect(m.commissionBase).toBe(700 + 200 + 60);
    expect(m.giftSource).toBe("ledger");
  });

  it("E1-a SO (refunded): gift only in the ledger → shown from ledger, flagged, amounts reconcile", () => {
    const m = buildAdminOrderMoney(
      order({ total_amount: 2000, payment_amount: 1000, order_status: "refunded" }),
      [],
      gift({ redeemed: 1000, reversed: true })
    );
    expect(m.giftAmount).toBe(1000);
    expect(m.consistent).toBe(true);
    expect(m.mismatches).toEqual(["gift_not_on_order"]);
  });

  it("E1-b OT (open order, gift reversed) → red ledger mismatch, never shown as normal", () => {
    const m = buildAdminOrderMoney(
      order({ total_amount: 1260, payment_amount: 260, order_status: "pending" }),
      [],
      gift({ redeemed: 1000, reversed: true, forfeited: 1000 })
    );
    expect(m.mismatches).toEqual(["gift_not_on_order", "gift_reversed_order_open"]);
    expect(m.customerPaid).toBe(260);
  });

  it("E2 LC (gift recorded, not deducted) → gift_not_deducted, values kept as recorded", () => {
    const m = buildAdminOrderMoney(
      order({ total_amount: 2000, gift_redemption_amount: 600, payment_amount: 2000 }),
      [],
      gift({ redeemed: 600 })
    );
    expect(m.consistent).toBe(false);
    expect(m.mismatches).toEqual(["gift_not_deducted"]);
    expect(m.customerPaid).toBe(2000);
  });
});

describe("item snapshot", () => {
  const snap = {
    v: 2,
    groups: [{ label: "공기밥옵션", lines: [{ qty: 1, name: "공기밥", price_delta_each: 100 }] }],
    summary: "공기밥옵션: 공기밥 (+₱100)",
  };
  it("parses v2 option lines with per-unit surcharge (legacy UI showed +0)", () => {
    expect(parseOrderItemOptions(snap).lines).toEqual([{ group: "공기밥옵션", name: "공기밥", qty: 1, unitDelta: 100 }]);
  });
  it("maps unit = base + option delta and keeps the snapshot subtotal", () => {
    const it = mapAdminOrderItem({
      id: "i1",
      product_title_snapshot: "양념치킨",
      qty: 2,
      price_snapshot: 250,
      base_price_snapshot: 150,
      options_unit_delta_snapshot: 100,
      subtotal: 500,
      options_snapshot_json: snap,
    });
    expect(it).toMatchObject({ unitPrice: 250, basePrice: 150, optionUnitDelta: 100, subtotal: 500 });
  });
  it("representative label: 외 N개 = other line count; no items is explicit", () => {
    expect(representativeItemLabel("양념치킨", 3, true)).toBe("양념치킨 외 2개");
    expect(representativeItemLabel("양념치킨", 1, true)).toBe("양념치킨");
    expect(representativeItemLabel(null, 0, true)).toBe("상품 내역 없음");
  });
});

describe("audit wording", () => {
  it("maps every store_order.* action written in app/ and lib/", () => {
    const out = execSync(`grep -rhoE --exclude-dir=__tests__ '"store_order\\.[a-z_.]+"' app lib --include=*.ts`, { cwd: resolve(process.cwd()) })
      .toString()
      .split("\n")
      .map((l) => l.replace(/"/g, "").trim())
      .filter(Boolean);
    const missing = [...new Set(out)].filter((a) => !STORE_ORDER_AUDIT_ACTION_LABEL[a.slice("store_order.".length)]);
    expect(missing).toEqual([]);
  });
  it("QA records are separated; unknown actions stay visible with the raw name", () => {
    expect(describeStoreOrderAudit({ action: "fin_ssot_completed" }, true).category).toBe("qa");
    const u = describeStoreOrderAudit({ action: "store_order.something_new", actor_type: "user" }, true);
    expect(u).toMatchObject({ known: false, category: "other" });
    expect(u.label).toContain("store_order.something_new");
  });
  it("extracts status change and reason", () => {
    const v = describeStoreOrderAudit(
      { action: "store_order.admin_intervention", before_json: { order_status: "refund_requested" }, after_json: { order_status: "refunded", reason: "고객 요청" } },
      true
    );
    expect(v).toMatchObject({ label: "관리자 예외 개입", fromStatus: "refund_requested", toStatus: "refunded", reason: "고객 요청" });
  });
});

describe("intervention panel", () => {
  it("refund approval and admin cancel require typing the order number again", () => {
    const src = readFileSync(resolve(process.cwd(), "components/admin/delivery-orders/AdminStoreOrderInterventionPanel.tsx"), "utf8");
    expect(src).toContain('new Set<AdminStoreOrderInterventionAction>(["refund_approve", "force_cancel"])');
    expect(src).toContain("typed.trim() !== orderNo");
  });
});
