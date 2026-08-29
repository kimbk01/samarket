"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import type { HomeHeroBannerResolvedSlide } from "@/lib/stores/load-store-banner-ad-campaigns";

/**
 * CUT 5 + CUT E — HOME Hero uses DeliveryAdBanner (campaign→inventory→creative).
 * Empty = hide. No static slide dual authority.
 */
export function StoresHomeHeroBanner() {
  const { t } = useI18n();
  const [banners, setBanners] = useState<HomeHeroBannerResolvedSlide[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stores/home-hero-banners", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          banners?: HomeHeroBannerResolvedSlide[];
        } | null;
        if (cancelled) return;
        const list = Array.isArray(json?.banners) ? json!.banners! : [];
        setBanners(list.filter((b) => String(b.imageUrl ?? "").trim().length > 0));
      } catch {
        if (!cancelled) setBanners([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const slideCount = banners?.length ?? 0;
  const slide = slideCount > 0 ? banners![Math.min(index, slideCount - 1)]! : null;

  const advance = useCallback(() => {
    setIndex((i) => (slideCount > 0 ? (i + 1) % slideCount : 0));
  }, [slideCount]);

  useEffect(() => {
    if (slideCount <= 1) return;
    const id = window.setInterval(advance, 5000);
    return () => window.clearInterval(id);
  }, [advance, slideCount]);

  useLayoutEffect(() => {
    markStoresHomePerf("hero");
  }, []);

  if (banners === null) {
    return (
      <div
        className="relative min-h-[140px] max-h-[180px] overflow-hidden rounded-[var(--delivery-radius)]"
        data-stores-perf="hero"
        data-stores-home-hero="loading"
        aria-hidden
      />
    );
  }

  if (!slide) {
    return (
      <div
        className="hidden"
        data-stores-perf="hero"
        data-stores-home-hero="empty"
        aria-hidden
      />
    );
  }

  const inventory = inventoryViewFromKey("STORES_HOME_HERO");

  return (
    <div
      data-stores-perf="hero"
      data-stores-home-hero="banner"
      data-stores-home-hero-count={slideCount}
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
        priority
      />
    </div>
  );
}
