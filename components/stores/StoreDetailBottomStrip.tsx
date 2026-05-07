"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { StoreCommerceCartStrokeIcon } from "@/components/stores/StoreCommerceCartStrokeIcon";
import { formatMoneyPhp } from "@/lib/utils/format";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";

/**
 * 매장 메뉴·상품 하단 합계 띠.
 *
 * `ConditionalAppShell` → `AppRouteTransition` 조상에 라우트 전환용 `transform` 이 걸리면,
 * 그 안에서의 `position: fixed` 는 뷰포트가 아니라 해당 조상 기준이 되어 스크롤과 함께 움직인다.
 * → `DeliveryBottomNav` 와 동일하게 `document.body` 로 포털해 항상 뷰포트 하단에 고정한다.
 */
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
  /** 빈 카트일 때는 표시하지 않음 — 담은 뒤에만 뷰포트 하단 고정 띠 노출 */
  if (cartQtyTotal <= 0) return null;

  const [portalToBody, setPortalToBody] = useState(false);
  useEffect(() => {
    setPortalToBody(true);
  }, []);

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

  const minNeed =
    fulfillmentMode === "local_delivery" &&
    minOrderPhp != null &&
    minOrderPhp > 0 &&
    cartTotalPhp > 0 &&
    cartTotalPhp < minOrderPhp
      ? Math.max(0, Math.ceil(minOrderPhp - cartTotalPhp))
      : 0;

  const cartHref = `/stores/${encodeURIComponent(slug)}/cart`;

  const bar = (
    <div
      className="fixed bottom-0 left-0 right-0 z-[45] border-t border-sam-border bg-sam-surface/95 px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(0,0,0,0.1)] backdrop-blur-md"
      data-store-cart-strip="1"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 sam-text-xxs text-sam-muted">
          <span className="min-w-0 truncate font-medium text-sam-fg">{statusText}</span>
          <span className="shrink-0 rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-fg">
            {modeLabel}
          </span>
        </div>
        {minNeed > 0 ? (
          <p className="text-center sam-text-helper font-semibold text-amber-800">
            최소주문까지 {formatMoneyPhp(minNeed)} 남았어요
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="sam-text-body-secondary font-semibold text-sam-fg">
              <span className="tabular-nums">{cartQtyTotal}</span>개 ·{" "}
              <span className="tabular-nums font-bold sam-text-body text-sam-fg">
                {formatMoneyPhp(cartTotalPhp)}
              </span>
            </p>
          </div>
          <Link
            href={cartHref}
            className="flex shrink-0 items-center gap-2 rounded-ui-rect bg-signature px-5 py-3 sam-text-body font-bold text-white shadow-md ring-2 ring-signature/25 active:bg-signature/90"
            aria-label="주문 확인으로 이동"
          >
            <StoreCommerceCartStrokeIcon className="h-5 w-5 shrink-0 text-current" />
            주문 확인
          </Link>
        </div>
      </div>
    </div>
  );

  if (portalToBody && typeof document !== "undefined") {
    return createPortal(bar, document.body);
  }
  return bar;
}
