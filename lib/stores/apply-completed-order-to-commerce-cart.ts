import type {
  AddStoreCartLineInput,
  StoreCartBucketSummary,
} from "@/contexts/StoreCommerceCartContext";
import {
  orderLineOptionsSummary,
  parseProductOptionsJson,
  validateLineModifiers,
} from "@/lib/stores/product-line-options";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import {
  lineNoteFromOrderOptionsSnapshot,
  modifierWireFromOrderOptionsSnapshot,
} from "@/lib/stores/reorder-from-order-snapshot";
import { fetchStoreProductPublicDeduped } from "@/lib/stores/store-delivery-api-client";

export type ReorderCartItemInput = {
  product_id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  options_snapshot_json?: unknown;
};

export type CompletedOrderReorderPayload = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  fulfillmentType: string;
  items: ReorderCartItemInput[];
};

export type ApplyOrderToCartDeps = {
  addOrMergeLine: (input: AddStoreCartLineInput) => void;
  clearAllCarts: () => void;
  otherBucketsExcluding: (storeId: string) => StoreCartBucketSummary[];
  patchBucketMeta: (storeId: string, patch: { storeSlug?: string; storeName?: string }) => void;
};

/**
 * 완료된 주문의 품목을 장바구니에 담고 매장 장바구니 화면으로 이동하기 전 단계.
 * 다른 매장 장바구니가 있으면 confirm 후 비웁니다.
 */
export async function applyCompletedOrderToCommerceCart(
  deps: ApplyOrderToCartDeps,
  payload: CompletedOrderReorderPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { storeId, storeSlug, storeName, fulfillmentType, items } = payload;
  const sid = storeId.trim();
  const slug = storeSlug.trim();
  if (!sid || !slug) {
    return { ok: false, error: "매장 정보를 찾을 수 없어 다시 주문할 수 없습니다." };
  }
  if (!items.length) {
    return { ok: false, error: "담을 메뉴가 없습니다." };
  }

  const others = deps.otherBucketsExcluding(sid);
  if (others.length > 0) {
    const ok =
      typeof window !== "undefined" &&
      window.confirm(
        "다른 매장 장바구니에 담긴 메뉴가 있습니다. 비우고 이 주문 메뉴를 담을까요?"
      );
    if (!ok) return { ok: false, error: "cancelled" };
    deps.clearAllCarts();
  }

  deps.patchBucketMeta(sid, { storeSlug: slug, storeName: storeName.trim() });

  const deliveryLike = fulfillmentType === "local_delivery" || fulfillmentType === "shipping";

  for (const it of items) {
    const pid = String(it.product_id ?? "").trim();
    if (!pid) continue;

    const wire = modifierWireFromOrderOptionsSnapshot(it.options_snapshot_json);
    const snapshotSummary = orderLineOptionsSummary(it.options_snapshot_json);
    const lineNote = lineNoteFromOrderOptionsSnapshot(it.options_snapshot_json);

    let title = String(it.product_title_snapshot ?? "").trim() || "메뉴";
    let unitPrice = Math.round(Number(it.price_snapshot) || 0);
    let thumbnailUrl: string | null = null;
    let pickupAvailable = true;
    let localDeliveryAvailable = deliveryLike;
    let shippingAvailable = fulfillmentType === "shipping";
    let minQ = 1;
    let maxQ = 99;
    let listUnitPricePhp: number | null = null;
    let discountPercent: number | null = null;

    try {
      const { status, json: jRaw } = await fetchStoreProductPublicDeduped(pid);
      const j = jRaw as {
        ok?: boolean;
        product?: Record<string, unknown>;
        store?: { delivery_available?: boolean };
      };
      if (status >= 200 && status < 300 && j?.ok && j.product) {
        const p = j.product;
        const t = p.title;
        if (typeof t === "string" && t.trim()) title = t.trim();
        const th = p.thumbnail_url;
        thumbnailUrl = typeof th === "string" && th.trim() ? th.trim() : null;
        minQ = Math.max(1, Math.floor(Number(p.min_order_qty) || 1));
        maxQ = Math.max(minQ, Math.floor(Number(p.max_order_qty) || 99));
        pickupAvailable = p.pickup_available !== false;
        const storeDeliv = j.store?.delivery_available === true;
        localDeliveryAvailable = p.local_delivery_available === true || storeDeliv;
        shippingAvailable = p.shipping_available === true;

        const price = Number(p.price);
        const disc = p.discount_price != null ? Number(p.discount_price) : null;
        const baseUnit =
          disc != null && Number.isFinite(disc) && disc >= 0 && disc < price ? disc : price;
        const groups = parseProductOptionsJson(p.options_json);
        const optVal = validateLineModifiers(groups, wire, baseUnit);
        if (optVal.ok) {
          unitPrice = Math.round(baseUnit + optVal.unitDelta);
          const listWithOptions = Math.round(price + optVal.unitDelta);
          if (
            disc != null &&
            Number.isFinite(disc) &&
            disc >= 0 &&
            disc < price &&
            price > 0
          ) {
            listUnitPricePhp = listWithOptions;
            discountPercent = approximateDiscountPercent(listWithOptions, unitPrice);
          } else if (listWithOptions > unitPrice) {
            listUnitPricePhp = listWithOptions;
            discountPercent = approximateDiscountPercent(listWithOptions, unitPrice);
          }
        }
      }
    } catch {
      /* 주문 스냅샷 단가·제목으로 진행 */
    }

    const optionsSummary = snapshotSummary || lineNote || "";

    deps.addOrMergeLine({
      storeId: sid,
      storeSlug: slug,
      storeName: storeName.trim() || slug,
      productId: pid,
      title,
      thumbnailUrl,
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      unitPricePhp: Math.max(0, unitPrice),
      listUnitPricePhp,
      discountPercent,
      optionSelections: { ...wire.pick },
      modifierWire: { pick: { ...wire.pick }, qty: { ...wire.qty } },
      optionsSummary,
      lineNote: lineNote || null,
      pickupAvailable,
      localDeliveryAvailable,
      shippingAvailable,
      minOrderQty: minQ,
      maxOrderQty: maxQ,
    });
  }

  return { ok: true };
}
