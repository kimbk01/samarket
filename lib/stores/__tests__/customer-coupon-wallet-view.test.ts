import { describe, expect, it } from "vitest";
import {
  attachCustomerCouponWalletLabels,
  couponWalletStatusKey,
  CUSTOMER_COUPON_WALLET_TABS,
  customerWalletPresentationTab,
  formatCouponWalletDay,
  isOpaqueId,
} from "@/lib/stores/customer-coupon-wallet-view";
import { isCustomerOpaqueCouponTitle } from "@/lib/stores/store-coupon-product-view";

describe("CUT UI-3 customer coupon wallet view", () => {
  it("formats expiry as a calendar day, not raw ISO", () => {
    expect(formatCouponWalletDay("2026-09-01T16:14:00+00:00")).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
    expect(formatCouponWalletDay("2026-09-01T16:14:00+00:00")).not.toContain("T");
  });

  it("maps buckets to human status keys", () => {
    expect(couponWalletStatusKey({ bucket: "available", status: "available" })).toBe(
      "store_coupon_wallet_status_available"
    );
    expect(couponWalletStatusKey({ bucket: "expiring", status: "available" })).toBe(
      "store_coupon_wallet_status_expiring"
    );
    expect(couponWalletStatusKey({ bucket: "redeemed", status: "redeemed" })).toBe(
      "store_coupon_wallet_status_redeemed"
    );
    expect(couponWalletStatusKey({ bucket: "expired", status: "available" })).toBe(
      "store_coupon_wallet_status_expired"
    );
    expect(couponWalletStatusKey({ bucket: "expired", status: "revoked" })).toBe(
      "store_coupon_wallet_status_revoked"
    );
  });

  it("presentation tabs are held + redeemed only; expired/revoked hidden", () => {
    expect(CUSTOMER_COUPON_WALLET_TABS).toEqual(["held", "redeemed"]);
    expect(customerWalletPresentationTab("available")).toBe("held");
    expect(customerWalletPresentationTab("expiring")).toBe("held");
    expect(customerWalletPresentationTab("redeemed")).toBe("redeemed");
    expect(customerWalletPresentationTab("expired")).toBeNull();
  });

  it("rejects QA/internal titles on customer face", () => {
    expect(isCustomerOpaqueCouponTitle("DIBAY_QA_COUPON_E1_1787622130804")).toBe(true);
    expect(isCustomerOpaqueCouponTitle("나의 오른손딸방 할인")).toBe(false);
  });

  it("attaches store name and order_no without exposing ids as labels", () => {
    const storeId = "19085860-52d2-4183-b033-e71fcb58bcec";
    const orderId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const out = attachCustomerCouponWalletLabels(
      [{ id: "c1", store_id: storeId, redeemed_order_id: orderId, bucket: "redeemed" }],
      [{ id: storeId, store_name: "aa11", slug: "aa11" }],
      [{ id: orderId, order_no: "SO123", created_at: "2026-08-20T10:00:00.000Z" }]
    );
    expect(out[0].store_name).toBe("aa11");
    expect(out[0].order_no).toBe("SO123");
    expect(out[0].order_created_at).toBe("2026-08-20T10:00:00.000Z");
    expect(isOpaqueId(out[0].store_name ?? "")).toBe(false);
    expect(isOpaqueId(out[0].order_no ?? "")).toBe(false);
  });
});
