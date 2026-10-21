/**
 * 3-E PRD-10 — 재고 추적 상품을 재고 0 + 판매중으로 저장하면 품절(`sold_out_reason='stock'`)로 맞춘다.
 *
 * 주문 RPC 의 재고 0 자동 품절과 같은 사유(`stock`)라, 취소 재고 복원(`restore_store_order_stock_atomic`)이
 * 재고를 되돌리면 판매중으로 자동 해제된다 (PRD-06). 재고 미추적 상품·판매중이 아닌 상품은 불변.
 * 기존 행은 다음 저장 때 적용된다 (운영 데이터 일괄 변경 없음).
 */

export type OwnerProductInventoryState = {
  product_status?: unknown;
  track_inventory?: unknown;
  stock_qty?: unknown;
};

/** 저장 직후 상태(기존 행 + 패치 병합)가 「재고 추적 · 재고 0 · 판매중」 인지 */
export function shouldAutoSoldOutOnOwnerSave(
  prev: OwnerProductInventoryState | null,
  patch: OwnerProductInventoryState
): boolean {
  const pick = <K extends keyof OwnerProductInventoryState>(k: K): unknown =>
    patch[k] !== undefined ? patch[k] : prev?.[k];
  const status = String(pick("product_status") ?? "").trim();
  if (status !== "active") return false;
  if (pick("track_inventory") !== true) return false;
  const stock = Math.floor(Number(pick("stock_qty") ?? 0));
  return Number.isFinite(stock) && stock <= 0;
}

export const OWNER_PRODUCT_AUTO_SOLD_OUT_PATCH = {
  product_status: "sold_out",
  sold_out_reason: "stock",
} as const;
