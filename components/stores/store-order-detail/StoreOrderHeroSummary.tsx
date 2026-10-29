"use client";
import { StoreSampleStoreBadge } from "@/components/stores/StoreSampleStoreBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import Link from "next/link";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { STORE_DETAIL_HERO_ASPECT_RATIO } from "@/lib/dibay/store-detail-hero-layout";
import { DELIVERY_TOUCH_HIT_EXPAND_CLASS } from "@/lib/stores/delivery-touch-target";

function InfoRow({
  label,
  value,
  sub,
  /** Keep fee-row sub slot reserved so async meta cannot rebase summary height after land. */
  reserveSubSlot = false,
  action,
}: {
  label: string;
  value: ReactNode;
  sub?: string | null;
  reserveSubSlot?: boolean;
  action?: ReactNode;
}) {
  const showSubSlot = Boolean(sub) || reserveSubSlot;
  return (
    <div className="grid max-w-full grid-cols-[max-content_1fr] gap-x-2.5 gap-y-0 py-1.5 text-[12px] leading-snug">
      <div className="shrink-0 whitespace-nowrap font-bold text-sam-fg">{label}</div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 whitespace-normal break-words font-bold text-sam-fg">{value}</p>
          {action}
        </div>
        {showSubSlot ? (
          <p
            className="mt-0.5 text-[11px] font-semibold"
            style={{
              color: STORE_ORDER_BRAND.accentSoftText,
              visibility: sub ? "visible" : "hidden",
            }}
            aria-hidden={sub ? undefined : true}
          >
            {sub || "\u00a0"}
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
  heroImageUrl,
  logoUrl = null,
  onHeroPress,
  closedNoticeText = null,
  ratingAvg,
  reviewCount,
  recentOrderCount,
  deliveryMeta,
  commerceExtras,
  deliveryAvailable,
  pickupAvailable,
  isOpenForOrder,
  isSampleStore = false,
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
  /** WP6 — 히어로 단일 이미지(갤러리 첫 장 또는 대표 메뉴 사진). 배너가 있으면 `heroBannerSlot` 우선 */
  heroImageUrl: string | null;
  /** WP6 — 매장 로고(`profile_image_url`) — 히어로 왼쪽 아래 원형 60px. 없으면 숨김 */
  logoUrl?: string | null;
  /** WP6 — 히어로 누름 → 전체 화면 사진 보기 (사진이 없으면 undefined) */
  onHeroPress?: () => void;
  /** WP6 — 영업 종료일 때 카드 안 「운영안내 …」 줄 */
  closedNoticeText?: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  recentOrderCount: number;
  deliveryMeta: StoreDeliveryMeta;
  commerceExtras: CommerceExtrasFromHours;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  isOpenForOrder: boolean;
  /** 묶음3-A S-03 — 샘플 매장 배지 (영업 표시는 영업시간 그대로) */
  isSampleStore?: boolean;
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
  const img = heroImageUrl?.trim() || "";
  const logo = logoUrl?.trim() || "";
  /** WP6 — 배달 카드: 최소주문·배달 시간·배달비만 기본, 나머지(조리·거리·결제)는 ⌄ 펼침 */
  const [fulfillmentExpanded, setFulfillmentExpanded] = useState(false);
  const onHeroClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!onHeroPress) return;
      const target = e.target as Element | null;
      /** 배너 링크·캐러셀 버튼 누름은 기존 동작 유지 */
      if (target?.closest?.("a,button")) return;
      onHeroPress();
    },
    [onHeroPress]
  );

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
            <span className="font-bold text-sam-meta line-through">{formatMoneyPhp(strike)}</span>
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
            className={`relative w-full overflow-hidden ${onHeroPress ? "cursor-zoom-in" : ""}`}
            data-store-hero-aspect="4:3"
            onClick={onHeroPress ? onHeroClick : undefined}
          >
            {/* WP6 — 높이 = 콘텐츠 폭 × 0.75 (4:3) + 당김 늘어남 */}
            <div aria-hidden style={{ aspectRatio: STORE_DETAIL_HERO_ASPECT_RATIO, width: "100%" }} />
            {heroRubberPx > 0 ? <div aria-hidden style={{ height: heroRubberPx }} /> : null}
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
            {logo ? (
              <span
                className="pointer-events-none absolute bottom-3 left-4 z-[3] h-[60px] w-[60px] overflow-hidden rounded-full border-2 border-white bg-sam-surface"
                data-store-hero-logo="1"
                aria-hidden
              >
                <SamarketThumbnail
                  src={logo}
                  alt=""
                  fill
                  roundedClassName="rounded-full"
                  fetchDisplayPx={120}
                  className="h-full w-full"
                  loading="eager"
                />
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-[1] bg-sam-surface px-4 pb-2.5 pt-2.5">
        {ownerManagementHref ? (
          <p className="mb-2">
            <Link
              href={ownerManagementHref}
              className={`inline-flex rounded-ui-rect bg-sam-primary px-2 py-1 text-[10px] font-bold text-sam-on-primary ${DELIVERY_TOUCH_HIT_EXPAND_CLASS}`}
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
              className={viewerFavorited ? "text-sam-danger" : "text-sam-muted"}
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

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-extrabold text-sam-fg">
          {reviewsHref && reviewCount > 0 ? (
            <Link
              href={reviewsHref}
              className="inline-flex flex-wrap items-center gap-2 underline-offset-2 hover:underline touch-manipulation"
              aria-label={t("store_reviews_view_all_aria")}
            >
              <span style={{ color: STORE_ORDER_BRAND.star }}>★ {ratingLabel}({formatReviewCount(reviewCount)})</span>
              <span className="text-sam-border" aria-hidden>
                ›
              </span>
            </Link>
          ) : (
            <>
              <span style={{ color: STORE_ORDER_BRAND.star }}>★ {ratingLabel}({formatReviewCount(reviewCount)})</span>
            </>
          )}
          <span className="rounded-full bg-sam-surface-muted px-1.5 py-0.5 text-[10px] font-bold text-sam-muted">
            {t("store_order_count_badge", { count: formatOrderCount(recentOrderCount) })}
          </span>
          {/* WP6 — 「가게정보」: 주소·영업시간·휴무·전화·소개·공지 (기존 /stores/[slug]/info 화면) */}
          <Link
            href={storeInfoHref}
            className={`ml-auto inline-flex items-center rounded-full border border-sam-border bg-sam-surface px-2.5 py-1 text-[11px] font-bold text-sam-fg touch-manipulation ${DELIVERY_TOUCH_HIT_EXPAND_CLASS}`}
            data-store-info-pill="1"
          >
            {t("store_shop_info_title")}
          </Link>
        </div>

        {isSampleStore ? (
          <div className="mt-1.5">
            <StoreSampleStoreBadge isSampleStore={isSampleStore} />
          </div>
        ) : null}
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] font-semibold text-sam-meta">
          {isOpenForOrder ? <span>{t("store_open_now")}</span> : <span>{t("store_preparing")}</span>}
          {deliveryAvailable ? <span>{t("store_delivery_available")}</span> : null}
          {pickupAvailable ? <span>{t("store_pickup_available")}</span> : null}
          <span className="ml-auto rounded-full bg-sam-surface-muted px-2 py-0.5 text-[10px] font-bold text-sam-muted">
            {fulfillmentMode === "local_delivery" ? t("store_delivery_order_mode") : t("store_pickup_order_mode")}
          </span>
        </div>
      </div>

      {collapseTopFulfillmentCard ? null : (
        <section className="bg-sam-surface px-4 pb-2.5" data-store-fulfillment-card>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-none">
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
                  <InfoRow label={t("store_delivery_time")} value={heroRideDisplay} />
                  <InfoRow
                    label={t("store_delivery_fee")}
                    value={feeDisplay}
                    sub={deliverySub}
                    reserveSubSlot={deliveryAvailable}
                  />
                  {fulfillmentExpanded ? (
                    <div data-store-fulfillment-more="1">
                      <InfoRow label={t("store_prep_time_label")} value={heroPrepDisplay} />
                      <InfoRow label={t("store_route_distance")} value={heroDistDisplay} />
                      {payFull ? <InfoRow label={t("store_payment_methods_label")} value={payFull} /> : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setFulfillmentExpanded((v) => !v)}
                    aria-expanded={fulfillmentExpanded}
                    aria-label={fulfillmentExpanded ? t("store_fulfillment_less_aria") : t("store_fulfillment_more_aria")}
                    className="flex w-full items-center justify-center py-1 text-sam-meta touch-manipulation"
                    data-store-fulfillment-toggle="1"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                      className={fulfillmentExpanded ? "rotate-180" : undefined}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
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
                            className={`shrink-0 rounded-full bg-sam-surface-muted px-2.5 py-1 text-[12px] font-bold text-sam-fg touch-manipulation ${DELIVERY_TOUCH_HIT_EXPAND_CLASS}`}
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
            {closedNoticeText ? (
              <p
                className="flex items-center gap-2 border-t border-sam-border-soft px-3.5 py-2 text-[12px] font-bold text-sam-fg"
                data-store-closed-notice="1"
              >
                <span className="shrink-0 text-sam-muted">{t("store_operation_notice_label")}</span>
                <span className="min-w-0">{closedNoticeText}</span>
              </p>
            ) : null}
            {commerce?.breakConfigured ? (
              <p className="border-t border-sam-border-soft bg-sam-warning-soft px-3.5 py-2 text-center text-[12px] font-bold text-sam-fg">
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
