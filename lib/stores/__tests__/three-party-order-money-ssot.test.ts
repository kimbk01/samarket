import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUYER_HIDDEN_STORE_ORDER_FIELDS,
  buyerPaidAmountPhp,
  stripStoreInternalOrderFields,
} from "@/lib/stores/buyer-store-order-money";
import { buildBuyerStoreOrderDetailResponseBody } from "@/lib/stores/store-order-detail-snapshot-assemble";
import { buyerStoreOrdersListFromPayload } from "@/lib/delivery/customer/buyer-store-orders-list-snapshot-assemble";
import { ownerOrderFinanceHref } from "@/lib/finance/deep-links";
import { getSupportCategoryDefinition } from "@/lib/support/support-category-registry";
import { mypageComponentsMessages } from "@/lib/i18n/catalog/mypage-components";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** A raw store_orders row as the buyer snapshot RPCs return it (to_jsonb(o.*)). */
const RAW = {
  id: "o1",
  order_no: "SO1",
  order_status: "accepted",
  payment_status: "paid",
  buyer_payment_method: "gcash",
  payment_amount: 450,
  gift_redemption_amount: 100,
  discount_amount: 50,
  amount_before_gift: 550,
  admin_locked: false,
  needs_admin_attention: false,
  sla_warning_level: null,
  // store-internal / admin-only
  admin_note: "internal ops note",
  admin_flagged: true,
  dispute_status: "open",
  commission_base_amount: 600,
  store_funded_amount: 0,
  platform_funded_amount: 50,
  funding_mode: "platform",
  merchant_revenue_amount: 600,
};

function expectNoInternal(o: Record<string, unknown>) {
  for (const k of BUYER_HIDDEN_STORE_ORDER_FIELDS) expect(o, k).not.toHaveProperty(k);
}

describe("buyer sees only customer payment facts (same order → same customer numbers everywhere)", () => {
  it("strip keeps customer + status fields the buyer UI uses, drops store-internal/admin fields", () => {
    const o = stripStoreInternalOrderFields(RAW);
    expectNoInternal(o);
    for (const k of ["payment_amount", "gift_redemption_amount", "discount_amount", "amount_before_gift", "buyer_payment_method", "payment_status", "admin_locked", "needs_admin_attention", "sla_warning_level"]) {
      expect(o).toHaveProperty(k);
    }
  });

  it("buyer list API rows are stripped", () => {
    const rows = buyerStoreOrdersListFromPayload({ ok: true, orders: [{ ...RAW, items: [] }] });
    expect(rows).toHaveLength(1);
    expectNoInternal(rows[0] as Record<string, unknown>);
    expect(rows[0]).toMatchObject({ payment_amount: 450, gift_redemption_amount: 100 });
  });

  it("buyer detail API order is stripped", () => {
    const body = buildBuyerStoreOrderDetailResponseBody({
      order: RAW,
      items: [],
      store: { store_name: "S", slug: "s", owner_user_id: "u" },
      delivery: null,
      review: null,
      reviewsUnavailable: false,
    });
    expectNoInternal(body.order);
    expect(body.order).toMatchObject({ payment_amount: 450, buyer_payment_method: "gcash" });
  });

  it("list card amount = what the customer pays (= detail 총액), never store revenue / coupon funding", () => {
    expect(buyerPaidAmountPhp(RAW)).toBe(450);
    expect(buyerPaidAmountPhp({ payment_amount: null })).toBe(0);
    const view = read("components/mypage/MyStoreOrdersView.tsx");
    expect(view).toContain("const displayOrderAmount = buyerPaidAmountPhp(o);");
    expect(view).toContain("const contextPaymentAmount = buyerPaidAmountPhp(args.order);");
    expect(view).not.toMatch(/merchant_revenue_amount|platform_funded_amount/);
  });

  it("buyer copy never mixes store settlement / fee terms with the customer refund", () => {
    const ko = (mypageComponentsMessages as unknown as { ko: Record<string, string> }).ko;
    const keys = Object.keys(ko).filter((k) => /^mypage_comp_(pay_method_|cancel_|refund_)/.test(k));
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) expect(ko[k], k).not.toMatch(/정산|수수료|캐시|미납|환급/);
  });
});

