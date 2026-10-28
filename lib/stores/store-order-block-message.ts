/**
 * 주문 불가 사유(`StoreOrderability.block_reason`) → 고객 안내 문구 키. 상세·상품·장바구니가 같은 키를 쓴다.
 */
export function storeOrderBlockMessageKey(
  blockReason: unknown
): "store_sample_order_block" | "store_err_own_store_block" {
  return blockReason === "sample_store" ? "store_sample_order_block" : "store_err_own_store_block";
}
