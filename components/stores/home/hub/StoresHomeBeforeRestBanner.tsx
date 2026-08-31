"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import type { PhysicalBannerResolvedSlide } from "@/lib/stores/load-delivery-ad-physical-banners";

/**
 * Stage 2 — HOME Banner before rest_stores.
 * Composition slot `homeBannerBeforeRest` owns enable; single creative (not HERO carousel).
 * Does not use native rest_stores insertion planner.
 */
export function StoresHomeBeforeRestBanner() {
  const { t } = useI18n();
  const [banners, setBanners] = useState<PhysicalBannerResolvedSlide[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stores/home-before-rest-banners", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          banners?: PhysicalBannerResolvedSlide[];
          physicalEnabled?: boolean;
        } | null;
        if (cancelled) return;
        if (!json?.physicalEnabled) {
          setBanners([]);
          return;
        }
        const list = Array.isArray(json.banners) ? json.banners : [];
        setBanners(list.filter((b) => String(b.imageUrl ?? "").trim().length > 0));
      } catch {
        if (!cancelled) setBanners([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (banners === null) {
    return (
      <div
        className="hidden"
        data-stores-home-before-rest-banner="loading"
        aria-hidden
      />
    );
  }

  const slide = banners[0] ?? null;
  if (!slide) {
    return (
      <div
        className="hidden"
        data-stores-home-before-rest-banner="empty"
        aria-hidden
      />
    );
  }

  const inventory = inventoryViewFromKey("STORES_HOME_INLINE_1");

  return (
    <div
      className="relative w-full"
      data-stores-home-before-rest-banner="banner"
      data-stage2-banner-slot="HOME_BEFORE_REST"
      data-stage2-banner-aspect="2/1"
      data-stage2-banner-continuation="fixed_once_per_surface"
    >
      <DeliveryAdBanner
        inventory={inventory}
        creative={{
          assetUrl: slide.imageUrl,
          headline: slide.title,
          subcopy: slide.subtitle,
          alt: slide.title,
        }}
        destination={{ href: slide.ctaHref }}
        adLabel={t("store_insertion_sponsored")}
        renderContext="customer"
        campaignId={slide.id}
        exposureToken={slide.exposureToken}
      />
    </div>
  );
}
