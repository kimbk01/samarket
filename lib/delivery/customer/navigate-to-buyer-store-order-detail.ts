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
 * 주문 완료 직후 카트 → 구매자 주문 상세 / 채팅.
 * Soft replace is the sole primary owner. Hard location.replace runs only if
 * soft navigation never leaves cart/checkout (cancelled when soft succeeds).
 * CUT 3: stamps ORDER_COMMITTED navigation context (Back never → cart).
 */
function commitBuyerOrderNavContext(
  orderId: string,
  opts?: NavigateToBuyerStoreOrderDetailOptions
): void {
  const storeSlug =
    opts?.storeSlug?.trim() ||
    (() => {
      if (typeof window === "undefined") return "";
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
    orderId,
    storeSlug: storeSlug || "unknown",
    storeId: opts?.storeId ?? null,
  });
}

function replaceLeavingCartCheckout(
  path: string,
  router: AppRouterInstance,
  stuckMs = 400
): void {
  try {
    router.replace(path);
  } catch {
    window.location.replace(path);
    return;
  }

  let settled = false;
  const stillOnCartOrCheckout = () => {
    const p = window.location.pathname;
    return p.includes("/cart") || p.includes("/checkout");
  };
  const iv = window.setInterval(() => {
    if (!stillOnCartOrCheckout()) {
      settled = true;
      window.clearInterval(iv);
    }
  }, 32);
  window.setTimeout(() => {
    window.clearInterval(iv);
    if (!settled && stillOnCartOrCheckout()) {
      window.location.replace(path);
    }
  }, stuckMs);
}

export function navigateToBuyerStoreOrderDetail(
  orderId: string,
  router: AppRouterInstance,
  opts?: NavigateToBuyerStoreOrderDetailOptions
): void {
  const id = orderId.trim();
  if (!id || typeof window === "undefined") return;
  commitBuyerOrderNavContext(id, opts);
  replaceLeavingCartCheckout(buyerStoreOrderDetailPath(id), router);
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
  commitBuyerOrderNavContext(id, opts);
  replaceLeavingCartCheckout(path, router);
}

