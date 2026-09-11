import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { commitOrderCommittedNavigationEntry } from "@/lib/navigation/dibay-navigation-context-store";

export function buyerStoreOrderDetailPath(orderId: string): string {
  return `/orders?expand=${encodeURIComponent(orderId.trim())}`;
}

export function buyerStoreOrderChatPath(orderId: string): string {
  return `/orders/store/${encodeURIComponent(orderId.trim())}/chat`;
}

export type NavigateToBuyerStoreOrderDetailOptions = {
  storeSlug?: string | null;
  storeId?: string | null;
  chatHref?: string | null;
};

export type NavigateToBuyerStoreOrderChatOptions = NavigateToBuyerStoreOrderDetailOptions;

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

/**
 * 주문 완료 직후 카트 → canonical 주문채팅.
 * ORDER_COMMITTED boundary 는 유지하고, back 이 checkout/cart 로 돌아가지 않도록 replace 한다.
 */
export function navigateToBuyerStoreOrderChat(
  orderId: string,
  router: AppRouterInstance,
  opts?: NavigateToBuyerStoreOrderChatOptions
): void {
  const id = orderId.trim();
  if (!id || typeof window === "undefined") return;
  const path = opts?.chatHref?.trim() || buyerStoreOrderChatPath(id);

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

  commitOrderCommittedNavigationEntry({
    orderId: id,
    storeSlug: storeSlug || "unknown",
    storeId: opts?.storeId ?? null,
  });

  try {
    router.replace(path);
  } catch {
    window.location.replace(path);
    return;
  }

  queueMicrotask(() => {
    if (window.location.pathname.includes("/cart") || window.location.pathname.includes("/checkout")) {
      window.location.replace(path);
    }
  });
}
