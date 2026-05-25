"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const { t } = useI18n();
  const infoHref = `/stores/${encodeURIComponent(slug)}/info`;

  return (
    <section
      className={`${STORE_DETAIL_GUTTER} mt-3 ${STORE_DETAIL_CARD} p-4`}
      aria-label={t("store_info_aria")}
    >
      <StoreDetailSectionTitle level="h2">{t("store_info_title")}</StoreDetailSectionTitle>
      <p className="-mt-1 sam-text-xxs font-semibold uppercase tracking-[0.14em] text-sam-meta">
        {subtitle}
      </p>
      <p className="mt-2 sam-text-page-title font-bold leading-tight tracking-tight text-sam-fg">{storeName}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={STORE_DETAIL_METRIC_TILE}>
          <p className="sam-text-xxs font-medium text-sam-muted">{t("store_rating_label")}</p>
          <p className="mt-0.5 sam-text-section-title font-bold tabular-nums text-sam-fg">★ {ratingDisplay}</p>
        </div>
        <button
          type="button"
          onClick={onReviewClick}
          className={`${STORE_DETAIL_METRIC_TILE} text-left transition-colors active:bg-sam-surface-muted`}
        >
          <p className="sam-text-xxs font-medium text-sam-muted">{t("store_reviews_title")}</p>
          <p className="mt-0.5 sam-text-section-title font-bold tabular-nums text-signature">
            {reviewCountDisplay.toLocaleString("en-PH")}
          </p>
        </button>
        {onFavoriteClick ? (
          <button
            type="button"
            onClick={() => void onFavoriteClick()}
            className={`${STORE_DETAIL_METRIC_TILE} text-left transition-colors active:bg-sam-surface-muted`}
          >
            <p className="sam-text-xxs font-medium text-sam-muted">{t("store_favorites_label")}</p>
            <p className="mt-0.5 sam-text-section-title font-bold tabular-nums text-sam-fg">
              {favoriteCount.toLocaleString("en-PH")}
            </p>
          </button>
        ) : (
          <div className={STORE_DETAIL_METRIC_TILE}>
            <p className="sam-text-xxs font-medium text-sam-muted">{t("store_favorites_label")}</p>
            <p className="mt-0.5 sam-text-section-title font-bold tabular-nums text-sam-fg">
              {favoriteCount.toLocaleString("en-PH")}
            </p>
          </div>
        )}
        <div className={STORE_DETAIL_METRIC_TILE}>
          <p className="sam-text-xxs font-medium text-sam-muted">{t("store_recent_orders")}</p>
          <p className="mt-0.5 sam-text-section-title font-bold tabular-nums text-sam-fg">
            {recentOrderCount.toLocaleString("en-PH")}+
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-sam-border-soft pt-4">
        <p className="sam-text-helper font-semibold text-sam-muted">{t("store_available")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center rounded-ui-rect px-2.5 py-1 sam-text-helper font-semibold ${
              isOpen ? "bg-emerald-100 text-emerald-900" : "bg-sam-border-soft text-sam-fg"
            }`}
          >
            {isOpen ? t("store_open_now") : t("store_preparing_short")}
          </span>
          {commerce?.breakConfigured ? (
            <span className="inline-flex items-center rounded-ui-rect border border-sam-border bg-signature/5 px-2.5 py-1 sam-text-helper font-medium text-sam-fg">
              Break {commerce.breakRangeLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-helper font-medium text-sam-fg">
            {deliveryAvailable ? t("store_delivery_yes_short") : t("store_delivery_no_short")}
          </span>
          <span className="inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-helper font-medium text-sam-fg">
            {pickupAvailable ? t("store_pickup_yes_short") : t("store_pickup_no_short")}
          </span>
        </div>
      </div>

      {commerce?.inBreak ? (
        <p className="mt-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2.5 sam-text-helper font-medium leading-snug text-amber-950">
          {t("store_commerce_summary_disclaimer")}
        </p>
      ) : null}

      {ownerManagementHref ? (
        <Link
          href={ownerManagementHref}
          className="mt-3 block text-center sam-text-body-secondary font-semibold text-signature underline decoration-signature/30 underline-offset-2"
        >
          {t("store_manage_my_shop")}
        </Link>
      ) : null}

      <Link
        href={infoHref}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-ink px-4 py-3 text-left sam-text-body font-semibold text-white shadow-sm active:bg-sam-surface-dark"
      >
        <span>
          {t("store_store_info_menu")}
          {flyerGalleryCount > 0 ? (
            <span className="mt-0.5 block sam-text-helper font-normal text-white/75">
              {`${t("store_location")} · ${t("store_hours_weekday")} · ${t("store_flyer_intro_title")} ${flyerGalleryCount.toLocaleString("en-PH")}`}
            </span>
          ) : (
            <span className="mt-0.5 block sam-text-helper font-normal text-white/75">{t("store_info_card_sub")}</span>
          )}
        </span>
        <span className="shrink-0 text-lg text-white/90" aria-hidden>
          →
        </span>
      </Link>
    </section>
  );
}
