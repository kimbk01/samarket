"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { launchBannerByInventory } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import type { HomeHeroBannerResolvedSlide } from "@/lib/stores/load-store-banner-ad-campaigns";

const HERO_POLICY = launchBannerByInventory("STORES_HOME_HERO");
const AUTO_MS = HERO_POLICY?.autoSlideMs ?? 5000;
const DOTS_REQUIRED = HERO_POLICY?.dotsRequired ?? true;

/**
 * CUT 5 + CUT E — HOME Hero uses DeliveryAdBanner (campaign→inventory→creative).
 * Empty = hide. Multi active → carousel (auto + loop + dots).
 */
export function StoresHomeHeroBanner() {
  const { t } = useI18n();
  const [banners, setBanners] = useState<HomeHeroBannerResolvedSlide[] | null>(null);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

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
    const id = window.setInterval(advance, AUTO_MS);
    return () => window.clearInterval(id);
  }, [advance, slideCount, index]);

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
      className="relative"
      data-stores-perf="hero"
      data-stores-home-hero="banner"
      data-stores-home-hero-count={slideCount}
      data-stores-home-hero-auto-ms={AUTO_MS}
      data-stores-home-hero-dots={DOTS_REQUIRED && slideCount > 1 ? "1" : "0"}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (slideCount <= 1 || touchStartX.current == null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
        const dx = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) < 40) return;
        setIndex((i) =>
          dx < 0 ? (i + 1) % slideCount : (i - 1 + slideCount) % slideCount
        );
      }}
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
        priority
      />
      {DOTS_REQUIRED && slideCount > 1 ? (
        <div
          className="pointer-events-auto absolute bottom-2 left-0 right-0 z-[2] flex justify-center gap-1.5"
          data-stores-home-hero-dots-ui="1"
          role="tablist"
          aria-label="Banner slides"
        >
          {banners!.map((b, i) => {
            const selected = i === Math.min(index, slideCount - 1);
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`Slide ${i + 1}`}
                className={`h-2 w-2 rounded-full transition ${
                  selected ? "bg-white shadow" : "bg-white/50 hover:bg-white/80"
                }`}
                onClick={() => setIndex(i)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
