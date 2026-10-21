/**
 * 오너 상품 폼 → 상품 허브 1회성 안내 (클라이언트 내비게이션 동안 모듈 메모리에만 유지).
 * PRD-10 — 저장이 재고 0 으로 자동 품절 처리되면 허브 토스트로 안내한다.
 */
export type OwnerProductsHubFlash = { kind: "auto_sold_out"; storeId: string };

let pending: OwnerProductsHubFlash | null = null;

export function setOwnerProductsHubFlash(flash: OwnerProductsHubFlash): void {
  pending = flash;
}

/** 같은 매장의 안내만 꺼내고 비운다 */
export function consumeOwnerProductsHubFlash(storeId: string): OwnerProductsHubFlash | null {
  const cur = pending;
  if (!cur || cur.storeId !== storeId) return null;
  pending = null;
  return cur;
}
