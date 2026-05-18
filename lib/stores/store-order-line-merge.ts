import type { StoreOrderLineInput } from "@/lib/stores/validate-store-order-checkout";
import { computeCartLineMergeKey } from "@/lib/stores/product-line-options";

export function mergeStoreOrderLineItems(
  storeId: string,
  items: StoreOrderLineInput[]
): StoreOrderLineInput[] {
  const merged = new Map<string, StoreOrderLineInput>();
  for (const line of items) {
    const key = computeCartLineMergeKey({
      storeId,
      productId: line.product_id,
      selections: line.wire,
      lineNote: line.line_note,
    });
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...line });
      continue;
    }
    prev.qty += line.qty;
  }
  return [...merged.values()];
}
