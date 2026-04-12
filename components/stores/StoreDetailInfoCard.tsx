"use client";

import Link from "next/link";
import { StoreDetailSectionTitle } from "@/components/stores/StoreDetailSectionTitle";
import {
  STORE_DETAIL_CARD,
  STORE_DETAIL_GUTTER,
  STORE_DETAIL_METRIC_TILE,
} from "@/lib/stores/store-detail-ui";

type CommerceHint = {
  breakConfigured: boolean;
  breakRangeLabel: string;
  inBreak: boolean;
} | null;

export function StoreDetailInfoCard({
  slug,
  storeName,
  subtitle,
  ratingDisplay,
  reviewCountDisplay,
  favoriteCount,
  recentOrderCount,
  onReviewClick,
  onFavoriteClick,
  isOpen,
  commerce,
  deliveryAvailable,
  pickupAvailable,
  flyerGalleryCount,
  ownerManagementHref,
}: {
  slug: string;
  storeName: string;
  subtitle: string;
  ratingDisplay: string;
  reviewCountDisplay: number;
  favoriteCount: number;
  recentOrderCount: number;
  onReviewClick: () => void;
  /** 찜 토글(상단 바 제거 시 정보 탭에서 처리) */
  onFavoriteClick?: () => void | Promise<void>;
  isOpen: boolean;
  commerce: CommerceHint;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  flyerGalleryCount: number;
  ownerManagementHref?: string | null;
}) {
  const infoHref = `/stores/${encodeURIComponent(slug)}/info`;

  return (
    <section
      className={`${STORE_DETAIL_GUTTER} mt-3 ${STORE_DETAIL_CARD} p-4`}
      aria-label="매장 정보"
    >
      <StoreDetailSectionTitle level="h2">매장 정보</StoreDetailSectionTitle>
      <p className="-mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sam-meta">
        {subtitle}
      </p>
      <p className="mt-2 text-[20px] font-bold leading-tight tracking-tight text-sam-fg">{storeName}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={STORE_DETAIL_METRIC_TILE}>
          <p className="text-[11px] font-medium text-sam-muted">평점</p>
          <p className="mt-0.5 text-[17px] font-bold tabular-nums text-sam-fg">★ {ratingDisplay}</p>
        </div>
        <button
          type="button"
          onClick={onReviewClick}
          className={`${STORE_DETAIL_METRIC_TILE} text-left transition-colors active:bg-sam-surface-muted`}
        >
          <p className="text-[11px] font-medium text-sam-muted">리뷰</p>
          <p className="mt-0.5 text-[17px] font-bold tabular-nums text-signature">
            {reviewCountDisplay.toLocaleString("en-PH")}
          </p>
        </button>
        {onFavoriteClick ? (
          <button
            type="button"
            onClick={() => void onFavoriteClick()}
            className={`${STORE_DETAIL_METRIC_TILE} text-left transition-colors active:bg-sam-surface-muted`}
          >
            <p className="text-[11px] font-medium text-sam-muted">찜</p>
            <p className="mt-0.5 text-[17px] font-bold tabular-nums text-sam-fg">
              {favoriteCount.toLocaleString("en-PH")}
            </p>
          </button>
        ) : (
          <div className={STORE_DETAIL_METRIC_TILE}>
            <p className="text-[11px] font-medium text-sam-muted">찜</p>
            <p className="mt-0.5 text-[17px] font-bold tabular-nums text-sam-fg">
              {favoriteCount.toLocaleString("en-PH")}
            </p>
          </div>
        )}
        <div className={STORE_DETAIL_METRIC_TILE}>
          <p className="text-[11px] font-medium text-sam-muted">최근 주문</p>
          <p className="mt-0.5 text-[17px] font-bold tabular-nums text-sam-fg">
            {recentOrderCount.toLocaleString("en-PH")}+
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-sam-border-soft pt-4">
        <p className="text-[12px] font-semibold text-sam-muted">이용 가능</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center rounded-ui-rect px-2.5 py-1 text-[12px] font-semibold ${
              isOpen ? "bg-emerald-100 text-emerald-900" : "bg-sam-border-soft text-sam-fg"
            }`}
          >
            {isOpen ? "영업 중" : "준비 중"}
          </span>
          {commerce?.breakConfigured ? (
            <span className="inline-flex items-center rounded-ui-rect border border-sam-border bg-signature/5 px-2.5 py-1 text-[12px] font-medium text-sam-fg">
              Break {commerce.breakRangeLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 text-[12px] font-medium text-sam-fg">
            {deliveryAvailable ? "배달" : "배달 불가"}
          </span>
          <span className="inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 text-[12px] font-medium text-sam-fg">
            {pickupAvailable ? "포장·픽업" : "픽업 불가"}
          </span>
        </div>
      </div>

      {commerce?.inBreak ? (
        <p className="mt-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] font-medium leading-snug text-amber-950">
          쉬는 시간에는 메뉴 담기가 제한될 수 있어요.
        </p>
      ) : null}

      {ownerManagementHref ? (
        <Link
          href={ownerManagementHref}
          className="mt-3 block text-center text-[13px] font-semibold text-signature underline decoration-signature/30 underline-offset-2"
        >
          내 상점 관리
        </Link>
      ) : null}

      <Link
        href={infoHref}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-ink px-4 py-3 text-left text-[14px] font-semibold text-white shadow-sm active:bg-sam-surface-dark"
      >
        <span>
          가게정보
          {flyerGalleryCount > 0 ? (
            <span className="mt-0.5 block text-[12px] font-normal text-white/75">
              주소 · 영업 · 소개 사진 {flyerGalleryCount}장
            </span>
          ) : (
            <span className="mt-0.5 block text-[12px] font-normal text-white/75">주소 · 영업 · 안내</span>
          )}
        </span>
        <span className="shrink-0 text-lg text-white/90" aria-hidden>
          →
        </span>
      </Link>
    </section>
  );
}
