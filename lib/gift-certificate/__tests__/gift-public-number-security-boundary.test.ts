import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public gift number security boundary", () => {
  it("S1: wallet lookup stays authenticated owner-scoped and has no public-number lookup route", () => {
    const walletRoute = source("app/api/me/gift-certificates/wallet/route.ts");
    const walletLoader = source("lib/gift-certificate/load-gift-wallet.ts");

    expect(walletRoute).toContain("getRouteUserId()");
    expect(walletLoader).toContain(".eq(\"current_owner_user_id\", uid)");
    expect(walletRoute).not.toContain("publicGiftNumber");
    expect(walletRoute).not.toContain("public_gift_number");
  });

  it("S2/S4/S5/S6: checkout redeem keeps instance UUID, owner, store, status, and atomic RPC authority", () => {
    const route = source("app/api/me/store-orders/route.ts");
    const eligible = source("lib/gift-certificate/checkout-eligible-gifts.ts");

    expect(route).toContain("gift_instance_ids");
    expect(route).not.toContain("public_gift_number");
    expect(route).not.toContain("publicGiftNumber");
    expect(route).toContain('error: "gift_not_owner"');
    expect(route).toContain('error: "gift_store_mismatch"');
    expect(eligible).toContain("giftInstanceAllowsRedeem(inst.status)");
    expect(eligible).toContain("giftInstanceAllowsCheckoutStore");
  });

  it("S3: gift transfer accepts internal instance id only", () => {
    const offerRoute = source("app/api/me/gift-certificates/transfers/offer/route.ts");

    expect(offerRoute).toContain("const instanceId = String(body.instanceId");
    expect(offerRoute).not.toContain("publicGiftNumber");
    expect(offerRoute).not.toContain("public_gift_number");
    expect(offerRoute).toContain("giftCertificateOffer(sb");
  });

  it("S7/S8: admin tracking is admin-only and owner redemption remains owner/store gated", () => {
    const adminTracking = source("app/api/admin/gift-certificates/tracking/route.ts");
    const ownerRedemptions = source("app/api/me/stores/[storeId]/gift-certificates/redemptions/route.ts");

    expect(adminTracking).toContain('requireAdminPermission("business")');
    expect(ownerRedemptions).toContain("getCachedStoreIfOwner(sb, userId, sid)");
    expect(ownerRedemptions).toContain(".eq(\"store_id\", sid)");
  });
});
