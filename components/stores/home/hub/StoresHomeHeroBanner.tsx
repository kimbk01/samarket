"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import { STORES_HOME_LCP_HERO_ATTR } from "@/lib/stores/stores-home-lcp-policy";
import { STORES_HOME_CARD } from "@/lib/stores/stores-home-ui";
import type { StoresHomeHeroBannerSlide } from "@/lib/stores/store-banner-ad-exposure";

/**
 * CUT 5 — HOME Hero consumes ONE Banner authority (`store_banner_ad_campaigns` via API).
 * Static slide constants are not runtime authority. Empty = hide (CUT 0 hero_banner fallback).
 */
export function StoresHomeHeroBanner() {
  const [banners, setBanners] = useState<StoresHomeHeroBannerSlide[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stores/home-hero-banners", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          banners?: StoresHomeHeroBannerSlide[];
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

  /** Loading: reserve no fake campaign — null until fetch settles. */
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

  /** No valid banner → hide hero surface (no static dual authority). */
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

  const href = slide.ctaHref.trim();
  const media = (
    <>
      <div className="absolute inset-0">
        <SamarketThumbnail
          src={slide.imageUrl}
          alt={slide.title?.trim() || ""}
          fill
          fetchDisplayPx={780}
          roundedClassName="rounded-none"
          className="object-cover"
        />
      </div>
      {(slide.title?.trim() || slide.subtitle?.trim()) ?
        <div className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/55 to-transparent px-4 pb-3 pt-8 text-white">
          {slide.title?.trim() ?
            <p className="text-[17px] font-bold leading-snug">{slide.title.trim()}</p>
          : null}
          {slide.subtitle?.trim() ?
            <p className="mt-0.5 text-[13px] leading-snug opacity-90">{slide.subtitle.trim()}</p>
          : null}
        </div>
      : null}
    </>
  );

  return (
    <div
      className="relative overflow-hidden rounded-[var(--delivery-radius)]"
      data-stores-perf="hero"
      data-stores-home-hero="banner"
      data-stores-home-hero-count={slideCount}
      data-banner-campaign-id={slide.id}
    >
      {href ?
        <Link
          href={href}
          prefetch={false}
          className={`relative block min-h-[140px] max-h-[180px] overflow-hidden ${STORES_HOME_CARD} border-0`}
          {...{ [STORES_HOME_LCP_HERO_ATTR]: "hero" }}
        >
          {media}
        </Link>
      : <div
          className={`relative block min-h-[140px] max-h-[180px] overflow-hidden ${STORES_HOME_CARD} border-0`}
          {...{ [STORES_HOME_LCP_HERO_ATTR]: "hero" }}
        >
          {media}
        </div>
      }
      {slideCount > 1 ?
        <div className="absolute bottom-2 right-3 z-[2] flex gap-1" aria-hidden>
          {banners!.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
            />
          ))}
        </div>
      : null}
    </div>
  );
}
