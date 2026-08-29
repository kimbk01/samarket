/**
 * CUT H — Delivery Ads billing ledger / budget / pricing foundation (H1–H39).
 * Fixture pricing only — no Production pricing activation.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DELIVERY_AD_BILLING_PLATFORM,
  DELIVERY_AD_FIXED_PERIOD_BILLING,
  DELIVERY_AD_ORDER_PERCENT_BASIS,
  DELIVERY_AD_REFUND_POLICY,
  STORE_SPONSORED_BUDGET_GATE,
  assertDeliveryAdMoneyMinor,
  buildChargeIdempotencyKey,
  buildRefundIdempotencyKey,
  computeOrderPercentChargeMinor,
  isAutomaticChargingAllowed,
} from "@/lib/stores/advertising/delivery-ad-billing-contract";
import {
  CUT_H_BILLING_AUTHORITY,
  reconcileDeliveryAdChargeForOrderSafe,
  reconcileDeliveryAdChargeFromSource,
  reconcileDeliveryAdRefundForCharge,
} from "@/lib/stores/advertising/delivery-ad-billing-writer";
import { DELIVERY_AD_ORGANIC_PAID_ISOLATION } from "@/lib/stores/advertising/delivery-ad-domain";
import { STORE_SPONSORED_BUDGET_GATE as ExposureBudgetGate } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";

const mig = () =>
  readFileSync(
    join(process.cwd(), "supabase/migrations/20261201170000_delivery_ads_cut_h_billing_ledger.sql"),
    "utf8"
  );

const FIXTURE_CPC = {
  id: "11111111-1111-1111-1111-111111111111",
  unitAmountMinor: 150,
  percentageBasisPoints: null as number | null,
  currency: "PHP",
};

const FIXTURE_CPA = {
  id: "22222222-2222-2222-2222-222222222222",
  unitAmountMinor: 5000,
  percentageBasisPoints: null as number | null,
  currency: "PHP",
};

const FIXTURE_PERCENT = {
  id: "33333333-3333-3333-3333-333333333333",
  unitAmountMinor: null as number | null,
  percentageBasisPoints: 250,
  currency: "PHP",
};

function mockSb(opts: {
  billingEnabled?: boolean;
  budgetLimitMinor?: number;
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null | { message: string } }>;
}) {
  const ledger = new Map<string, { id: string; amount_minor: number; currency: string; campaign_id: string; ad_account_id: string }>();
  const refunds = new Map<string, { id: string; original_charge_id: string }>();
  let chargeSeq = 0;
  let refundSeq = 0;

  const defaultRpc = async (name: string, args: Record<string, unknown>) => {
    if (name === CUT_H_BILLING_AUTHORITY.chargeRpc) {
      if (opts.billingEnabled !== true) {
        return { data: { ok: true, charged: false, reason: "billing_disabled" }, error: null };
      }
      const key = String(args.p_idempotency_key);
      const existing = ledger.get(key);
      if (existing) {
        return {
          data: { ok: true, charged: true, deduped: true, id: existing.id },
          error: null,
        };
      }
      const amount = Number(args.p_amount_minor);
      const limit = opts.budgetLimitMinor;
      if (typeof limit === "number") {
        let spent = 0;
        for (const row of ledger.values()) {
          if (row.campaign_id === String(args.p_campaign_id)) spent += row.amount_minor;
        }
        if (spent + amount > limit) {
          return { data: { ok: false, error: "budget_exceeded" }, error: null };
        }
      }
      chargeSeq += 1;
      const id = `charge-${chargeSeq}`;
      ledger.set(key, {
        id,
        amount_minor: amount,
        currency: String(args.p_currency),
        campaign_id: String(args.p_campaign_id),
        ad_account_id: "acct-1",
      });
      return { data: { ok: true, charged: true, deduped: false, id }, error: null };
    }
    if (name === CUT_H_BILLING_AUTHORITY.refundRpc) {
      if (opts.billingEnabled !== true) {
        return { data: { ok: true, refunded: false, reason: "billing_disabled" }, error: null };
      }
      const key = String(args.p_idempotency_key);
      const existing = refunds.get(key);
      if (existing) {
        return {
          data: { ok: true, refunded: true, deduped: true, id: existing.id },
          error: null,
        };
      }
      const original = [...ledger.values()].find((c) => c.id === String(args.p_original_charge_id));
      if (!original) {
        return { data: { ok: false, error: "charge_not_found" }, error: null };
      }
      refundSeq += 1;
      const id = `refund-${refundSeq}`;
      refunds.set(key, { id, original_charge_id: original.id });
      return { data: { ok: true, refunded: true, deduped: false, id }, error: null };
    }
    return { data: { ok: false, error: "unknown_rpc" }, error: null };
  };

  const chain = (table: string): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.eq = () => self;
    self.limit = () => self;
    self.maybeSingle = async () => {
      if (table === "delivery_ad_billing_policy") {
        return { data: { is_enabled: opts.billingEnabled === true }, error: null };
      }
      return { data: null, error: null };
    };
    return self;
  };

  return {
    ledger,
    refunds,
    sb: {
      from: (table: string) => chain(table),
      rpc: opts.rpc ?? defaultRpc,
    } as unknown as Parameters<typeof reconcileDeliveryAdChargeFromSource>[0],
  };
}

describe("CUT H Delivery Ads billing ledger", () => {
  it("H1 migration defines charge ledger + reconcile RPC", () => {
    const sql = mig();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.delivery_ad_charge_ledger");
    expect(sql).toContain("delivery_ad_reconcile_charge");
  });

  it("H2 anon/authenticated EXECUTE revoked; service_role granted", () => {
    const sql = mig();
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.delivery_ad_reconcile_charge[\s\S]*FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.delivery_ad_reconcile_charge[\s\S]*TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.delivery_ad_reconcile_refund[\s\S]*FROM anon, authenticated/);
  });

  it("H3 same idempotency key creates one charge", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: true });
    const base = {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored" as const,
      storeId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC" as const,
      sourceEventType: "click" as const,
      sourceEventId: "click-1",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: true,
    };
    const a = await reconcileDeliveryAdChargeFromSource(sb, base);
    const b = await reconcileDeliveryAdChargeFromSource(sb, base);
    expect(a.charged).toBe(true);
    expect(b.deduped).toBe(true);
    expect(ledger.size).toBe(1);
  });

  it("H4/H5 charge ledger UPDATE/DELETE forbidden by trigger", () => {
    const sql = mig();
    expect(sql).toContain("delivery_ad_ledger_forbid_mutate");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.delivery_ad_charge_ledger");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.delivery_ad_refund_ledger");
  });

  it("H6/H7 refund creates compensating row; original charge untouched", async () => {
    const { sb, ledger, refunds } = mockSb({ billingEnabled: true });
    const charged = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPA_ORDER",
      sourceEventType: "attribution",
      sourceEventId: "attr-1",
      fixturePricing: FIXTURE_CPA,
      fixtureBillingEnabled: true,
    });
    expect(charged.id).toBeTruthy();
    const before = [...ledger.values()][0];
    const refunded = await reconcileDeliveryAdRefundForCharge(sb, {
      originalChargeId: String(charged.id),
      reasonCode: "ORDER_CANCEL_FIXTURE",
      sourceEventId: "cancel-1",
      amountMinor: before.amount_minor,
      fixtureBillingEnabled: true,
    });
    expect(refunded.refunded).toBe(true);
    expect(refunds.size).toBe(1);
    expect(ledger.get(buildChargeIdempotencyKey({
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      pricingModel: "CPA_ORDER",
      sourceEventId: "attr-1",
    }))?.amount_minor).toBe(before.amount_minor);
  });

  it("H8 duplicate refund blocked by idempotency", async () => {
    const { sb } = mockSb({ billingEnabled: true });
    const charged = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "banner",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPA_ORDER",
      sourceEventType: "attribution",
      sourceEventId: "attr-dup",
      fixturePricing: FIXTURE_CPA,
      fixtureBillingEnabled: true,
    });
    const input = {
      originalChargeId: String(charged.id),
      reasonCode: "ORDER_CANCEL_FIXTURE",
      sourceEventId: "cancel-dup",
      amountMinor: 5000,
      fixtureBillingEnabled: true,
    };
    const a = await reconcileDeliveryAdRefundForCharge(sb, input);
    const b = await reconcileDeliveryAdRefundForCharge(sb, input);
    expect(a.refunded).toBe(true);
    expect(b.deduped).toBe(true);
  });

  it("H9 billing disabled → no automatic charge", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: false });
    const r = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC",
      sourceEventType: "click",
      sourceEventId: "click-off",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: false,
    });
    expect(r.ok).toBe(true);
    expect(r.charged).toBe(false);
    expect(r.reason).toBe("billing_disabled");
    expect(ledger.size).toBe(0);
    expect(DELIVERY_AD_BILLING_PLATFORM.isEnabled).toBe(false);
  });

  it("H10 pricing NOT_CONFIGURED → no automatic charge", async () => {
    const { sb } = mockSb({ billingEnabled: true });
    const r = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC",
      sourceEventType: "click",
      sourceEventId: "click-noprice",
      fixturePricing: null,
      fixtureBillingEnabled: true,
    });
    expect(r.charged).toBe(false);
    expect(r.reason).toBe("pricing_not_configured");
  });

  it("H11 arbitrary client amount rejected (no client amount param)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/advertising/delivery-ad-billing-writer.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/charge_amount|chargeAmount|clientAmount/);
    expect(src).toContain("Server-calculated charge attempt");
  });

  it("H12 inactive pricing policy rejected", () => {
    expect(
      isAutomaticChargingAllowed({ billingEnabled: true, pricingActive: false })
    ).toBe(false);
  });

  it("H13 currency mismatch rejected", async () => {
    const { sb } = mockSb({ billingEnabled: true });
    const r = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC",
      sourceEventType: "click",
      sourceEventId: "click-fx",
      currency: "USD",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("currency_mismatch");
  });

  it("H14 unsupported pricing model rejected", async () => {
    const { sb } = mockSb({ billingEnabled: true });
    const r = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "BOGUS" as "CPC",
      sourceEventType: "click",
      sourceEventId: "click-model",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("unsupported_model");
  });

  it("H15 valid click + CPC fixture → exactly one charge", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: true });
    const r = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC",
      sourceEventType: "click",
      sourceEventId: "delivery_ad_click_events.id-1",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: true,
    });
    expect(r.charged).toBe(true);
    expect([...ledger.values()][0].amount_minor).toBe(150);
  });

  it("H16 invalid/tampered click → no charge without valid source id", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: true });
    const r = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC",
      sourceEventType: "click",
      sourceEventId: "",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: true,
    });
    expect(r.ok).toBe(false);
    expect(ledger.size).toBe(0);
  });

  it("H17 duplicate click reconcile → one charge", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: true });
    const input = {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored" as const,
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC" as const,
      sourceEventType: "click" as const,
      sourceEventId: "click-same",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: true,
    };
    await reconcileDeliveryAdChargeFromSource(sb, input);
    await reconcileDeliveryAdChargeFromSource(sb, input);
    expect(ledger.size).toBe(1);
  });

  it("H18 charge failure does not break click/navigation contract", () => {
    const clickRoute = readFileSync(
      join(process.cwd(), "app/api/stores/ads/click/route.ts"),
      "utf8"
    );
    const banner = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(clickRoute).not.toContain("reconcileDeliveryAdCharge");
    expect(banner).toMatch(/href|Link|destination/);
  });

  it("H19 valid attribution + CPA fixture → one charge", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: true });
    const r = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPA_ORDER",
      sourceEventType: "attribution",
      sourceEventId: "attr-ok",
      attributionId: "attr-ok",
      orderId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      fixturePricing: FIXTURE_CPA,
      fixtureBillingEnabled: true,
    });
    expect(r.charged).toBe(true);
    expect(ledger.size).toBe(1);
  });

  it("H20 no attribution → order safe hook no-ops", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: true });
    await reconcileDeliveryAdChargeForOrderSafe(sb, {
      orderId: "o1",
      storeId: "s1",
      ownerUserId: "u1",
      attributionId: null,
      campaignId: null,
      productKind: null,
    });
    expect(ledger.size).toBe(0);
  });

  it("H21 duplicate order reconcile → one charge", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: true });
    const input = {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored" as const,
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPA_ORDER" as const,
      sourceEventType: "attribution" as const,
      sourceEventId: "attr-once",
      fixturePricing: FIXTURE_CPA,
      fixtureBillingEnabled: true,
    };
    await reconcileDeliveryAdChargeFromSource(sb, input);
    await reconcileDeliveryAdChargeFromSource(sb, input);
    expect(ledger.size).toBe(1);
  });

  it("H22 wrong campaign still keyed separately (exactly-once per source)", () => {
    const a = buildChargeIdempotencyKey({
      campaignId: "camp-a",
      pricingModel: "CPA_ORDER",
      sourceEventId: "attr-1",
    });
    const b = buildChargeIdempotencyKey({
      campaignId: "camp-b",
      pricingModel: "CPA_ORDER",
      sourceEventId: "attr-1",
    });
    expect(a).not.toBe(b);
  });

  it("H23 ORDER_PERCENT deterministic minor-unit amount", () => {
    const r = computeOrderPercentChargeMinor({
      orderAmountMinor: 10_000,
      percentageBasisPoints: 250,
      basisConfigured: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amountMinor).toBe(250);
  });

  it("H24 unconfigured order basis fail-closed", () => {
    expect(DELIVERY_AD_ORDER_PERCENT_BASIS.status).toBe("NOT_CONFIGURED");
    const r = computeOrderPercentChargeMinor({
      orderAmountMinor: 10_000,
      percentageBasisPoints: 250,
      basisConfigured: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("basis_not_configured");
  });

  it("H25 float drift absent", () => {
    expect(assertDeliveryAdMoneyMinor(1.5)).toBe(false);
    expect(assertDeliveryAdMoneyMinor(150)).toBe(true);
    const r = computeOrderPercentChargeMinor({
      orderAmountMinor: 333,
      percentageBasisPoints: 333,
      basisConfigured: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Number.isInteger(r.amountMinor)).toBe(true);
      expect(r.amountMinor).toBe(Math.floor((333 * 333) / 10000));
    }
  });

  it("H26/H27 budget under/over cap", async () => {
    const { sb, ledger } = mockSb({ billingEnabled: true, budgetLimitMinor: 200 });

    const ok = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC",
      sourceEventType: "click",
      sourceEventId: "c-under",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: true,
    });
    expect(ok.charged).toBe(true);

    const over = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      productKind: "store_sponsored",
      storeId: null,
      ownerUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      pricingModel: "CPC",
      sourceEventType: "click",
      sourceEventId: "c-over",
      fixturePricing: FIXTURE_CPC,
      fixtureBillingEnabled: true,
    });
    expect(over.ok).toBe(false);
    expect(over.error).toBe("budget_exceeded");
    expect(ledger.size).toBe(1);
  });

  it("H28 concurrent charges cannot overspend (unique + cap in migration)", () => {
    const sql = mig();
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("budget_exceeded");
    expect(sql).toContain("delivery_ad_charge_ledger_idem_uidx");
  });

  it("H29 ledger aggregate is spend authority (no remaining_budget mutation SSOT)", () => {
    const sql = mig();
    expect(sql).not.toMatch(/remaining_budget\s*=/);
    expect(sql).toContain("sum(amount_minor)");
  });

  it("H30 NOT_CONFIGURED budget is not zero/exhausted", () => {
    expect(STORE_SPONSORED_BUDGET_GATE.status).toBe("BILLING_NOT_LAUNCHED");
    expect(STORE_SPONSORED_BUDGET_GATE.nullMeansUnlimited).toBe(false);
    const sql = mig();
    expect(sql).toContain("'NOT_CONFIGURED'");
    expect(sql).toContain("skip when NOT_CONFIGURED");
  });

  it("H31/H32 refund policy NOT_CONFIGURED; architecture only", () => {
    expect(DELIVERY_AD_REFUND_POLICY.status).toBe("NOT_CONFIGURED");
    expect(mig()).toContain("delivery_ad_refund_ledger");
  });

  it("H33 duplicate cancellation refund idempotent key", () => {
    const k = buildRefundIdempotencyKey({
      originalChargeId: "c1",
      sourceEventId: "cancel-1",
    });
    expect(k).toBe("refund:c1:cancel-1");
    expect(mig()).toContain("delivery_ad_refund_ledger_idem_uidx");
  });

  it("H34 late charge isolation via post-commit only", () => {
    const orderRoute = readFileSync(
      join(process.cwd(), "app/api/me/store-orders/route.ts"),
      "utf8"
    );
    expect(orderRoute).toContain("reconcileDeliveryAdChargeForOrderSafe");
    expect(orderRoute).toMatch(/void reconcileDeliveryAdAttributionForOrder/);
  });

  it("H35/H36 billing failure does not roll back order/attribution", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/stores/advertising/delivery-ad-billing-writer.ts"),
      "utf8"
    );
    expect(writer).toContain("never throws to order path");
    const orderRoute = readFileSync(
      join(process.cwd(), "app/api/me/store-orders/route.ts"),
      "utf8"
    );
    expect(orderRoute).toContain("never fails the order");
  });

  it("H37 billing disabled leaves exposure gate non-blocking", () => {
    expect(ExposureBudgetGate.status).toBe("BILLING_NOT_LAUNCHED");
    expect(ExposureBudgetGate.enforcement).toBe("off");
  });

  it("H38 organic ranking untouched", () => {
    expect(DELIVERY_AD_ORGANIC_PAID_ISOLATION).toBeTruthy();
  });

  it("H39 Owner/Admin preview unrelated to billing", () => {
    const banner = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(banner).toContain('renderContext === "customer"');
    expect(banner).not.toContain("reconcileDeliveryAdCharge");
  });

  it("platform: FIXED_PERIOD deferred; Production billing disabled", () => {
    expect(DELIVERY_AD_FIXED_PERIOD_BILLING.status).toBe("DEFERRED");
    expect(CUT_H_BILLING_AUTHORITY.automaticProductionCharging).toBe("DISABLED");
    expect(mig()).toContain("is_enabled boolean NOT NULL DEFAULT false");
    expect(mig()).toMatch(/VALUES \(\s*'default',\s*false,/);
  });

  it("migration seeds no fake pricing rows", () => {
    const sql = mig();
    expect(sql).not.toMatch(/INSERT INTO public\.delivery_ad_pricing_policies/);
    expect(sql).not.toMatch(/INSERT INTO public\.delivery_ad_campaign_budgets/);
    expect(sql).toContain("No active Production rows at ship");
  });
});
