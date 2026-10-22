import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stores/store-orderability-policy", () => ({
  resolveStoreOrderability: vi.fn(),
}));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  canOwnerSellProducts: vi.fn(),
}));
vi.mock("@/lib/stores/commission/store-commission-writer", () => ({
  loadStoreCashPosition: vi.fn(),
}));

import { canOwnerSellProducts } from "@/lib/stores/owner-product-gate";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";
import { loadStoreCashPosition } from "@/lib/stores/commission/store-commission-writer";
import {
  evaluateStoreOrderCheckoutLine,
  revalidateStoreCartLines,
  validateStoreOrderCheckout,
  type StoreOrderCheckoutProductRow,
} from "@/lib/stores/validate-store-order-checkout";
import {
  isStoreCartLineLevelCheckoutError,
  revalidationLinesToPatches,
  revalidationPatchesChangeCart,
  storeCartRevalidationRequestKey,
} from "@/lib/stores/store-cart-revalidation-client";
import { mutateCartApplyRevalidation } from "@/lib/stores/store-commerce-cart-line-mutate";
import type {
  StoreCommerceCartLine,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";

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

function product(over: Partial<StoreOrderCheckoutProductRow> = {}): StoreOrderCheckoutProductRow {
  return {
    id: "p1",
    store_id: "store-1",
    title: "Burger",
    price: 120,
    discount_price: null,
    stock_qty: 10,
    track_inventory: false,
    product_status: "active",
    min_order_qty: 1,
    max_order_qty: 99,
    pickup_available: true,
    local_delivery_available: false,
    shipping_available: false,
    options_json: null,
    admin_review_status: "approved",
    store_menu_sections: null,
    ...over,
  };
}

/** store_products 조회만 지원 — insert/rpc 호출 시 즉시 실패(읽기 전용 보장) */
function readOnlySb(rows: StoreOrderCheckoutProductRow[]) {
  const forbidden = () => {
    throw new Error("write path must not be called");
  };
  return {
    from(table: string) {
      expect(table).toBe("store_products");
      return {
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({ data: rows.filter((r) => ids.includes(r.id)), error: null }),
        }),
        insert: forbidden,
        update: forbidden,
        upsert: forbidden,
        delete: forbidden,
      };
    },
    rpc: forbidden,
  } as never;
}

const wire = { pick: {}, qty: {} };

describe("CRT-02 evaluateStoreOrderCheckoutLine (주문·재검증 공통 판정)", () => {
  it("price_changed 는 서버 현재 단가를 함께 돌려준다", () => {
    const r = evaluateStoreOrderCheckoutLine({
      product: product({ price: 120 }),
      line: { product_id: "p1", qty: 1, wire, line_note: null, client_unit_php: 100 },
      storeId: "store-1",
      fulfillment: "pickup",
      storeDeliveryOn: true,
    });
    expect(r).toEqual({ ok: false, error: "price_changed", server_unit_php: 120 });
  });

  it("품절·판매 중지는 단가 없이 코드만", () => {
    const sold = evaluateStoreOrderCheckoutLine({
      product: product({ product_status: "sold_out" }),
      line: { product_id: "p1", qty: 1, wire, line_note: null, client_unit_php: 120 },
      storeId: "store-1",
      fulfillment: "pickup",
      storeDeliveryOn: true,
    });
    expect(sold).toEqual({ ok: false, error: "product_sold_out", server_unit_php: null });
  });
});

describe("CRT-02 revalidateStoreCartLines (읽기 전용)", () => {
  beforeEach(() => {
    vi.mocked(resolveStoreOrderability).mockResolvedValue({
      viewer_is_owner: false,
      viewer_is_admin: false,
      can_order_store: true,
      owner_block_message: null,
    } as never);
    vi.mocked(canOwnerSellProducts).mockResolvedValue(true);
    vi.mocked(loadStoreCashPosition).mockResolvedValue({ orderable: true } as never);
  });

  it("줄마다 결과를 돌려주고 첫 오류에서 멈추지 않는다", async () => {
    const sb = readOnlySb([
      product({ id: "p1", price: 120 }),
      product({ id: "p2", title: "Fries", product_status: "sold_out" }),
      product({ id: "p3", title: "Cola", price: 50, discount_price: 40 }),
    ]);
    const res = await revalidateStoreCartLines({
      sb,
      buyerId: "buyer-1",
      storeId: "store-1",
      fulfillment: "pickup",
      store: storeRow,
      items: [
        { line_id: "l1", product_id: "p1", qty: 1, wire, line_note: null, client_unit_php: 100 },
        { line_id: "l2", product_id: "p2", qty: 1, wire, line_note: null, client_unit_php: 80 },
        { line_id: "l3", product_id: "p3", qty: 2, wire, line_note: null, client_unit_php: 40 },
        { line_id: "l4", product_id: "gone", qty: 1, wire, line_note: null, client_unit_php: 10 },
      ],
    });
    expect(res).toEqual({
      ok: true,
      lines: [
        { line_id: "l1", product_id: "p1", error: "price_changed", server_unit_php: 120, server_list_unit_php: 120 },
        { line_id: "l2", product_id: "p2", error: "product_sold_out", server_unit_php: null, server_list_unit_php: null },
        { line_id: "l3", product_id: "p3", error: null, server_unit_php: 40, server_list_unit_php: 50 },
        { line_id: "l4", product_id: "gone", error: "product_not_available", server_unit_php: null, server_list_unit_php: null },
      ],
    });
  });

  it("본인 매장 등 매장 게이트는 주문 생성과 같은 코드로 거절", async () => {
    vi.mocked(resolveStoreOrderability).mockResolvedValue({
      viewer_is_owner: true,
      viewer_is_admin: false,
      can_order_store: false,
      owner_block_message: null,
    } as never);
    const res = await revalidateStoreCartLines({
      sb: readOnlySb([product()]),
      buyerId: "owner-1",
      storeId: "store-1",
      fulfillment: "pickup",
      store: storeRow,
      items: [{ line_id: "l1", product_id: "p1", qty: 1, wire, line_note: null, client_unit_php: 120 }],
    });
    expect(res).toEqual({ ok: false, error: "owner_self_order_denied", status: 403 });
  });

  it("주문 검증은 줄 오류에 원인 product_id 를 동봉한다", async () => {
    const res = await validateStoreOrderCheckout({
      sb: readOnlySb([product({ id: "p1", price: 120 })]),
      buyerId: "buyer-1",
      storeId: "store-1",
      fulfillment: "pickup",
      store: storeRow,
      items: [{ product_id: "p1", qty: 1, wire, line_note: null, client_unit_php: 100 }],
    });
    expect(res).toEqual({ ok: false, error: "price_changed", status: 400, product_id: "p1" });
  });
});

