"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef } from "react";
import {
  STORE_HERO_RUBBER_STRETCH_ATTR,
} from "@/lib/ui/rubber-band-gesture";
import { useRubberBandAtDocumentTop } from "@/lib/ui/use-rubber-band-at-document-top";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";
import { STORE_ORDER_BRAND } from "@/components/stores/store-order-detail/store-order-brand";
import {
  formatStoreDetailDeliveryFeeValue,
  type CommerceExtrasFromHours,
} from "@/lib/stores/store-commerce-extras";
import { type StoreDeliveryMeta } from "@/lib/stores/store-detail-meta";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  openGoogleMapsDrivingDirectionsFromUserTo,
  type StoreDetailDirectionsTarget,
} from "@/lib/stores/google-maps-store-links";
import { storeDetailHeroMediaBoxStyle } from "@/lib/dibay/store-detail-hero-layout";

function InfoRow({
  label,
  value,
  sub,
  action,
}: {
  label: string;
  value: ReactNode;
  sub?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="grid max-w-full grid-cols-[max-content_1fr] gap-x-2.5 gap-y-0 py-1.5 text-[12px] leading-snug">
      <div className="shrink-0 whitespace-nowrap font-bold text-neutral-900">{label}</div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 whitespace-normal break-words font-bold text-neutral-900">{value}</p>
          {action}
        </div>
        {sub ? (
          <p className="mt-0.5 text-[11px] font-semibold" style={{ color: STORE_ORDER_BRAND.accentSoftText }}>
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatReviewCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1000) return "999+";
  return String(Math.floor(n));
}

function formatOrderCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 10000) return "9999+";
  return String(Math.floor(n));
}

