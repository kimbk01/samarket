"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { memo } from "react";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

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
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-neutral-700 transition-transform duration-[120ms] active:scale-[0.96]"
              aria-label={t("store_qty_decrease_aria")}
              disabled={!hydrated}
              onClick={onDecrease}
            >
              −
            </button>
            <span className="min-w-[1.5rem] text-center text-[13px] font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-neutral-700 transition-transform duration-[120ms] active:scale-[0.96]"
              aria-label={t("store_qty_increase_aria")}
              disabled={!hydrated}
              onClick={onIncrease}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="ml-auto text-[12px] font-semibold text-red-600 underline underline-offset-2"
            onClick={onRemove}
          >
            삭제
          </button>
        </div>
      </div>
      <StoreProductThumbnail src={line.thumbnailUrl} size={56} roundedClassName="rounded-[10px]" />
    </li>
  );
});