function cartLine(over: Partial<StoreCommerceCartLine> = {}): StoreCommerceCartLine {
  return {
    lineId: "l1",
    productId: "p1",
    title: "Burger",
    thumbnailUrl: null,
    qty: 2,
    unitPricePhp: 100,
    listUnitPricePhp: null,
    discountPercent: null,
    modifierWire: { pick: {}, qty: {} },
    optionSelections: {},
    optionsSummary: "",
    lineNote: "no onion",
    pickupAvailable: true,
    localDeliveryAvailable: true,
    shippingAvailable: false,
    minOrderQty: 1,
    maxOrderQty: 99,
    ...over,
  };
}

function snap(lines: StoreCommerceCartLine[]): StoreCommerceCartSnapshotV2 {
  return {
    v: 2,
    carts: { "store-1": { storeId: "store-1", storeSlug: "s", storeName: "S", lines } },
  };
}

describe("CRT-02 가격 변경 후 회복 시나리오 (카트 반영)", () => {
  it("price_changed → 서버 단가로 갱신·사유 없음, 품절 → 사유 표시", () => {
    const patches = revalidationLinesToPatches([
      { line_id: "l1", error: "price_changed", server_unit_php: 120, server_list_unit_php: 120 },
      { line_id: "l2", error: "product_sold_out", server_unit_php: null, server_list_unit_php: null },
    ]);
    expect(patches).toEqual([
      { lineId: "l1", unitPricePhp: 120, listUnitPricePhp: 120, issue: null },
      { lineId: "l2", unitPricePhp: null, listUnitPricePhp: null, issue: "product_sold_out" },
    ]);
    const before = snap([cartLine(), cartLine({ lineId: "l2", productId: "p2", unitPricePhp: 80 })]);
    expect(revalidationPatchesChangeCart(before.carts["store-1"]!.lines, patches)).toBe(true);
    const out = mutateCartApplyRevalidation(before, "store-1", patches);
    expect(out.changed).toBe(true);
    const [l1, l2] = out.next!.carts["store-1"]!.lines;
    expect(l1).toMatchObject({ unitPricePhp: 120, revalidationIssue: null, qty: 2, lineNote: "no onion" });
    expect(l2).toMatchObject({ unitPricePhp: 80, revalidationIssue: "product_sold_out" });
  });

  it("변화가 없으면 같은 스냅샷(재렌더·재요청 루프 없음)", () => {
    const before = snap([cartLine({ unitPricePhp: 120 })]);
    const out = mutateCartApplyRevalidation(before, "store-1", [
      { lineId: "l1", unitPricePhp: 120, listUnitPricePhp: 120, issue: null },
    ]);
    expect(out).toEqual({ next: before, changed: false });
  });

  it("요청 키는 가격·사유 변경에 반응하지 않는다", () => {
    const a = storeCartRevalidationRequestKey("store-1", "pickup", [cartLine()]);
    const b = storeCartRevalidationRequestKey("store-1", "pickup", [
      cartLine({ unitPricePhp: 999, revalidationIssue: "product_sold_out" }),
    ]);
    expect(a).toBe(b);
    expect(storeCartRevalidationRequestKey("store-1", "pickup", [cartLine({ qty: 3 })])).not.toBe(a);
  });

  it("줄 단위 주문 실패 코드만 재검증을 다시 돌린다", () => {
    expect(isStoreCartLineLevelCheckoutError("price_changed")).toBe(true);
    expect(isStoreCartLineLevelCheckoutError("options_too_few")).toBe(true);
    expect(isStoreCartLineLevelCheckoutError("product_sold_out")).toBe(true);
    expect(isStoreCartLineLevelCheckoutError("coupon_expired")).toBe(false);
    expect(isStoreCartLineLevelCheckoutError("store_closed")).toBe(false);
  });
});