export function StoreOrderHeroSummary({
  storeName,
  profileImageUrl,
  ratingAvg,
  reviewCount,
  recentOrderCount,
  deliveryMeta,
  commerceExtras,
  deliveryAvailable,
  pickupAvailable,
  isOpenForOrder,
  commerce,
  fulfillmentMode,
  onFulfillmentChange,
  ownerManagementHref,
  storeInfoHref,
  reviewsHref,
  addressLine,
  directions,
  viewerFavorited,
  favoriteBusy,
  onFavoriteClick,
  collapseTopFulfillmentCard = false,
  /** 사장님 `store_banners` — 있으면 상단 히어로(#store-hero-media)에 노출(갤러리 커버 대체) */
  heroBannerSlot,
  /** 배달 가능일 때 히어로「배달 시간」표시 — 전역 store 수기 / google `delivery-eta` 등 상위에서 전달 */
  deliveryTimeDisplay = "—",
  storeSlug: _storeSlug,
}: {
  storeName: string;
  profileImageUrl: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  recentOrderCount: number;
  deliveryMeta: StoreDeliveryMeta;
  commerceExtras: CommerceExtrasFromHours;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  isOpenForOrder: boolean;
  commerce: {
    breakConfigured: boolean;
    breakRangeLabel: string;
    inBreak: boolean;
  } | null;
  fulfillmentMode: StorePublicFulfillmentMode;
  onFulfillmentChange: (mode: StorePublicFulfillmentMode) => void;
  ownerManagementHref?: string | null;
  storeInfoHref: string;
  /** 리뷰가 있을 때만 전달 · 평점/리뷰 행을 탭 가능한 진입점으로 바꿈 */
  reviewsHref?: string | null;
  addressLine?: string | null;
  /** 탭 시 geolocation origin + 매장 destination — `lib/stores/google-maps-store-links` */
  directions: StoreDetailDirectionsTarget | null;
  viewerFavorited: boolean;
  favoriteBusy: boolean;
  onFavoriteClick: () => void;
  /**
   * 히어로 이미지 상단 오버레이 UX:
   * 스크롤로 헤더가 흰색(elevated) 상태가 되면, 큰 배달/픽업 카드 블록은 접어서
   * 메뉴 영역이 바로 따라오게 한다.
   */
  collapseTopFulfillmentCard?: boolean;
  heroBannerSlot?: ReactNode;
  /** 히어로 배달 시간 한 줄 */
  deliveryTimeDisplay?: string;
  storeSlug?: string | null;
}) {
  const { t, language } = useI18n();
  const heroMediaRef = useRef<HTMLDivElement>(null);

  const syncHeroRubberStretchAttr = useCallback((px: number) => {
    const el = heroMediaRef.current;
    if (!el) return;
    if (px > 0) {
      el.setAttribute(STORE_HERO_RUBBER_STRETCH_ATTR, String(Math.round(px)));
    } else {
      el.removeAttribute(STORE_HERO_RUBBER_STRETCH_ATTR);
    }
  }, []);

  /** 당김 시 레이아웃 높이 + 위로 이동을 같이 줘서 헤더 위 흰 빈 공간이 보이지 않게 함 */
  const { stretch: heroStretch, scale: heroRubberScale } = useRubberBandAtDocumentTop(120, {
    blockNativeViewportOverscroll: true,
    onStretchChange: syncHeroRubberStretchAttr,
  });
  const heroRubberPx = Math.max(0, heroStretch);
  const img = profileImageUrl?.trim() || "";

  /** 당김으로 히어로 높이가 늘 때 검은 여백 대신 이미지가 같이 확대되도록(최소 1 + stretch/기준높이) */
  const heroBannerPullScale = useMemo(() => {
    const pullComp = heroRubberPx > 0 ? 1 + heroRubberPx / 208 : 1;
    return Math.min(2.25, Math.max(heroRubberScale, pullComp));
  }, [heroRubberPx, heroRubberScale]);

  const prepLine = useMemo(() => commerceExtras.estPrepLabel, [commerceExtras.estPrepLabel]);

  const feeDisplay = useMemo((): ReactNode => {
    if (!deliveryAvailable) {
      return formatStoreDetailDeliveryFeeValue(commerceExtras, { deliveryAvailable }, language);
    }
    if (commerceExtras.deliveryFeeMode === "self_free_promo") {
      const strike = commerceExtras.deliveryFeeStrikeReferencePhp;
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-sam-primary">{t("store_free_delivery_applied")}</span>
          {strike != null && strike > 0 ? (
            <span className="font-bold text-neutral-400 line-through">{formatMoneyPhp(strike)}</span>
          ) : null}
        </span>
      );
    }
    return formatStoreDetailDeliveryFeeValue(commerceExtras, { deliveryAvailable }, language);
  }, [commerceExtras, deliveryAvailable, language, t]);

  const minDisplay = useMemo(() => {
    const m = commerceExtras.minOrderPhp;
    if (m != null && m > 0) return t("store_min_amount_or_more", { amount: formatMoneyPhp(m) });
    return t("store_none");
  }, [commerceExtras.minOrderPhp, t]);

  const heroPrepDisplay = useMemo(() => {
    const p = commerceExtras.prepMinutes;
    if (p != null && Number.isFinite(p))
      return t("store_about_minutes", { minutes: Math.round(p) });
    const prepLabel = commerceExtras.estPrepLabel?.trim();
    if (prepLabel) return t("store_about_time", { time: prepLabel });
    return "—";
  }, [commerceExtras.prepMinutes, commerceExtras.estPrepLabel, t]);

  const heroRideDisplay = deliveryTimeDisplay.trim() ? deliveryTimeDisplay : "—";

  const heroDistDisplay = useMemo(() => "—", []);

  const ratingLabel =
    ratingAvg != null && Number.isFinite(Number(ratingAvg)) ? Number(ratingAvg).toFixed(1) : "—";

  const payFull = deliveryMeta.paymentMethodsLine?.trim() || null;
  const addressDisp = addressLine?.trim() || null;

  const onDirectionsClick = useCallback(() => {
    if (!directions) return;
    if (directions.destinationCoords) {
      const { lat, lng } = directions.destinationCoords;
      openGoogleMapsDrivingDirectionsFromUserTo({ kind: "coords", lat, lng });
      return;
    }
    const q = directions.destinationQuery?.replace(/\s+/g, " ").trim();
    if (q) openGoogleMapsDrivingDirectionsFromUserTo({ kind: "query", text: q });
  }, [directions]);
  const deliverySub = useMemo(() => {
    if (!deliveryAvailable) return null;
    if (commerceExtras.deliveryFeeMode === "courier") {
      return t("store_cod_not_in_app");
    }
    if (commerceExtras.deliveryFeeMode === "self_free_promo") {
      return t("store_app_delivery_zero");
    }
    if (commerceExtras.deliveryFeePhp === 0) {
      if (deliveryMeta.freeDeliveryOverPhp != null && deliveryMeta.freeDeliveryOverPhp > 0) {
        return t("store_free_delivery_applied");
      }
      return null;
    }
    if (deliveryMeta.freeDeliveryOverPhp != null && deliveryMeta.freeDeliveryOverPhp > 0) {
      return t("store_free_delivery_over", {
        amount: formatMoneyPhp(deliveryMeta.freeDeliveryOverPhp),
      });
    }
    return null;
  }, [
    deliveryAvailable,
    commerceExtras.deliveryFeeMode,
    commerceExtras.deliveryFeePhp,
    deliveryMeta.freeDeliveryOverPhp,
    t,
  ]);

  const segBase =
    "min-w-0 flex-1 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors duration-[180ms] disabled:cursor-not-allowed disabled:opacity-40";
  const segOn = "bg-sam-surface text-sam-fg shadow-none";
  const segOff = "text-sam-muted active:bg-sam-surface-muted";

  return (
    <div className="relative z-0">
      <div
        className="relative will-change-transform"
        style={
          heroRubberPx > 0
            ? {
                transform: `translateY(${-heroRubberPx}px)`,
                /* translateY 만 주면 높이는 H+stretch 인데 비주얼 끝은 H → 아래 하얀 카드와 stretch 만큼 뜸 → 상쇄 */
                marginBottom: `${-heroRubberPx}px`,
              }
            : undefined
        }
      >
        <div
          ref={heroMediaRef}
          id="store-hero-media"
          className={
            heroBannerSlot
              ? "relative w-full overflow-hidden bg-sam-ink"
              : "relative w-full overflow-hidden bg-[color:var(--delivery-primary)]"
          }
        >
          <div
            className="relative w-full overflow-hidden"
            style={storeDetailHeroMediaBoxStyle(heroRubberPx)}
          >
            {heroBannerSlot ? (
              <div className="absolute inset-0 z-[2] overflow-hidden">
                <div
                  className="absolute inset-0 will-change-[transform]"
                  style={{
                    transform: `translateY(${-heroRubberPx * 0.12}px) scale(${heroBannerPullScale})`,
                    transformOrigin: "50% 0%",
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden">{heroBannerSlot}</div>
                </div>
              </div>
            ) : img ? (
              <div
                className="absolute inset-0 will-change-transform"
                style={{
                  transform: `translateY(${-heroRubberPx * 0.15}px) scale(${heroRubberScale})`,
                  transformOrigin: "center top",
                }}
              >
                <DeliveryMediaImage
                  src={img}
                  alt=""
                  fill
                  className="object-cover"
                  priority
                  surface="detail-hero"
                />
                <div className="absolute inset-0 bg-[color:var(--dibay-dim)] opacity-30" aria-hidden />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-[1] bg-sam-surface px-4 pb-2.5 pt-2.5">
        {ownerManagementHref ? (
          <p className="mb-2">
            <Link
              href={ownerManagementHref}
              className="inline-flex rounded-[4px] bg-sam-primary px-2 py-1 text-[10px] font-bold text-sam-on-primary"
            >
              {t("store_manage_my_shop")}
            </Link>
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="min-w-0 text-[18px] font-extrabold leading-tight tracking-[-0.025em]" style={{ color: STORE_ORDER_BRAND.title }}>
              {storeName}
            </h1>
          </div>
          <button
            type="button"
            aria-label={viewerFavorited ? t("store_favorite_remove_aria") : t("store_favorite_add_aria")}
            disabled={favoriteBusy}
            onClick={() => void onFavoriteClick()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-surface text-sam-fg transition-transform duration-[120ms] active:scale-[0.96]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={viewerFavorited ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              className={viewerFavorited ? "text-red-500" : "text-neutral-600"}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
              />
            </svg>
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-extrabold text-neutral-900">
          {reviewsHref && reviewCount > 0 ? (
            <Link
              href={reviewsHref}
              className="inline-flex flex-wrap items-center gap-2 underline-offset-2 hover:underline touch-manipulation"
              aria-label={t("store_reviews_view_all_aria")}
            >
              <span style={{ color: STORE_ORDER_BRAND.star }}>★ {ratingLabel}({formatReviewCount(reviewCount)})</span>
              <span className="text-neutral-300" aria-hidden>
                ›
              </span>
            </Link>
          ) : (
            <>
              <span style={{ color: STORE_ORDER_BRAND.star }}>★ {ratingLabel}({formatReviewCount(reviewCount)})</span>
            </>
          )}
          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700">
            {t("store_order_count_badge", { count: formatOrderCount(recentOrderCount) })}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] font-semibold text-neutral-500">
          {isOpenForOrder ? <span>{t("store_open_now")}</span> : <span>{t("store_preparing")}</span>}
          {deliveryAvailable ? <span>{t("store_delivery_available")}</span> : null}
          {pickupAvailable ? <span>{t("store_pickup_available")}</span> : null}
          <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700">
            {fulfillmentMode === "local_delivery" ? t("store_delivery_order_mode") : t("store_pickup_order_mode")}
          </span>
        </div>
      </div>

      {collapseTopFulfillmentCard ? null : (
        <section className="bg-sam-surface px-4 pb-2.5" data-store-fulfillment-card>
          <div className="rounded-[12px] border border-sam-border bg-sam-surface shadow-none">
            <div className="flex w-full items-center gap-1 rounded-t-[12px] bg-sam-surface-muted p-0.5">
              <button
                type="button"
                disabled={!deliveryAvailable}
                onClick={() => onFulfillmentChange("local_delivery")}
                className={`${segBase} ${fulfillmentMode === "local_delivery" ? segOn : segOff}`}
              >
                {t("store_delivery_tab")}
              </button>
              <button
                type="button"
                disabled={!pickupAvailable}
                onClick={() => onFulfillmentChange("pickup")}
                className={`${segBase} ${fulfillmentMode === "pickup" ? segOn : segOff}`}
              >
                {t("store_pickup_tab")}
              </button>
            </div>

            <div className="px-3 py-1.5">
              {fulfillmentMode === "local_delivery" ? (
                <>
                  <InfoRow label={t("store_min_order_short")} value={minDisplay} />
                  <InfoRow label={t("store_prep_time_label")} value={heroPrepDisplay} />
                  <InfoRow label={t("store_delivery_time")} value={heroRideDisplay} />
                  <InfoRow label={t("store_route_distance")} value={heroDistDisplay} />
                  <InfoRow label={t("store_delivery_fee")} value={feeDisplay} sub={deliverySub} />
                  {payFull ? <InfoRow label={t("store_payment_methods_label")} value={payFull} /> : null}
                </>
              ) : (
                <>
                  <InfoRow
                    label={t("store_min_order_short")}
                    value={
                      commerceExtras.minOrderPhp != null && commerceExtras.minOrderPhp > 0
                        ? minDisplay
                        : t("store_none")
                    }
                  />
                  <InfoRow label={t("store_pickup_time_label")} value={t("store_about_time", { time: prepLine })} />
                  {payFull ? <InfoRow label={t("store_payment_methods_label")} value={payFull} /> : null}
                  {addressDisp ? (
                    <InfoRow
                      label={t("store_location_guide")}
                      value={addressDisp}
                      action={
                        directions ? (
                          <button
                            type="button"
                            onClick={onDirectionsClick}
                            aria-label={t("store_directions_google_aria")}
                            className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-bold text-neutral-800 touch-manipulation"
                          >
                            {t("store_directions_btn")}
                          </button>
                        ) : null
                      }
                    />
                  ) : null}
                </>
              )}
            </div>
            {commerce?.breakConfigured ? (
              <p className="border-t border-neutral-100 bg-amber-50 px-3.5 py-2 text-center text-[12px] font-bold text-amber-800">
                Break {commerce.breakRangeLabel}
              </p>
            ) : null}
            {deliveryMeta.deliveryNotice.trim() ? (
              <p className="rounded-b-[12px] bg-sam-warning-soft px-3.5 py-2 text-center text-[12px] font-bold text-sam-fg">
                {deliveryMeta.deliveryNotice.trim()}
              </p>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
