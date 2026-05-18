"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStoreCommerceCart } from "@/contexts/StoreCommerceCartContext";
import {
  applyCompletedOrderToCommerceCart,
  type CompletedOrderReorderPayload,
} from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { fetchStoreSummaryDeduped } from "@/lib/stores/store-delivery-api-client";

const OWN_STORE_ORDER_BLOCK_MESSAGE = "본인 매장은 주문할 수 없습니다";

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
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const slug = payload?.storeSlug?.trim();
    if (!slug) {
      setBlockedReason(null);
      return;
    }
    void fetchStoreSummaryDeduped(slug).then(({ json }) => {
      if (!alive) return;
      const j = json as {
        ok?: boolean;
        meta?: { can_order_store?: boolean; owner_block_message?: string | null };
      };
      setBlockedReason(
        j?.ok && j.meta?.can_order_store === false
          ? j.meta.owner_block_message ?? OWN_STORE_ORDER_BLOCK_MESSAGE
          : null
      );
    });
    return () => {
      alive = false;
    };
  }, [payload?.storeSlug]);

  const onClick = useCallback(async () => {
    if (!payload?.storeSlug?.trim() || !payload.storeId?.trim()) {
      window.alert("매장 정보를 찾을 수 없어 다시 주문할 수 없습니다.");
      return;
    }
    if (blockedReason) {
      window.alert(blockedReason);
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
  }, [blockedReason, cart, payload, router]);

  if (!payload) return null;

  return (
    <button
      type="button"
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={busy || !!blockedReason}
      title={blockedReason ?? undefined}
      onClick={() => void onClick()}
    >
      {blockedReason ?? (busy ? "담는 중…" : children)}
    </button>
  );
}
