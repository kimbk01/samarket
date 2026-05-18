"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useStoreCommerceCart } from "@/contexts/StoreCommerceCartContext";
import {
  applyCompletedOrderToCommerceCart,
  type CompletedOrderReorderPayload,
} from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function StoreOrderReorderAgainButton({
  payload,
  className,
  children,
}: {
  payload: CompletedOrderReorderPayload | null;
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const cart = useStoreCommerceCart();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (!payload?.storeSlug?.trim() || !payload.storeId?.trim()) {
      window.alert(t("mypage_comp_store_reorder_store_missing"));
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
  }, [cart, payload, router, t]);

  if (!payload) return null;

  return (
    <button type="button" className={className} disabled={busy} onClick={() => void onClick()}>
      {busy ? t("mypage_comp_store_reorder_adding") : (children ?? t("mypage_comp_store_reorder_default"))}
    </button>
  );
}
