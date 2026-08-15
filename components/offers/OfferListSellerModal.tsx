"use client";

import Link from "next/link";
import { OfferListSeller } from "@/components/offers/OfferListSeller";
import { formatPrice } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type Props = {
  open: boolean;
  onClose: () => void;
  productId: string;
  currency: string;
  viewerUserId: string | null | undefined;
  refreshToken: number;
  onOffersChanged?: () => void;
  initialOffers?: PriceOfferListItem[];
  productTitle?: string | null;
  /** 상품 판매가 — 헤더 아래 한 줄 요약 */
  listPrice?: number | null;
};

/**
 * 단일 스크롤: 헤더·상품 요약은 고정(`shrink-0`), 목록만 스크롤.
 */
export function OfferListSellerModal({
  open,
  onClose,
  productId,
  currency,
  viewerUserId,
  refreshToken,
  onOffersChanged,
  initialOffers,
  productTitle,
  listPrice,
}: Props) {
  const titleTrim = typeof productTitle === "string" ? productTitle.trim() : "";
  const priceOk =
    typeof listPrice === "number" && Number.isFinite(listPrice) && listPrice > 0 ? listPrice : null;

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title="받은 가격 제안"
      anchor="above-bottom-nav"
      panelClassName="!max-h-[min(85dvh,600px)]"
    >
      <div className="mb-2 flex justify-end">
        <Link
          href="/mypage/offers/received"
          className="shrink-0 text-sm font-semibold text-[color:var(--overlay-primary)]"
          onClick={onClose}
        >
          전체 보기
        </Link>
      </div>
      {(titleTrim.length > 0 || priceOk != null) && (
        <div className="mb-2 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3 py-2.5">
          {titleTrim.length > 0 ? (
            <p className="truncate text-[15px] font-bold leading-snug text-[color:var(--overlay-text-primary)]">
              {titleTrim}
            </p>
          ) : null}
          {priceOk != null ? (
            <p className={`${OverlayUi.caption} ${titleTrim.length > 0 ? "mt-0.5" : ""}`}>
              판매가{" "}
              <span className="font-semibold text-[color:var(--overlay-text-primary)]">
                {formatPrice(priceOk, currency)}
              </span>
            </p>
          ) : null}
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        data-offer-received-scroll="true"
      >
        <OfferListSeller
          variant="modal"
          productId={productId}
          currency={currency}
          viewerUserId={viewerUserId}
          refreshToken={refreshToken}
          onChanged={onOffersChanged}
          initialOffers={initialOffers}
        />
      </div>
    </DibayBottomSheet>
  );
}
