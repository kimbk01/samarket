"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useStoreCommerceCart } from "@/contexts/StoreCommerceCartContext";
import {
  applyCompletedOrderToCommerceCart,
  type CompletedOrderReorderPayload,
} from "@/lib/stores/apply-completed-order-to-commerce-cart";

export function StoreOrderReorderAgainButton({
  payload,
  className,
  children = "다시 주문하기",
}: {
  payload: CompletedOrderReorderPayload | null;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const cart = useStoreCommerceCart();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (!payload?.storeSlug?.trim() || !payload.storeId?.trim()) {
      window.alert("매장 정보를 찾을 수 없어 다시 주문할 수 없습니다.");
      return;
    }
    if (!cart.hydrated) return;
    setBusy(true);
    try {
      const r = await applyCompletedOrderToCommerceCart(
        {
          addOrMergeLine: cart.addOrMergeLine,
          clearAllCarts: cart.clearAllCarts,
          otherBucketsExcluding: cart.otherBucketsExcluding,
          patchBucketMeta: cart.patchBucketMeta,
        },
        payload
      );
      if (!r.ok) {
        if (r.error === "cancelled") return;
        window.alert(r.error);
        return;
      }
      router.push(`/stores/${encodeURIComponent(payload.storeSlug.trim())}`);
    } finally {
      setBusy(false);
    }
  }, [cart, payload, router]);

  if (!payload) return null;

  return (
    <button type="button" className={className} disabled={busy} onClick={() => void onClick()}>
      {busy ? "담는 중…" : children}
    </button>
  );
}
