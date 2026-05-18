"use client";

import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import { STORE_CART_OTHER_STORE_CONFLICT } from "@/lib/stores/store-cart-policy";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  CART_POPUP_BTN_DANGER,
  CART_POPUP_BTN_GHOST,
  CART_POPUP_BTN_SECONDARY,
  CART_POPUP_RADIUS_CLASS,
  StoreCommerceCartAlert,
  StoreCommerceCartCenterPopup,
} from "@/components/stores/cart/StoreCommerceCartCenterPopup";

export type StoreCartConflictPendingAdd = {
  title: string;
  optionsSummary: string;
  qty: number;
  lineTotalPhp: number;
};

function CartConflictReadonlyLine({
  title,
  optionsSummary,
  qty,
  lineTotalPhp,
}: {
  title: string;
  optionsSummary?: string;
  qty: number;
  lineTotalPhp: number;
}) {
  const q = Math.max(1, Math.floor(qty) || 1);
  return (
    <li className="flex items-start justify-between gap-3 border-b border-neutral-100 px-2.5 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-900">{title}</p>
        {optionsSummary?.trim() ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500">
            {optionsSummary.trim()}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] tabular-nums text-neutral-500">×{q}</p>
        <p className="text-[13px] font-bold tabular-nums text-neutral-900">
          {formatMoneyPhp(lineTotalPhp)}
        </p>
      </div>
    </li>
  );
}

function CartConflictSection({
  tone,
  storeName,
  itemCount,
  subtotalPhp,
  lines,
  pendingAdd,
}: {
  tone: "current" | "pending";
  storeName: string;
  itemCount?: number;
  subtotalPhp?: number;
  lines?: StoreCommerceCartLine[];
  pendingAdd?: StoreCartConflictPendingAdd | null;
}) {
  const isCurrent = tone === "current";
  const label = isCurrent
    ? STORE_CART_OTHER_STORE_CONFLICT.currentCartLabel
    : STORE_CART_OTHER_STORE_CONFLICT.pendingAddLabel;

  return (
    <section className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p
          className={`text-[12px] font-bold ${isCurrent ? "text-red-600" : "text-[#1C8DB8]"}`}
        >
          {label}
        </p>
        <p className="min-w-0 truncate text-right text-[13px] font-bold text-neutral-900">
          {storeName}
        </p>
      </div>

      <div
        className={`overflow-hidden border border-neutral-200 bg-white ${CART_POPUP_RADIUS_CLASS}`}
      >
        {isCurrent && lines && lines.length > 0 ? (
          <ul className="max-h-[min(36vh,11rem)] overflow-y-auto overscroll-contain">
            {lines.map((ln) => {
              const q = Math.max(1, Math.floor(Number(ln.qty)) || 1);
              const unit = Math.max(0, Math.floor(Number(ln.unitPricePhp)) || 0);
              return (
                <CartConflictReadonlyLine
                  key={ln.lineId}
                  title={ln.title}
                  optionsSummary={ln.optionsSummary}
                  qty={q}
                  lineTotalPhp={unit * q}
                />
              );
            })}
          </ul>
        ) : null}

        {!isCurrent && pendingAdd ? (
          <ul>
            <CartConflictReadonlyLine
              title={pendingAdd.title}
              optionsSummary={pendingAdd.optionsSummary}
              qty={pendingAdd.qty}
              lineTotalPhp={pendingAdd.lineTotalPhp}
            />
          </ul>
        ) : null}

        {isCurrent && (!lines || lines.length === 0) ? (
          <p className="px-2.5 py-3 text-center text-[12px] text-neutral-500">담긴 메뉴 없음</p>
        ) : null}

        {isCurrent && subtotalPhp != null ? (
          <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-2.5 py-2">
            <span className="text-[12px] font-semibold text-neutral-600">
              {STORE_CART_OTHER_STORE_CONFLICT.listTotal}
              {itemCount != null && itemCount > 0 ? (
                <span className="ml-1 font-normal text-neutral-500">· {itemCount}종</span>
              ) : null}
            </span>
            <span className="text-[14px] font-bold tabular-nums text-neutral-900">
              {formatMoneyPhp(subtotalPhp)}
            </span>
          </div>
        ) : null}

        {!isCurrent && pendingAdd ? (
          <div className="flex items-center justify-between border-t border-neutral-200 bg-[#E6F4F9]/50 px-2.5 py-2">
            <span className="text-[12px] font-semibold text-[#1C8DB8]">
              {STORE_CART_OTHER_STORE_CONFLICT.listTotal}
            </span>
            <span className="text-[14px] font-bold tabular-nums text-neutral-900">
              {formatMoneyPhp(pendingAdd.lineTotalPhp)}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 다른 매장 카트 충돌 — 가운데 팝업 · 현재 카트 메뉴 리스트 + 담으려는 메뉴
 */
export function StoreCartOtherStoreConflictDialog({
  open,
  replaceBusy = false,
  existingStoreName,
  nextStoreName,
  existingItemCount,
  existingSubtotalPhp,
  existingLines,
  pendingAdd,
  onViewCart,
  onCancel,
  onClearAndAdd,
}: {
  open: boolean;
  replaceBusy?: boolean;
  existingStoreName: string;
  nextStoreName: string;
  existingItemCount: number;
  existingSubtotalPhp: number;
  existingLines: StoreCommerceCartLine[];
  pendingAdd: StoreCartConflictPendingAdd | null;
  onViewCart: () => void;
  onCancel: () => void;
  onClearAndAdd: () => void;
}) {
  const existingLabel = existingStoreName.trim() || "다른 가게";
  const nextLabel = nextStoreName.trim();
  const visibleLines = existingLines.filter((l) => Math.floor(Number(l.qty) || 0) > 0);

  return (
    <StoreCommerceCartCenterPopup
      open={open}
      title={STORE_CART_OTHER_STORE_CONFLICT.title}
      titleId="store-cart-conflict-title"
      busy={replaceBusy}
      onBackdropClose={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onViewCart}
            disabled={replaceBusy}
            className={CART_POPUP_BTN_SECONDARY}
          >
            {STORE_CART_OTHER_STORE_CONFLICT.viewCart}
          </button>
          <button
            type="button"
            onClick={onClearAndAdd}
            disabled={replaceBusy}
            className={CART_POPUP_BTN_DANGER}
          >
            {replaceBusy ? "처리 중…" : STORE_CART_OTHER_STORE_CONFLICT.confirm}
          </button>
          <button type="button" onClick={onCancel} disabled={replaceBusy} className={CART_POPUP_BTN_GHOST}>
            {STORE_CART_OTHER_STORE_CONFLICT.cancel}
          </button>
        </>
      }
    >
      <StoreCommerceCartAlert>{STORE_CART_OTHER_STORE_CONFLICT.singleStoreRule}</StoreCommerceCartAlert>

      <CartConflictSection
        tone="current"
        storeName={existingLabel}
        itemCount={existingItemCount}
        subtotalPhp={existingSubtotalPhp}
        lines={visibleLines}
      />

      {nextLabel && pendingAdd ? (
        <CartConflictSection tone="pending" storeName={nextLabel} pendingAdd={pendingAdd} />
      ) : nextLabel ? (
        <section className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-[12px] font-bold text-[#1C8DB8]">
              {STORE_CART_OTHER_STORE_CONFLICT.pendingAddLabel}
            </p>
            <p className="truncate text-[13px] font-bold text-neutral-900">{nextLabel}</p>
          </div>
        </section>
      ) : null}
    </StoreCommerceCartCenterPopup>
  );
}
