"use client";

import Link from "next/link";
import { StoreCommerceCartStrokeIcon } from "@/components/stores/StoreCommerceCartStrokeIcon";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { formatMoneyPhp } from "@/lib/utils/format";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";

export function StoreDetailBottomStrip({
  slug,
  isOpen,
  deliveryAvailable,
  fulfillmentMode,
  cartTotalPhp,
  cartQtyTotal,
  minOrderPhp,
  closedDetail,
}: {
  slug: string;
  isOpen: boolean;
  deliveryAvailable: boolean;
  fulfillmentMode: StorePublicFulfillmentMode;
  cartTotalPhp: number;
  cartQtyTotal: number;
  minOrderPhp: number | null;
  closedDetail?: string | null;
}) {
  const modeLabel =
    fulfillmentMode === "local_delivery"
      ? deliveryAvailable
        ? "배달"
        : "배달 불가"
      : "포장·픽업";

  const statusText = !isOpen
    ? closedDetail?.trim()
      ? `준비중 · ${closedDetail.trim()}`
      : "지금은 준비 중이에요"
    : deliveryAvailable && fulfillmentMode === "local_delivery"
      ? "지금 배달 주문 가능해요"
      : "지금 포장·픽업 주문 가능해요";

  const hasCart = cartTotalPhp > 0;
  const minNeed =
    fulfillmentMode === "local_delivery" &&
    minOrderPhp != null &&
    minOrderPhp > 0 &&
    cartTotalPhp > 0 &&
    cartTotalPhp < minOrderPhp
      ? Math.max(0, Math.ceil(minOrderPhp - cartTotalPhp))
      : 0;

  const cartHref = `/stores/${encodeURIComponent(slug)}/cart`;

  return (
    <div
      className={`fixed left-0 right-0 z-30 border-t border-stone-200 bg-white/95 shadow-[0_-6px_24px_rgba(0,0,0,0.1)] backdrop-blur-md ${BOTTOM_NAV_STACK_ABOVE_CLASS} ${
        hasCart ? "px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]" : "px-3 py-1.5 pb-[max(8px,env(safe-area-inset-bottom))]"
      }`}
    >
      <div className={`mx-auto flex max-w-lg flex-col ${hasCart ? "gap-1.5" : "gap-0.5"}`}>
        {hasCart ? (
          <>
            <div className="flex items-center justify-between gap-2 text-[11px] text-stone-600">
              <span className="min-w-0 truncate font-medium text-stone-700">{statusText}</span>
              <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                {modeLabel}
              </span>
            </div>
            {minNeed > 0 ? (
              <p className="text-center text-[12px] font-semibold text-amber-800">
                최소주문까지 {formatMoneyPhp(minNeed)} 남았어요
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex items-center justify-between gap-2 text-[10px] text-stone-500">
            <span className="min-w-0 truncate">{statusText}</span>
            <span className="shrink-0 rounded-full bg-stone-100/90 px-1.5 py-0.5 text-[9px] font-semibold text-stone-600">
              {modeLabel}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={
                hasCart
                  ? "text-[13px] font-semibold text-stone-800"
                  : "text-[12px] font-medium text-stone-500"
              }
            >
              <span className="tabular-nums">{cartQtyTotal}</span>개 ·{" "}
              <span
                className={`tabular-nums font-bold text-stone-900 ${hasCart ? "text-[15px]" : "text-[13px]"}`}
              >
                {formatMoneyPhp(cartTotalPhp)}
              </span>
            </p>
            {hasCart ? null : (
              <p className="mt-0.5 text-[10px] text-stone-400">메뉴에서 담기</p>
            )}
          </div>
          <Link
            href={cartHref}
            className={
              hasCart
                ? "flex shrink-0 items-center gap-2 rounded-2xl bg-signature px-5 py-3 text-[15px] font-bold text-white shadow-md ring-2 ring-signature/25 active:bg-signature/90"
                : "flex shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[12px] font-semibold text-stone-600 active:bg-stone-100"
            }
            aria-label={hasCart ? "주문 확인으로 이동" : "장바구니로 이동"}
          >
            <StoreCommerceCartStrokeIcon className={`shrink-0 text-current ${hasCart ? "h-5 w-5" : "h-4 w-4"}`} />
            {hasCart ? "주문 확인" : "장바구니"}
          </Link>
        </div>
      </div>
    </div>
  );
}
