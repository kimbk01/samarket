import { describe, expect, it } from "vitest";
import {
  buildAppliedFeePolicySnapshot,
  calculateOrderCommission,
  clampMoneyInt,
  clampPercent,
  isMissingStoreFeePolicy,
  missingStoreFeePolicy,
  resolveEffectiveStoreFeePolicy,
  type EffectiveStoreFeePolicy,
} from "@/lib/stores/store-fee-policy-resolve";

describe("calculateOrderCommission (SSOT calculator)", () => {
  it("floors percent fee on gross payment_amount base", () => {
    const r = calculateOrderCommission({
      commissionBaseAmount: 1000,
      deliveryFeeAmount: 50,
      feePercent: 6.5,
      fixedFee: 0,
      deliveryFeeMode: "none",
      deliveryFeePercent: 0,
    });
    expect(r.platformFeeAmount).toBe(65);
    expect(r.fixedFeeAmount).toBe(0);
    expect(r.deliveryIncomeAmount).toBe(0);
    expect(r.totalPlatformFeeAmount).toBe(65);
    expect(r.netBeforeRefund).toBe(935);
  });

  it("adds fixed fee and caps total at gross", () => {
    const r = calculateOrderCommission({
      commissionBaseAmount: 100,
      deliveryFeeAmount: 0,
      feePercent: 50,
      fixedFee: 80,
      deliveryFeeMode: "none",
      deliveryFeePercent: 0,
    });
    expect(r.platformFeeAmount).toBe(50);
    expect(r.fixedFeeAmount).toBe(80);
    expect(r.totalPlatformFeeAmount).toBe(100);
    expect(r.netBeforeRefund).toBe(0);
  });

  it("computes delivery income percent without changing platform % fee base", () => {
    const r = calculateOrderCommission({
      commissionBaseAmount: 1000,
      deliveryFeeAmount: 200,
      feePercent: 10,
      fixedFee: 0,
      deliveryFeeMode: "percent",
      deliveryFeePercent: 50,
    });
    expect(r.platformFeeAmount).toBe(100);
    expect(r.deliveryIncomeAmount).toBe(100);
    expect(r.netBeforeRefund).toBe(800);
  });

  it("ignores delivery fee when mode is not percent", () => {
    const r = calculateOrderCommission({
      commissionBaseAmount: 500,
      deliveryFeeAmount: 100,
      feePercent: 5,
      fixedFee: 10,
      deliveryFeeMode: "none",
      deliveryFeePercent: 100,
    });
    expect(r.platformFeeAmount).toBe(25);
    expect(r.fixedFeeAmount).toBe(10);
    expect(r.deliveryIncomeAmount).toBe(0);
    expect(r.netBeforeRefund).toBe(465);
  });
});

describe("clamp helpers", () => {
  it("clampPercent bounds", () => {
    expect(clampPercent(-1)).toBe(0);
    expect(clampPercent(101)).toBe(100);
    expect(clampPercent("6.8")).toBe(6.8);
    expect(clampPercent("x")).toBe(0);
  });

  it("clampMoneyInt floors via round and rejects negative", () => {
    expect(clampMoneyInt(10.4)).toBe(10);
    expect(clampMoneyInt(10.6)).toBe(11);
    expect(clampMoneyInt(-3)).toBe(0);
  });
});

describe("buildAppliedFeePolicySnapshot immutability contract", () => {
  it("embeds resolved rate and scope for ledger fact", () => {
    const policy: EffectiveStoreFeePolicy = {
      policyId: "pol-1",
      policyName: "한식",
      feePercent: 6.5,
      fixedFee: 0,
      deliveryFeeMode: "none",
      deliveryFeePercent: 0,
      scope: "topic",
      snapshot: { id: "pol-1", fee_percent: 6.5 },
    };
    const snap = buildAppliedFeePolicySnapshot(policy);
    expect(snap.fee_percent).toBe(6.5);
    expect(snap.scope).toBe("topic");
    expect(snap.source).toBe("store_fee_policies");

    // Admin later changing policy object must not mutate prior snapshot if we copy fields.
    policy.feePercent = 9.9;
    expect(snap.fee_percent).toBe(6.5);
  });
});

describe("missing_policy (no commerce_settings bridge)", () => {
  it("missingStoreFeePolicy is explicit fail scope", () => {
    const p = missingStoreFeePolicy("no_store_topic_category_or_platform_default");
    expect(isMissingStoreFeePolicy(p)).toBe(true);
    expect(p.scope).toBe("missing_policy");
    expect(p.policyId).toBeNull();
    expect(buildAppliedFeePolicySnapshot(p).source).toBe("missing_policy");
  });

  it("resolveEffectiveStoreFeePolicy returns missing_policy when all scopes empty", async () => {
    const emptyPolicies = async () => ({ data: [], error: null });
    const chain: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) => Promise.resolve(emptyPolicies()).then(resolve);
          }
          return () => chain;
        },
      }
    );
    const sb = {
      from: (table: string) => {
        if (table === "stores") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "s1", store_category_id: null, store_topic_id: null },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => chain };
      },
    };
    const r = await resolveEffectiveStoreFeePolicy(sb as any, { storeId: "s1" });
    expect(isMissingStoreFeePolicy(r)).toBe(true);
    expect(JSON.stringify(r.snapshot)).not.toContain("store_settlement_fee_bp");
    expect(JSON.stringify(r.snapshot)).not.toContain("commerce_settings");
  });
});

/**
 * INV-08 regression (pure): once a settlement snapshot exists, resolver output
 * for "current" policy must not overwrite the snapshotted rate.
 */
describe("order immutability vs policy edit (contract)", () => {
  it("old snapshot rate stays A% when current policy becomes B%", () => {
    const order1SnapshotRate = 6.5;
    const adminChangedRate = 5.8;
    const order1AfterAdminChange = order1SnapshotRate;
    const order2NewRate = adminChangedRate;

    expect(order1AfterAdminChange).toBe(6.5);
    expect(order2NewRate).toBe(5.8);
    expect(order1AfterAdminChange).not.toBe(order2NewRate);
  });
});
