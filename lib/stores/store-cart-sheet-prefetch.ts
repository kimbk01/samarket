import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";

/** 카트 줄만 있을 때 시트 즉시 표시용 최소 행 (options_json 은 menus 행 우선) */
export function cartLineToPrefetchedListRow(line: StoreCommerceCartLine): Record<string, unknown> {
  const pickKeys = Object.keys(line.modifierWire?.pick ?? line.optionSelections ?? {});
  const hasOptions = pickKeys.length > 0 || Boolean(line.optionsSummary?.trim());
  const list = line.listUnitPricePhp;
  const unit = line.unitPricePhp;
  return {
    id: line.productId,
    title: line.title,
    price: list != null && list > unit ? list : unit,
    discount_price: list != null && list > unit ? unit : null,
    thumbnail_url: line.thumbnailUrl,
    min_order_qty: line.minOrderQty,
    max_order_qty: line.maxOrderQty,
    pickup_available: line.pickupAvailable,
    local_delivery_available: line.localDeliveryAvailable,
    shipping_available: line.shippingAvailable,
    has_options: hasOptions,
    options_summary: line.optionsSummary?.trim() || null,
  };
}

export function resolveStoreCartSheetPrefetchedRow(
  productId: string,
  editLine: StoreCommerceCartLine | null | undefined,
  menusRowsById: Record<string, Record<string, unknown>>
): Record<string, unknown> | null {
  const pid = productId.trim();
  if (!pid) return null;
  const fromMenus = menusRowsById[pid];
  if (fromMenus) return fromMenus;
  if (editLine?.productId === pid) return cartLineToPrefetchedListRow(editLine);
  return null;
}

/** 업셀 재계산 트리거 — 수량만 바뀌면 동일 키 */
export function storeCartInCartProductIdsKey(lines: { productId: string }[]): string {
  if (lines.length === 0) return "";
  const ids = lines.map((l) => l.productId.trim()).filter(Boolean);
  ids.sort();
  return ids.join(",");
}
