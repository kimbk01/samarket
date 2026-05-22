"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { StoreOrderHeroSummary } from "@/components/stores/store-order-detail/StoreOrderHeroSummary";
import { StoreOrderNoticeStrip } from "@/components/stores/store-order-detail/StoreOrderNoticeStrip";
import { StoreOrderStickyHeader } from "@/components/stores/store-order-detail/StoreOrderStickyHeader";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";
import type { StoreDeliveryMeta } from "@/lib/stores/store-detail-meta";
import type { CommerceExtrasFromHours } from "@/lib/stores/store-commerce-extras";
import type { StoreDetailDirectionsTarget } from "@/lib/stores/google-maps-store-links";
import { fetchMeCheckoutContactDeduped } from "@/lib/me/fetch-me-checkout-contact-deduped";
import { fetchStoreDeliveryEtaDeduped } from "@/lib/stores/store-delivery-api-client";
import { StoreHeader } from "@/components/stores/detail/StoreHeader";
import { StoreNoticeBar } from "@/components/stores/detail/StoreNoticeBar";

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
  const [rideSource, setRideSource] = useState<"store" | "google" | null>(null);
  const [heroDeliveryTimeDisplay, setHeroDeliveryTimeDisplay] = useState<string>("—");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/app/delivery-ride-time-source", { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; source?: unknown };
        if (cancelled) return;
        setRideSource(j.source === "google" ? "google" : "store");
      } catch {
        if (!cancelled) setRideSource("store");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (rideSource == null) return;
    if (!deliveryAvailable) {
      setHeroDeliveryTimeDisplay("—");
      return;
    }
    if (rideSource === "store") {
      const m = commerceExtras.deliveryRideDisplayManual?.trim();
      setHeroDeliveryTimeDisplay(m && m.length > 0 ? m : "—");
      return;
    }

    let cancelled = false;
    setHeroDeliveryTimeDisplay("—");
    const slug = String(store.slug ?? "").trim();
    if (!slug) return;

    void (async () => {
      try {
        const { json: cjRaw } = await fetchMeCheckoutContactDeduped();
        const cj = cjRaw as {
          ok?: boolean;
          default_delivery?: { user_address_id?: string | null } | null;
        };
        if (cancelled || !cj?.ok) return;
        const aid = String(cj.default_delivery?.user_address_id ?? "").trim();
        if (!aid) return;
        const { status, json } = await fetchStoreDeliveryEtaDeduped(slug, aid, {
          trace: {
            component: "StoreDetailSummarySection",
            reason: "store_detail_hero_eta",
            triggeredBy: "summary_mount",
            pathname: "/stores/[slug]",
          },
        });
        if (cancelled || status !== 200) return;
        const ej = json as { ok?: boolean; etaLabel?: string };
        if (ej?.ok === true && typeof ej.etaLabel === "string" && ej.etaLabel.trim()) {
          setHeroDeliveryTimeDisplay(ej.etaLabel.trim());
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rideSource, deliveryAvailable, store.slug, commerceExtras.deliveryRideDisplayManual]);

  return (
    <>
      <StoreHeader
        sticky={
          <StoreOrderStickyHeader
            elevated={headerElevated}
            heroGlassOverlayButtons
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
        }
        hero={
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
            deliveryTimeDisplay={heroDeliveryTimeDisplay}
          />
        }
      />

      <StoreNoticeBar
        legacyStrip={
          noticePreview && !storeManagedNoticesSlot ? (
            <StoreOrderNoticeStrip
              text={noticePreview}
              href={infoPath}
              storeName={store.store_name}
              showCouponBadge={false}
            />
          ) : undefined
        }
        managedSlot={storeManagedNoticesSlot}
      />
    </>
  );
}
