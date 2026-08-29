import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { commitOrderCommittedNavigationEntry } from "@/lib/navigation/dibay-navigation-context-store";

export function buyerStoreOrderDetailPath(orderId: string): string {
  return `/orders?expand=${encodeURIComponent(orderId.trim())}`;
}

export type NavigateToBuyerStoreOrderDetailOptions = {
  storeSlug?: string | null;
  storeId?: string | null;
};

/**
 * 주문 완료 직후 카트 → 구매자 주문 상세.
 * App Router soft 이동 후에도 `/cart` 에 남아 있으면 hard replace 로 한 번 더 보냄.
 * CUT 3: stamps ORDER_COMMITTED navigation context (Back never → cart).
 */
export function navigateToBuyerStoreOrderDetail(
  orderId: string,
  router: AppRouterInstance,
  opts?: NavigateToBuyerStoreOrderDetailOptions
): void {
  const id = orderId.trim();
  if (!id || typeof window === "undefined") return;
  const path = buyerStoreOrderDetailPath(id);

  const storeSlug =
    opts?.storeSlug?.trim() ||
    (() => {
      const parts = window.location.pathname.split("/").filter(Boolean);
      if (parts[0] === "stores" && parts[1]) {
        try {
          return decodeURIComponent(parts[1]);
        } catch {
          return parts[1];
        }
      }
      return "";
    })();

  if (storeSlug) {
    commitOrderCommittedNavigationEntry({
      orderId: id,
      storeSlug,
      storeId: opts?.storeId ?? null,
    });
  } else {
    commitOrderCommittedNavigationEntry({
      orderId: id,
      storeSlug: "unknown",
      storeId: opts?.storeId ?? null,
    });
  }

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
