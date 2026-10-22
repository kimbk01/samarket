"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { memo, useState } from "react";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { StoreCartLineDeleteConfirmDialog } from "@/components/stores/cart/StoreCartLineDeleteConfirmDialog";

export const StoreCartPreviewLineRow = memo(function StoreCartPreviewLineRow({
  line,
  hydrated,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  line: StoreCommerceCartLine;
  hydrated: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const qty = Math.floor(Number(line.qty)) || 0;
  /** S2-13 — 최소 주문 수량에서 「−」는 무반응 대신 장바구니 페이지와 같이 🗑(삭제 확인) */
  const atMin = qty <= Math.max(1, Math.floor(Number(line.minOrderQty)) || 1);
  /** UI-15 — 삭제는 항상 확인 후 */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <li className="flex gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-neutral-900">{line.title}</p>
        {line.optionsSummary?.trim() ? (
          <p className="mt-0.5 text-[12px] text-neutral-500">{line.optionsSummary}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-neutral-700">
            {formatMoneyPhp(Math.floor(Number(line.unitPricePhp) || 0))}
          </span>
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-1">
            <button
              type="button"
              className="flex h-[var(--delivery-touch-min)] w-[var(--delivery-touch-min)] items-center justify-center rounded-full text-lg font-bold text-neutral-700 transition-transform duration-[120ms] active:scale-[0.96]"
              aria-label={atMin ? t("common_delete") : t("store_qty_decrease_aria")}
              disabled={!hydrated}
              onClick={atMin ? () => setDeleteConfirmOpen(true) : onDecrease}
            >
              {atMin ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4h8v2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 16H6L5 6" />
                </svg>
              ) : (
                "−"
              )}
            </button>
            <span className="min-w-[1.5rem] text-center text-[13px] font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              className="flex h-[var(--delivery-touch-min)] w-[var(--delivery-touch-min)] items-center justify-center rounded-full text-lg font-bold text-neutral-700 transition-transform duration-[120ms] active:scale-[0.96]"
              aria-label={t("store_qty_increase_aria")}
              disabled={!hydrated}
              onClick={onIncrease}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="ml-auto inline-flex min-h-[var(--delivery-touch-min)] items-center px-2 text-[12px] font-semibold text-red-600 underline underline-offset-2"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            {t("common_delete")}
          </button>
        </div>
      </div>
      <StoreProductThumbnail src={line.thumbnailUrl} size={56} roundedClassName="rounded-[10px]" />
      <StoreCartLineDeleteConfirmDialog
        open={deleteConfirmOpen}
        lineTitle={line.title}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          onRemove();
        }}
      />
    </li>
  );
});
