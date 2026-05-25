"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { StoreProductAddSheet } from "@/components/stores/StoreProductAddSheet";
import { useStoreProductSheetUIStore } from "@/lib/stores/store-product-sheet-ui-store";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";

import { showStoreDetailToast } from "@/lib/stores/store-detail-toast-ui-store";

/**
 * `/stores` 트리 최상단에 1회 마운트 — sheet state 변경이 `StoreDetailPublic` 에 전파되지 않음.
 */
export function StoreProductSheetPortal() {
  const { t } = useI18n();
  const productId = useStoreProductSheetUIStore((s) => s.productId);
  const pageStoreSlug = useStoreProductSheetUIStore((s) => s.pageStoreSlug);
  const prefetchedListRow = useStoreProductSheetUIStore((s) => s.prefetchedListRow);
  const sheetStoreContext = useStoreProductSheetUIStore((s) => s.sheetStoreContext);
  const commerceBlocked = useStoreProductSheetUIStore((s) => s.commerceBlocked);
  const commerceBlockedHint = useStoreProductSheetUIStore((s) => s.commerceBlockedHint);
  const editCartLine = useStoreProductSheetUIStore((s) => s.editCartLine);
  const closeSheet = useStoreProductSheetUIStore((s) => s.closeSheet);

  useLayoutEffect(() => {
    deliveryRenderTraceBump("sheet-portal");
  });

  const portalRoot =
    typeof document !== "undefined" ? document.body : null;

  if (!productId || !portalRoot) return null;

  return createPortal(
    <StoreProductAddSheet
      productId={productId}
      pageStoreSlug={pageStoreSlug}
      prefetchedListRow={prefetchedListRow}
      sheetStoreContext={sheetStoreContext}
      onClose={closeSheet}
      commerceBlocked={commerceBlocked}
      commerceBlockedHint={commerceBlockedHint}
      onAddedToCart={() => {
        const sid = sheetStoreContext?.store?.id;
        if (!sid) return;
        showStoreDetailToast(
          sid,
          editCartLine ? t("store_cart_option_updated_toast") : t("store_cart_added_short_toast")
        );
      }}
    />,
    portalRoot
  );
}
