"use client";

import Link from "next/link";
import { StoreCommerceCartStrokeIcon } from "@/components/stores/StoreCommerceCartStrokeIcon";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { formatMoneyPhp } from "@/lib/utils/format";

export function StoreDetailBottomStrip({
  slug,
  isOpen,
  deliveryAvailable,
  cartTotalPhp,
  closedDetail,
}: {
  slug: string;
  isOpen: boolean;
  deliveryAvailable: boolean;
  /** 같은 매장 장바구니 소계(클라이언트 localStorage 연동) */
  cartTotalPhp: number;
  /** 준비중일 때 부가 안내(예: Break time) */
  closedDetail?: string | null;
}) {
  const statusText = !isOpen
    ? closedDetail?.trim()
      ? `준비중 · ${closedDetail.trim()}`
      : "지금은 준비 중이에요"
    : deliveryAvailable
      ? "지금 배달이 가능해요"
      : "픽업·방문 가능 여부는 메뉴에서 확인해 주세요";

  const hasCartAmount = cartTotalPhp > 0;
  const cartLinkClass = hasCartAmount
    ? "flex shrink-0 items-center gap-2 rounded-full border border-signature/50 bg-signature px-4 py-2.5 text-[15px] font-semibold text-white shadow-md active:bg-signature/90"
    : "flex shrink-0 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-stone-800 shadow-sm active:bg-stone-100";

  return (
    <div
      className={`fixed left-0 right-0 z-30 border-b border-stone-400 border-t border-stone-200 bg-stone-50/95 px-3 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.05)] backdrop-blur-sm ${BOTTOM_NAV_STACK_ABOVE_CLASS}`}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[13px] font-normal leading-snug text-stone-800">{statusText}</p>
        <Link
          href={`/stores/${encodeURIComponent(slug)}/cart`}
          className={cartLinkClass}
          aria-label={`장바구니 ${formatMoneyPhp(cartTotalPhp)}`}
        >
          <StoreCommerceCartStrokeIcon className="h-4 w-4 shrink-0" />
          <span>{formatMoneyPhp(cartTotalPhp)}</span>
        </Link>
      </div>
    </div>
  );
}
