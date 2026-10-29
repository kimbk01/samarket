"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import type { PhysicalBannerResolvedSlide } from "@/lib/stores/load-delivery-ad-physical-banners";
import {
  buildStoresBrowseTopBannersPath,
  fetchStoresBrowseTopBannersDeduped,
  peekStoresBrowseTopBannersClientCache,
  type StoresBrowseTopBannersResponse,
} from "@/lib/stores/stores-browse-top-banners-client";

function resolveBrowseTopBannerSlides(
  json: StoresBrowseTopBannersResponse | null
): PhysicalBannerResolvedSlide[] {
  if (!json?.physicalEnabled) return [];
  const list = Array.isArray(json.banners) ? json.banners : [];
  return list.filter((b) => String(b.imageUrl ?? "").trim().length > 0);
}

/**
 * Stage 2 — BROWSE top_context Banner (PRIMARY/SECONDARY).
 * Category policy `bannerAds` owns enable (separate from native `adEnabled`).
 * Fixed once per surface — does not repeat on organic continuation.
 */
export function StoresBrowseTopBanner({
  primarySlug,
  subSlug,
}: {
  primarySlug: string;
  subSlug: string | null;
}) {
  const { t } = useI18n();
  const path = buildStoresBrowseTopBannersPath(primarySlug, subSlug);
  /** v4 W3 PERF-14 — TTL 캐시가 있으면 첫 렌더에 바로 그린다 */
  const [banners, setBanners] = useState<PhysicalBannerResolvedSlide[] | null>(() => {
    const cached = peekStoresBrowseTopBannersClientCache(path);
    return cached ? resolveBrowseTopBannerSlides(cached) : null;
  });

  useEffect(() => {
    let cancelled = false;
    const cached = peekStoresBrowseTopBannersClientCache(path);
    if (cached) {
      setBanners(resolveBrowseTopBannerSlides(cached));
      return;
    }
    void fetchStoresBrowseTopBannersDeduped(path)
      .then((json) => {
        if (!cancelled) setBanners(resolveBrowseTopBannerSlides(json));
      })
      .catch(() => {
        if (!cancelled) setBanners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (banners === null) {
    return (
      <div className="hidden" data-stores-browse-top-banner="loading" aria-hidden />
    );
  }

  const slide = banners[0] ?? null;
  if (!slide) {
    return <div className="hidden" data-stores-browse-top-banner="empty" aria-hidden />;
  }

  const inventory = inventoryViewFromKey("STORES_CATEGORY_TOP");

  return (
    <div
      className="relative w-full px-[var(--delivery-page-x)]"
      data-stores-browse-top-banner="banner"
      data-stage2-banner-slot="BROWSE_TOP"
      data-stage2-banner-aspect="2/1"
      data-stage2-banner-continuation="fixed_once_per_surface"
    >
      <DeliveryAdBanner
        key={slide.id}
        inventory={inventory}
        creative={{
          assetUrl: slide.imageUrl,
          headline: slide.title,
          subcopy: slide.subtitle,
          alt: slide.title,
        }}
        destination={{ href: slide.ctaHref }}
        adLabel={slide.isSampleStore ? t("store_insertion_sample_ad") : t("store_insertion_sponsored")}
        renderContext="customer"
        campaignId={slide.id}
        exposureToken={slide.exposureToken}
        onAssetError={() => {
          // ADC-09: 이미지가 깨진 배너는 슬롯에서 제외 (대체 이미지 + 「광고」 라벨 노출 금지)
          const failedId = slide.id;
          setBanners((prev) => (prev ? prev.filter((b) => b.id !== failedId) : prev));
        }}
      />
    </div>
  );
}
