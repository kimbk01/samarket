import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function buyerStoreOrderDetailPath(orderId: string): string {
  return `/orders/store/${encodeURIComponent(orderId.trim())}`;
}

/**
 * 주문 완료 직후 카트 → 구매자 주문 상세.
 * App Router soft 이동 후에도 `/cart` 에 남아 있으면 hard replace 로 한 번 더 보냄.
 */
export function navigateToBuyerStoreOrderDetail(
  orderId: string,
  router: AppRouterInstance
): void {
  const id = orderId.trim();
  if (!id || typeof window === "undefined") return;
  const path = buyerStoreOrderDetailPath(id);

  try {
    router.replace(path);
  } catch {
    window.location.replace(path);
    return;
  }

  queueMicrotask(() => {
    if (window.location.pathname.includes("/cart")) {
      window.location.replace(path);
    }
  });
}
