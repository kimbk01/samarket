"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import {
  applyCompletedOrderToCommerceCart,
  type CompletedOrderReorderPayload,
} from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";

/** 재주문 동작 — 버튼(목록 카드)과 상세 하단 고정 CTA(S31)가 같은 로직을 쓴다. */
export function useStoreOrderReorderAgain(payload: CompletedOrderReorderPayload | null): {
  run: () => Promise<void>;
  busy: boolean;
  ready: boolean;
} {
  const { t } = useI18n();
  const router = useRouter();
  const cart = useStoreCommerceCartOptional();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (!payload?.storeSlug?.trim() || !payload.storeId?.trim()) {
      await dibayAlert({ title: t("mypage_comp_store_reorder_store_missing") });
      return;
    }
    if (!cart?.hydrated) return;
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
        await dibayAlert({ title: r.error });
        return;
      }
      router.push(`/stores/${encodeURIComponent(payload.storeSlug.trim())}`);
    } finally {
      setBusy(false);
    }
  }, [cart, payload, router, t]);

  return { run, busy, ready: Boolean(payload) && Boolean(cart?.hydrated) };
}

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
  const { run, busy, ready } = useStoreOrderReorderAgain(payload);

  if (!payload) return null;

  return (
    <button
      type="button"
      className={className}
      disabled={busy || !ready}
      onClick={() => void run()}
    >
      {busy ? t("mypage_comp_store_reorder_adding") : (children ?? t("mypage_comp_store_reorder_default"))}
    </button>
  );
}
