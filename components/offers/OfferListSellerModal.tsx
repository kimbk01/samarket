"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useEffect, useId } from "react";
import Link from "next/link";
import { OfferListSeller } from "@/components/offers/OfferListSeller";
import { formatPrice } from "@/lib/utils/format";
import type { PriceOfferListItem } from "@/lib/offers/types";

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
 * 단일 스크롤: 헤더·상품 요약은 고정(`shrink-0`), 목록만 `flex-1 min-h-0 overflow-y-auto`.
 * 높이를 뷰포트에 고정해 내부 스크롤 경계를 명확히 함.
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
  const { t } = useI18n();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const titleTrim = typeof productTitle === "string" ? productTitle.trim() : "";
  const priceOk =
    typeof listPrice === "number" && Number.isFinite(listPrice) && listPrice > 0 ? listPrice : null;

  return (
    <div className="fixed inset-0 z-[45] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <button
        type="button"
        aria-label={t("ui_sheet_close_aria")}
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px] sm:bg-black/40"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] flex w-full flex-col overflow-hidden rounded-t-[20px] border border-sam-border border-b-0 bg-sam-surface shadow-[0_-8px_32px_rgba(0,0,0,0.12)] h-[85dvh] max-h-[85dvh] sm:h-auto sm:max-h-[min(88vh,600px)] sm:min-h-[280px] sm:w-full sm:max-w-[480px] sm:rounded-2xl sm:border-b sm:shadow-2xl"
      >
        <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-sam-border" />
        </div>

        <header className="flex shrink-0 items-center gap-2 border-b border-sam-border px-4 pb-3 pt-1 sm:pt-3">
          <h2 id={titleId} className="sam-text-body-lg min-w-0 flex-1 truncate font-bold text-sam-fg">
            받은 가격 제안
          </h2>
          <Link
            href="/my/offers/received"
            className="sam-text-body shrink-0 font-semibold text-sam-primary"
            onClick={onClose}
          >
            전체 보기
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full sam-text-body-lg leading-none text-sam-muted transition-colors hover:bg-sam-surface-muted"
            aria-label={t("ui_sheet_close_aria")}
          >
            ×
          </button>
        </header>

        {(titleTrim.length > 0 || priceOk != null) && (
          <div className="shrink-0 border-b border-sam-border bg-[#F0F2F5] px-4 py-2.5 dark:bg-sam-surface-muted/90">
            {titleTrim.length > 0 ? (
              <p className="truncate text-[15px] font-bold leading-snug text-[#111111] dark:text-sam-fg">{titleTrim}</p>
            ) : null}
            {priceOk != null ? (
              <p
                className={`sam-text-body-secondary leading-[1.4] text-sam-muted ${titleTrim.length > 0 ? "mt-0.5" : ""}`}
              >
                판매가{" "}
                <span className="font-semibold text-sam-fg">{formatPrice(priceOk, currency)}</span>
              </p>
            ) : null}
          </div>
        )}

        {/* 유일한 세로 스크롤 영역 — 목록·로딩·빈 상태·오류 전부 이 안에서만 이동 */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[#F0F2F5] px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] dark:bg-sam-app"
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
      </div>
    </div>
  );
}