describe("owner finance CTAs land on real screens", () => {
  const settlements = read("components/business/owner/OwnerStoreSettlementsView.tsx");

  it("Cash top-up goes to the top-up form section", () => {
    expect(settlements).toContain('href={ownerFinanceSectionHref(storeId, "convert")}');
  });

  it("finance outstanding rows deep-link to the fee detail (order_no + open), which the ledger opens", () => {
    const finance = read("components/business/owner/OwnerStoreFinanceView.tsx");
    expect(finance).toContain("order_no: r.orderNo");
    expect(finance).toContain("open: r.id");
    expect(finance).not.toContain("orderId=${encodeURIComponent(r.orderId)}");
    expect(read("app/api/me/stores/[storeId]/finance/route.ts")).toContain("store_orders(order_no)");
    expect(settlements).toContain('searchParams.get("order_no")');
    expect(settlements).toContain("r.obligationId === openParam");
  });

  it("owner can ask about / dispute a fee (support, referenced to the order); no decision CTA", () => {
    expect(settlements).toContain('category: "SETTLEMENT"');
    expect(settlements).toContain('referenceType: "STORE_ORDER"');
    expect(settlements).not.toMatch(/admin_decide_store_commission_adjustment|수수료 결정/);
    expect(getSupportCategoryDefinition("SETTLEMENT")?.allowedReferenceTypes).toContain("STORE_ORDER");
  });

  it("owner order finance href points at an existing route", () => {
    const href = ownerOrderFinanceHref("store-1", "order-9");
    expect(href.startsWith("/stores/owner/orders?")).toBe(true);
    expect(href).toContain("order-9");
    expect(href).not.toMatch(/\/stores\/owner\/orders\/order-9/);
  });
});

describe("legacy UI/UX/CTA contracts (no dark mode — legacy backgrounds kept)", () => {
  const admin = read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx");
  const parts = read("components/stores/commission/StoreCommissionLedgerParts.tsx");
  const table = read("components/stores/commission/StoreCommissionLedgerTable.tsx");
  const owner = read("components/business/owner/OwnerStoreSettlementsView.tsx");
  const buyer = read("components/mypage/MyStoreOrderDetailView.tsx");

  it("admin decision / gate dialogs use the legacy DibayDialog with risk-toned confirm", () => {
    expect(admin).toContain('import { DibayDialog } from "@/components/ui/dibay-overlay";');
    expect(admin.match(/<DibayDialog/g)?.length).toBe(2);
    expect(admin).toContain('roleTone: modal.decision === "approve" ? "primary" : "destructive"');
    expect(admin).toContain("loading: busy");
    expect(admin).not.toContain('className="fixed inset-0 z-50');
    expect(admin).toContain('pickCommissionCopy(lang, "이전", "Back")');
  });

  it("admin keeps the console background (no full-bleed page background override)", () => {
    expect(admin).toContain('<div className="min-w-0 space-y-4" data-commission-admin="1">');
    expect(admin).not.toMatch(/-m-4 min-h-full/);
    expect(read("components/admin/inbox/AdminInboxPageClient.tsx")).toContain('<div className="space-y-4 p-4 md:p-6" data-testid="admin-inbox-page">');
  });

  it("controls have touch + pressed feedback; rows are keyboard/touch operable", () => {
    expect(parts).toContain("active:scale-[0.97]");
    expect(parts).toContain("export const ROW_ACTION_BTN");
    expect(table).toContain("active:opacity-75");
    expect(table).toContain('e.key === "Enter"');
    expect(table).toContain("e.stopPropagation()");
    expect(table).toContain("sam-btn sam-btn--cancel");
  });

  it("owner CTAs use the legacy OwnerCta contract and close the panel before the support sheet", () => {
    expect(owner).toContain("className={OwnerCta.primary}");
    expect(owner).not.toMatch(/OwnerCta\.\w+\}?\s*active:/); // no screen-local press patches
    expect(owner).toContain("OwnerCta.secondary");
    expect(owner).toContain("OwnerCta.tertiary");
    expect(owner.indexOf("setSelected(null);")).toBeLessThan(owner.indexOf('sourceSurface: "owner_commission_order"'));
  });

  it("buyer detail separates payment method from payment status", () => {
    expect(buyer).toContain('data-buyer-payment-method="1"');
    expect(buyer).toContain('data-buyer-payment-status="1"');
    expect(buyer).toContain("paymentStatusLabel(t, order.payment_status)");
    expect(buyer).not.toContain("paymentMethodLabel");
    const ko = (mypageComponentsMessages as unknown as { ko: Record<string, string> }).ko;
    expect(ko.mypage_comp_payment_method_section).toBe("결제 수단");
    expect(ko.mypage_comp_payment_status_section).toBe("결제 상태");
  });
});
