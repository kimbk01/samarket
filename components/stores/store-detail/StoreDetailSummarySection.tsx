"use client";

import type { ReactNode } from "react";
import { StoreOrderHeroSummary } from "@/components/stores/store-order-detail/StoreOrderHeroSummary";
import { StoreOrderNoticeStrip } from "@/components/stores/store-order-detail/StoreOrderNoticeStrip";
import { StoreOrderStickyHeader } from "@/components/stores/store-order-detail/StoreOrderStickyHeader";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";
import type { StoreDeliveryMeta } from "@/lib/stores/store-detail-meta";
import type { CommerceExtrasFromHours } from "@/lib/stores/store-commerce-extras";
import type { StoreDetailDirectionsTarget } from "@/lib/stores/google-maps-store-links";

type CommerceSnap = {
  breakConfigured: boolean;
  breakRangeLabel: string;
  inBreak: boolean;
} | null;

type StoreSummaryRow = {
  id: string;
  store_name: string;
  slug: string;
  profile_image_url: string | null;
  gallery_images_json: unknown;
  business_hours_json: unknown;
  is_open: boolean | null;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
  rating_avg?: number | null;
  review_count?: number | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
};

export function StoreDetailSummarySection({
  headerElevated,
  fallbackHref,
  store,
  heroImageUrl,
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
  infoPath,
  reviewsHref,
  storeAddressLine,
  directions,
  viewerFavorited,
  favoriteBusy,
  onFavoriteClick,
  onMenuSearchFocus,
  onShareClick,
  onCartPreviewClick,
  noticePreview,
  bannersSlot,
  storeManagedNoticesSlot,
  commerceCartStoreId,
}: {
  headerElevated: boolean;
  fallbackHref: string;
  store: StoreSummaryRow;
  heroImageUrl: string | null;
  recentOrderCount: number;
  deliveryMeta: StoreDeliveryMeta;
  commerceExtras: CommerceExtrasFromHours;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  isOpenForOrder: boolean;
  commerce: CommerceSnap;
  fulfillmentMode: StorePublicFulfillmentMode;
  onFulfillmentChange: (mode: StorePublicFulfillmentMode) => void;
  ownerManagementHref?: string;
  infoPath: string;
  reviewsHref?: string;
  storeAddressLine: string | null;
  /** 픽업 위치안내 — 탭 시 내 위치(origin) + 매장(destination) 구글 길찾기 */
  directions: StoreDetailDirectionsTarget | null;
  viewerFavorited: boolean;
  favoriteBusy: boolean;
  onFavoriteClick: () => void | Promise<void>;
  onMenuSearchFocus: () => void;
  onShareClick: () => void;
  onCartPreviewClick: () => void;
  noticePreview: string;
  /** 매장 배너(store_banners) — 상단 히어로 영역에 노출 */
  bannersSlot?: ReactNode;
  /** 매장 공지(store_notices placement=store_top) */
  storeManagedNoticesSlot?: ReactNode;
  commerceCartStoreId: string;
}) {
  return (
    <>
      <StoreOrderStickyHeader
        elevated={headerElevated}
        fallbackHref={fallbackHref}
        storeSlug={store.slug}
        storeName={store.store_name}
        commerceCartStoreId={commerceCartStoreId}
        viewerFavorited={viewerFavorited}
        favoriteBusy={favoriteBusy}
        onFavoriteClick={onFavoriteClick}
        onMenuSearchFocus={onMenuSearchFocus}
        onShareClick={onShareClick}
        onCartPreviewClick={onCartPreviewClick}
      />

      <div>
        <StoreOrderHeroSummary
          storeName={store.store_name}
          profileImageUrl={heroImageUrl}
          collapseTopFulfillmentCard={
            headerElevated &&
            (!!(heroImageUrl && heroImageUrl.trim()) || Boolean(bannersSlot))
          }
          heroBannerSlot={bannersSlot}
          ratingAvg={
            store.rating_avg != null && Number.isFinite(Number(store.rating_avg))
              ? Number(store.rating_avg)
              : null
          }
          reviewCount={Number(store.review_count) || 0}
          recentOrderCount={recentOrderCount}
          deliveryMeta={deliveryMeta}
          commerceExtras={commerceExtras}
          deliveryAvailable={deliveryAvailable}
          pickupAvailable={pickupAvailable}
          isOpenForOrder={isOpenForOrder}
          commerce={
            commerce
              ? {
                  breakConfigured: commerce.breakConfigured,
                  breakRangeLabel: commerce.breakRangeLabel,
                  inBreak: commerce.inBreak,
                }
              : null
          }
          fulfillmentMode={fulfillmentMode}
          onFulfillmentChange={onFulfillmentChange}
          ownerManagementHref={ownerManagementHref}
          storeInfoHref={infoPath}
          reviewsHref={reviewsHref}
          addressLine={storeAddressLine || null}
          directions={directions}
          viewerFavorited={viewerFavorited}
          favoriteBusy={favoriteBusy}
          onFavoriteClick={onFavoriteClick}
          storeSlug={store.slug}
        />
      </div>

      {noticePreview && !storeManagedNoticesSlot ? (
        <StoreOrderNoticeStrip
          text={noticePreview}
          href={infoPath}
          storeName={store.store_name}
          showCouponBadge={false}
        />
      ) : null}

      {storeManagedNoticesSlot ? <div className="mt-2 px-4">{storeManagedNoticesSlot}</div> : null}
    </>
  );
}
