"use client";

import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import { BAEMIN_CART_TYPE } from "@/lib/stores/store-baemin-cart-ui";
import { resolveCartLineListUnitPhp } from "@/lib/stores/store-product-pricing";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

export function StoreBaeminCartLineRow({
  line,
  busy,
  noneLabel,
  deleteLabel,
  onRemove,
  onChangeOptions,
  onDecrease,
  onIncrease,
}: {
  line: StoreCommerceCartLine;
  busy: boolean;
  noneLabel: string;
  deleteLabel: string;
  onRemove: () => void;
  onChangeOptions: () => void;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const lineTotal = line.unitPricePhp * line.qty;
  const listU = resolveCartLineListUnitPhp(line);
  const baseUnit = listU ?? line.unitPricePhp;
  const showTrash = line.qty <= line.minOrderQty;
  const optionsText = line.optionsSummary?.trim() || noneLabel;

  return (
    <article className={`px-4 ${BAEMIN_CART_TYPE.rowPy}`}>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className={`${BAEMIN_CART_TYPE.itemTitle} text-[#111111]`}>{line.title}</p>
          <p className={`mt-1 ${BAEMIN_CART_TYPE.priceMeta}`}>
            {"\uac00\uaca9"} : {formatMoneyPhp(baseUnit)}
          </p>
          <p className={`mt-1 whitespace-pre-wrap ${BAEMIN_CART_TYPE.bodyMuted}`}>{optionsText}</p>
          {line.lineNote?.trim() ? (
            <p className="mt-1 text-[13px] leading-relaxed text-[#B45309]">
              {"\uc694\uccad"}: {line.lineNote.trim()}
            </p>
          ) : null}
          <p className={`mt-2 ${BAEMIN_CART_TYPE.itemTotal} text-[#111111]`}>
            {formatMoneyPhp(lineTotal)}
          </p>
        </div>
        <StoreProductThumbnail
          src={line.thumbnailUrl}
          size={72}
          roundedClassName="rounded-[8px]"
          className={BAEMIN_CART_TYPE.thumb}
        />
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onChangeOptions}
          className={`inline-flex items-center justify-center border border-[#E0E0E0] bg-white text-[#333333] active:bg-[#F7F7F7] disabled:opacity-40 ${BAEMIN_CART_TYPE.btnOption}`}
        >
          {"\uc635\uc158 \ubcc0\uacbd"}
        </button>
        <div
          className={`flex items-stretch overflow-hidden rounded-[8px] border border-[#E0E0E0] bg-white ${BAEMIN_CART_TYPE.btnQty}`}
        >
          <button
            type="button"
            disabled={busy}
            onClick={showTrash ? onRemove : onDecrease}
            className="flex w-9 items-center justify-center text-[#555555] active:bg-[#F7F7F7] disabled:opacity-30"
            aria-label={showTrash ? deleteLabel : "\uc218\ub7c9 \uc904\uc774\uae30"}
          >
            {showTrash ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4h8v2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 16H6L5 6" />
              </svg>
            ) : (
              <span className="text-[18px] leading-none">{"\u2212"}</span>
            )}
          </button>
          <span className="flex min-w-[2rem] items-center justify-center border-x border-[#E0E0E0] text-[15px] font-bold tabular-nums text-[#111111]">
            {line.qty}
          </span>
          <button
            type="button"
            disabled={busy || line.qty >= line.maxOrderQty}
            onClick={onIncrease}
            className="flex w-9 items-center justify-center text-[18px] font-medium text-[#111111] active:bg-[#F7F7F7] disabled:opacity-30"
            aria-label={"\uc218\ub7c9 \ub298\ub9ac\uae30"}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}
