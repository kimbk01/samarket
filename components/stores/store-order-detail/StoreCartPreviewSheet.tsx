"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useCallback, useLayoutEffect } from "react";
import { useStoreCommerceCartActionsOptional } from "@/contexts/StoreCommerceCartContext";
import {
  useStoreCommerceCartBucketStats,
  useStoreCommerceCartLines,
} from "@/lib/stores/use-store-commerce-cart-selector";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  STORE_COMMERCE_ACTION_CAPTION_CLASS,
  STORE_COMMERCE_ACTION_PRICE_HERO_CLASS,
  STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS,
  storeCommerceActionRowClass,
  storeCommerceActionSideCtaClass,
} from "@/lib/stores/store-commerce-bottom-action-bar";
import { StoreCartPreviewLineRow } from "@/components/stores/store-order-detail/StoreCartPreviewLineRow";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";

export function StoreCartPreviewSheet({
  open,
  onClose,
  storeId,
  storeSlug,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeSlug: string;
}) {
  const { t } = useI18n();
  const commerceCart = useStoreCommerceCartActionsOptional();
  const lines = useStoreCommerceCartLines(storeId);
  const { subtotalPhp: subtotal, hydrated } = useStoreCommerceCartBucketStats(storeId);

  useLayoutEffect(() => {
    if (open) deliveryRenderTraceBump("cart-preview-sheet", { store_id: storeId });
  }, [open, storeId]);

  const handleDecrease = useCallback(
    (ln: (typeof lines)[number]) => {
      if (!commerceCart) return;
      const q = Math.floor(Number(ln.qty)) || 0;
      const next = Math.max(0, q - 1);
      if (next <= 0) commerceCart.removeLine(ln.lineId);
      else commerceCart.updateLineQuantity(ln.lineId, next);
    },
    [commerceCart]
  );

  const handleIncrease = useCallback(
    (ln: (typeof lines)[number]) => {
      if (!commerceCart) return;
      const q = Math.floor(Number(ln.qty)) || 0;
      const maxQ = Math.max(1, Math.floor(Number(ln.maxOrderQty)) || 99);
      commerceCart.updateLineQuantity(ln.lineId, Math.min(maxQ, q + 1));
    },
    [commerceCart]
  );

  const handleRemove = useCallback(
    (lineId: string) => {
      commerceCart?.removeLine(lineId);
    },
    [commerceCart]
  );

  const cartHref = `/stores/${encodeURIComponent(storeSlug)}/cart`;
  const hasLines = lines.length > 0;

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={t("store_cart_page_title")}
      anchor="above-bottom-nav"
      panelClassName="!max-h-[min(82dvh,640px)]"
      footer={
        <div className="store-commerce-action-plane mt-2 border-t border-[color:var(--overlay-border)]">
          <div className={storeCommerceActionRowClass("menu-cart-idle")}>
            <div className="min-w-0 flex-1 py-0.5">
              <p className={STORE_COMMERCE_ACTION_CAPTION_CLASS}>{t("store_cart_total")}</p>
              <p className={`mt-0.5 ${STORE_COMMERCE_ACTION_PRICE_HERO_CLASS}`}>{formatMoneyPhp(subtotal)}</p>
            </div>
            <Link
              href={cartHref}
              className={storeCommerceActionSideCtaClass(!hasLines)}
              aria-disabled={!hasLines}
              onClick={(e) => {
                if (!hasLines) e.preventDefault();
              }}
            >
              <span className={STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS}>{t("store_cart_view")}</span>
            </Link>
          </div>
        </div>
      }
    >
      {lines.length === 0 ? (
        <p className="py-10 text-center text-sm text-[color:var(--overlay-text-secondary)]">
          {t("store_cart_preview_empty")}
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--overlay-border)] pb-2">
          {lines.map((ln) => (
            <StoreCartPreviewLineRow
              key={ln.lineId}
              line={ln}
              hydrated={hydrated}
              onDecrease={() => handleDecrease(ln)}
              onIncrease={() => handleIncrease(ln)}
              onRemove={() => handleRemove(ln.lineId)}
            />
          ))}
        </ul>
      )}
    </DibayBottomSheet>
  );
}
