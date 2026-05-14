"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
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
  /** 배민식 비용: 상세 히어로에서 Routes 자동 호출 없음 — `commerceExtras` 조리 안내만 */
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
  storeSlug?: string | null;
}) {
  /** 당김 시 레이아웃 높이 + 위로 이동을 같이 줘서 헤더 위 흰 빈 공간이 보이지 않게 함 */
  const { stretch: heroStretch, scale: heroRubberScale } = useRubberBandAtDocumentTop(120, {
    blockNativeViewportOverscroll: true,
  });
  const heroRubberPx = Math.max(0, heroStretch);
  const img = profileImageUrl?.trim() || "";

  /** 당김으로 히어로 높이가 늘 때 검은 여백 대신 이미지가 같이 확대되도록(최소 1 + stretch/기준높이) */
  const HERO_BASE_MIN_PX = 208;
  const heroBannerPullScale = useMemo(() => {
    const pullComp = heroRubberPx > 0 ? 1 + heroRubberPx / HERO_BASE_MIN_PX : 1;
    return Math.min(2.25, Math.max(heroRubberScale, pullComp));
  }, [heroRubberPx, heroRubberScale]);

  const prepLine = useMemo(() => commerceExtras.estPrepLabel, [commerceExtras.estPrepLabel]);

  const feeDisplay = useMemo((): ReactNode => {
    if (!deliveryAvailable) {
      return formatStoreDetailDeliveryFeeValue(commerceExtras, { deliveryAvailable });
    }
    if (commerceExtras.deliveryFeeMode === "self_free_promo") {
      const strike = commerceExtras.deliveryFeeStrikeReferencePhp;
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-[#2563EB]">배달비 무료 적용 중</span>
          {strike != null && strike > 0 ? (
            <span className="font-bold text-neutral-400 line-through">{formatMoneyPhp(strike)}</span>
          ) : null}
        </span>
      );
    }
    return formatStoreDetailDeliveryFeeValue(commerceExtras, { deliveryAvailable });
  }, [commerceExtras, deliveryAvailable]);

  const minDisplay = useMemo(() => {
    const m = commerceExtras.minOrderPhp;
    if (m != null && m > 0) return `${formatMoneyPhp(m)} 이상`;
    return "없음";
  }, [commerceExtras.minOrderPhp]);

  const heroPrepDisplay = useMemo(() => {
    const p = commerceExtras.prepMinutes;
    if (p != null && Number.isFinite(p)) return `약 ${Math.round(p)}분`;
    const t = commerceExtras.estPrepLabel?.trim();
    if (t) return t.startsWith("약") ? t : `약 ${t}`;
    return "—";
  }, [commerceExtras.prepMinutes, commerceExtras.estPrepLabel]);

  const heroRideDisplay = useMemo(() => "—", []);

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
      return "앱 결제 금액에 포함되지 않습니다(착불)";
    }
    if (commerceExtras.deliveryFeeMode === "self_free_promo") {
      return "앱 청구 배달비 0₱";
    }
    if (commerceExtras.deliveryFeePhp === 0) {
      if (deliveryMeta.freeDeliveryOverPhp != null && deliveryMeta.freeDeliveryOverPhp > 0) {
        return "배달비 무료 적용 중";
      }
      return null;
    }
    if (deliveryMeta.freeDeliveryOverPhp != null && deliveryMeta.freeDeliveryOverPhp > 0) {
      return `${formatMoneyPhp(deliveryMeta.freeDeliveryOverPhp)} 이상 무료배달`;
    }
    return null;
  }, [
    deliveryAvailable,
    commerceExtras.deliveryFeeMode,
    commerceExtras.deliveryFeePhp,
    deliveryMeta.freeDeliveryOverPhp,
  ]);

  const segBase =
    "min-w-0 flex-1 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors duration-[180ms] disabled:cursor-not-allowed disabled:opacity-40";
  const segOn = "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]";
  const segOff = "text-neutral-500 active:bg-black/[0.04]";

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
          id="store-hero-media"
          className={
            heroBannerSlot
              ? "relative w-full overflow-hidden bg-[#15181b]"
              : "relative w-full overflow-hidden bg-gradient-to-br from-[#1C8DB8]/88 via-[#197DA3]/82 to-[#0f766e]/78"
          }
        >
          <div
            className="relative w-full overflow-hidden"
            style={{
              height: `calc(clamp(13rem, 44vh, 18rem) + ${heroRubberPx}px)`,
              minHeight: `${208 + heroRubberPx}px`,
            }}
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
                <Image src={img} alt="" fill className="object-cover" sizes="100vw" priority />
                <div className="absolute inset-0 bg-black/[0.14]" aria-hidden />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative z-[1] bg-white px-4 pb-2.5 pt-2.5">
        {ownerManagementHref ? (
          <p className="mb-2">
            <Link
              href={ownerManagementHref}
              className="inline-flex rounded-[4px] bg-[#5E4BFF] px-2 py-1 text-[10px] font-bold text-white"
            >
              내 상점 관리
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
            aria-label={viewerFavorited ? "찜 해제" : "찜하기"}
            disabled={favoriteBusy}
            onClick={() => void onFavoriteClick()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900 transition-transform duration-[120ms] active:scale-[0.96]"
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
              aria-label="리뷰 전체 보기"
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
          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700">주문 {formatOrderCount(recentOrderCount)}</span>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] font-semibold text-neutral-500">
          {isOpenForOrder ? <span>영업중</span> : <span>준비중</span>}
          {deliveryAvailable ? <span>배달가능</span> : null}
          {pickupAvailable ? <span>픽업가능</span> : null}
          <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700">
            {fulfillmentMode === "local_delivery" ? "배달주문" : "픽업주문"}
          </span>
        </div>
      </div>

      {collapseTopFulfillmentCard ? null : (
        <div className="bg-white px-4 pb-2.5">
          <div className="rounded-[12px] border border-neutral-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <div className="flex w-full items-center gap-1 rounded-t-[12px] bg-[#F3F4F6] p-0.5">
              <button
                type="button"
                disabled={!deliveryAvailable}
                onClick={() => onFulfillmentChange("local_delivery")}
                className={`${segBase} ${fulfillmentMode === "local_delivery" ? segOn : segOff}`}
              >
                배달
              </button>
              <button
                type="button"
                disabled={!pickupAvailable}
                onClick={() => onFulfillmentChange("pickup")}
                className={`${segBase} ${fulfillmentMode === "pickup" ? segOn : segOff}`}
              >
                픽업
              </button>
            </div>

            <div className="px-3 py-1.5">
              {fulfillmentMode === "local_delivery" ? (
                <>
                  <InfoRow label="최소주문" value={minDisplay} />
                  <InfoRow label="조리 시간" value={heroPrepDisplay} />
                  <InfoRow label="배달 시간" value={heroRideDisplay} />
                  <InfoRow label="경로 거리" value={heroDistDisplay} />
                  <InfoRow label="배달비" value={feeDisplay} sub={deliverySub} />
                  {payFull ? <InfoRow label="결제방법" value={payFull} /> : null}
                </>
              ) : (
                <>
                  <InfoRow
                    label="최소주문"
                    value={
                      commerceExtras.minOrderPhp != null && commerceExtras.minOrderPhp > 0
                        ? minDisplay
                        : "없음"
                    }
                  />
                  <InfoRow label="픽업시간" value={`약 ${prepLine}`} />
                  {payFull ? <InfoRow label="결제방법" value={payFull} /> : null}
                  {addressDisp ? (
                    <InfoRow
                      label="위치안내"
                      value={addressDisp}
                      action={
                        directions ? (
                          <button
                            type="button"
                            onClick={onDirectionsClick}
                            aria-label="구글 지도에서 내 위치에서 이 매장까지 길찾기"
                            className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-bold text-neutral-800 touch-manipulation"
                          >
                            길찾기
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
              <p className="rounded-b-[12px] bg-[#EEF8FC] px-3.5 py-2 text-center text-[12px] font-bold text-neutral-800">
                {deliveryMeta.deliveryNotice.trim()}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
