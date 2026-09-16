import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stores/store-orderability-policy", () => ({
  resolveStoreOrderability: vi.fn(),
}));

vi.mock("@/lib/stores/owner-product-gate", () => ({
  canOwnerSellProducts: vi.fn(),
}));

import { canOwnerSellProducts } from "@/lib/stores/owner-product-gate";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";
import { validateStoreOrderCheckout } from "@/lib/stores/validate-store-order-checkout";

const resolveOrderabilityMock = vi.mocked(resolveStoreOrderability);
const canSellMock = vi.mocked(canOwnerSellProducts);

const storeRow = {
  id: "store-1",
  owner_user_id: "owner-1",
  approval_status: "approved",
  is_visible: true,
  is_open: true,
  point_commerce_blocked: false,
  business_hours_json: null,
  pickup_available: true,
  delivery_available: true,
};

function baseParams(buyerId: string) {
  return {
    sb: {} as never,
    buyerId,
    storeId: "store-1",
    fulfillment: "pickup" as const,
    items: [
      {
        product_id: "p1",
        qty: 1,
        wire: { pick: {}, qty: {} },
        line_note: null,
      },
    ],
    store: storeRow,
  };
}

describe("own-store order create gate", () => {
  beforeEach(() => {
    resolveOrderabilityMock.mockReset();
    canSellMock.mockReset();
  });

  it("A: non-admin owner + own store + no coupon → DENIED before sell/stock path", async () => {
    resolveOrderabilityMock.mockResolvedValue({
      viewer_is_owner: true,
      viewer_is_admin: false,
      can_order_store: false,
      owner_block_message: null,
    });

    const res = await validateStoreOrderCheckout(baseParams("owner-1"));

    expect(res).toEqual({
      ok: false,
      error: "owner_self_order_denied",
      status: 403,
    });
    expect(resolveOrderabilityMock).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "owner-1"
    );
    expect(canSellMock).not.toHaveBeenCalled();
  });

  it("B: non-admin owner + own store + coupon path uses same validator denial", async () => {
    // Coupon is applied after validateStoreOrderCheckout in the route.
    // Same validator denial must fire before coupon and before atomic create.
    resolveOrderabilityMock.mockResolvedValue({
      viewer_is_owner: true,
      viewer_is_admin: false,
      can_order_store: false,
      owner_block_message: null,
    });

    const res = await validateStoreOrderCheckout(baseParams("owner-1"));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("owner_self_order_denied");
      expect(res.status).toBe(403);
    }
    expect(canSellMock).not.toHaveBeenCalled();
  });

  it("C: normal customer → own-store gate does not falsely deny", async () => {
    resolveOrderabilityMock.mockResolvedValue({
      viewer_is_owner: false,
      viewer_is_admin: false,
      can_order_store: true,
      owner_block_message: null,
    });
    canSellMock.mockResolvedValue(false);

    const res = await validateStoreOrderCheckout(baseParams("customer-1"));

    expect(res).toEqual({ ok: false, error: "store_not_selling", status: 400 });
    expect(resolveOrderabilityMock).toHaveBeenCalledWith(
      expect.anything(),
      "customer-1",
      "owner-1"
    );
    expect(canSellMock).toHaveBeenCalled();
  });

  it("D: admin exemption preserved (can_order_store true continues)", async () => {
    resolveOrderabilityMock.mockResolvedValue({
      viewer_is_owner: true,
      viewer_is_admin: true,
      can_order_store: true,
      owner_block_message: null,
    });
    canSellMock.mockResolvedValue(false);

    const res = await validateStoreOrderCheckout(baseParams("owner-1"));

    expect(res).toEqual({ ok: false, error: "store_not_selling", status: 400 });
    expect(canSellMock).toHaveBeenCalled();
  });

  it("E: create route stops before createStoreOrderAtomic after denial", () => {
    const route = readFileSync("app/api/me/store-orders/route.ts", "utf8");
    const validator = readFileSync("lib/stores/validate-store-order-checkout.ts", "utf8");

    expect(validator).toContain("resolveStoreOrderability");
    expect(validator).toContain('error: "owner_self_order_denied"');

    // Route must not keep a second coupon-only policy authority.
    expect(route).not.toMatch(
      /if\s*\(\s*buyerId\s*===\s*String\(\s*store\.owner_user_id/
    );
    expect(route).not.toMatch(
      /couponCampaignId[\s\S]{0,200}owner_self_order_denied/
    );

    const validateCall = route.indexOf("await validateStoreOrderCheckout");
    const validatedEarlyReturn = route.indexOf("if (!validated.ok)");
    const atomicCall = route.indexOf("await createStoreOrderAtomic");
    expect(validateCall).toBeGreaterThan(-1);
    expect(validatedEarlyReturn).toBeGreaterThan(validateCall);
    expect(atomicCall).toBeGreaterThan(validatedEarlyReturn);

    // HTTP mapping preserves existing error contract from validator.
    expect(route).toContain("error: validated.error");
    expect(route).toContain("status: validated.status");
  });
});
