"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { StoreCartPreviewSheet } from "@/components/stores/store-order-detail/StoreCartPreviewSheet";
import {
  closeStoreCartPreview,
  getStoreCartPreviewOpenMark,
  useStoreCartPreviewUIStore,
} from "@/lib/stores/store-cart-preview-ui-store";
import {
  deliveryRenderTraceBump,
  deliveryTraceCartPreviewOpenMs,
} from "@/lib/dibay/delivery-render-trace";

/**
 * 장바구니 프리뷰 sheet — `StoreDetailPublic` 밖 portal.
 */
export function StoreCartPreviewPortal() {
  const { t } = useI18n();
  const open = useStoreCartPreviewUIStore((s) => s.open);
  const storeId = useStoreCartPreviewUIStore((s) => s.storeId);
  const storeSlug = useStoreCartPreviewUIStore((s) => s.storeSlug);
  const loggedRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    deliveryRenderTraceBump("cart-preview-portal");
  });

  useLayoutEffect(() => {
    if (!open || !storeId) {
      loggedRef.current = null;
      return;
    }
    const key = storeId;
    if (loggedRef.current === key) return;
    loggedRef.current = key;
    const t0 = getStoreCartPreviewOpenMark();
    deliveryTraceCartPreviewOpenMs(
      storeId,
      typeof performance !== "undefined" ? performance.now() - t0 : 0
    );
  }, [open, storeId]);

  const root = typeof document !== "undefined" ? document.body : null;
  if (!open || !storeId || !storeSlug || !root) return null;

  return createPortal(
    <StoreCartPreviewSheet
      open
      onClose={closeStoreCartPreview}
      storeId={storeId}
      storeSlug={storeSlug}
    />,
    root
  );
}
