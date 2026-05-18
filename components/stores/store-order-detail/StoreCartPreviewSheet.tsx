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
import { DIBAY_CART_PRIMARY_BTN_CLASS } from "@/components/stores/cart/StoreCommerceCartBottomSheet";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { StoreCartPreviewLineRow } from "@/components/stores/store-order-detail/StoreCartPreviewLineRow";

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

  if (!open) return null;

  const cartHref = `/stores/${encodeURIComponent(storeSlug)}/cart`;

  return (
    <div className="fixed inset-0 z-[110]" role="dialog" aria-modal aria-labelledby="store-cart-preview-title">
      <button type="button" className="absolute inset-0 bg-black/45 transition-opacity duration-[220ms]" aria-label={t("common_close")} onClick={onClose} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[18dvh] flex justify-center p-0 sm:p-3">
        <div
          className={`pointer-events-auto flex h-full w-full min-w-0 flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl transition-transform duration-[220ms] ease-out ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
          style={{
            paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="flex shrink-0 flex-col items-center pt-2 pb-1">
            <span className="h-1 w-10 rounded-full bg-neutral-300" aria-hidden />
            <h2 id="store-cart-preview-title" className="mt-2 px-4 text-center text-[16px] font-bold text-neutral-900">
              {t("store_cart_page_title")}
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [-webkit-overflow-scrolling:touch]">
            {lines.length === 0 ? (
              <p className="py-10 text-center text-[14px] text-neutral-500">{t("store_cart_preview_empty")}</p>
            ) : (
              <ul className="divide-y divide-neutral-100 pb-2">
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
          </div>

          <div className="shrink-0 border-t border-neutral-100 px-4 pt-3">
            <div className="mb-3 flex items-center justify-between text-[15px] font-bold">
              <span className="text-neutral-600">{t("store_cart_total")}</span>
              <span className="tabular-nums text-neutral-900">{formatMoneyPhp(subtotal)}</span>
            </div>
            <Link href={cartHref} className={DIBAY_CART_PRIMARY_BTN_CLASS}>
              카트 보기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
