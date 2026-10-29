"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { launchBannerByInventory } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import {
  fetchStoresHomeBannersDeduped,
  peekStoresHomeBannersClientCache,
  type StoresHomeBannersResponse,
} from "@/lib/stores/stores-home-banners-client";
import type { HomeHeroBannerResolvedSlide } from "@/lib/stores/load-store-banner-ad-campaigns";

const HERO_POLICY = launchBannerByInventory("STORES_HOME_HERO");
const AUTO_MS = HERO_POLICY?.autoSlideMs ?? 5000;
const DOTS_REQUIRED = HERO_POLICY?.dotsRequired ?? true;
const HERO_BANNERS_API = "/api/stores/home-hero-banners" as const;

/**
 * CUT 5 + CUT E — HOME Hero uses DeliveryAdBanner (campaign→inventory→creative).
 * Empty = hide. Multi active → carousel (auto + loop + dots).
 */
export function StoresHomeHeroBanner({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useI18n();
  const [banners, setBanners] = useState<HomeHeroBannerResolvedSlide[] | null>(null);
  const [index, setIndex] = useState(0);
  /**
   * B-07 — 슬라이드 전환 애니메이션(우→좌, 360ms = 업종 슬라이드 계약). 광고 인스턴스는 현재 슬라이드 1개만
   * (ADC-03 노출 세션 분리) — 나가는 슬라이드는 집계 없는 이미지로만 밀려난다.
   */
  const [transition, setTransition] = useState<{ fromId: string; fromUrl: string; dir: "next" | "prev"; seq: number } | null>(null);
  const touchStartX = useRef<number | null>(null);

  /**
   * 묶음4 F-06 — 같은 fetcher(single-flight + 30초 클라 캐시)로 읽는다. 허브가 진입 시 prewarm 하고,
   * 당겨서 새로고침·주소 변경(refreshKey, B-08)은 허브가 force 비행을 먼저 시작 → 여기서는 그 비행에 합류.
   */
  useLayoutEffect(() => {
    let cancelled = false;
    const apply = (json: StoresHomeBannersResponse | null) => {
      if (cancelled) return;
      const list = Array.isArray(json?.banners) ? (json!.banners as HomeHeroBannerResolvedSlide[]) : [];
      setBanners(list.filter((b) => String(b.imageUrl ?? "").trim().length > 0));
    };
    const cached = peekStoresHomeBannersClientCache(HERO_BANNERS_API);
    if (cached) {
      apply(cached);
    } else {
      void fetchStoresHomeBannersDeduped(HERO_BANNERS_API)
        .then(apply)
        .catch(() => apply(null));
    }
    return () => {
      cancelled = true;
    };
    /** B-08 — 홈 당겨서 새로고침 시 다시 조회 */
  }, [refreshKey]);

  const slideCount = banners?.length ?? 0;
  const slide = slideCount > 0 ? banners![Math.min(index, slideCount - 1)]! : null;

  const goTo = useCallback(
    (nextIndex: number, dir: "next" | "prev") => {
      if (slideCount <= 1 || !banners) return;
      const current = banners[Math.min(index, slideCount - 1)];
      const target = ((nextIndex % slideCount) + slideCount) % slideCount;
      if (!current || target === Math.min(index, slideCount - 1)) return;
      setTransition((prev) => ({ fromId: current.id, fromUrl: current.imageUrl, dir, seq: (prev?.seq ?? 0) + 1 }));
      setIndex(target);
    },
    [banners, index, slideCount]
  );

  const advance = useCallback(() => {
    goTo(index + 1, "next");
  }, [goTo, index]);

  useEffect(() => {
    if (!transition) return;
    const id = window.setTimeout(() => setTransition(null), 380);
    return () => window.clearTimeout(id);
  }, [transition]);

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
        if (dx < 0) goTo(index + 1, "next");
        else goTo(index - 1, "prev");
      }}
    >
      <div className="relative overflow-hidden rounded-[var(--delivery-radius)]">
      {transition && transition.fromId !== slide.id ? (
        // eslint-disable-next-line @next/next/no-img-element -- 나가는 슬라이드 시각 효과 전용(집계·클릭 없음)
        <img
          key={`out-${transition.seq}`}
          src={transition.fromUrl}
          alt=""
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover ${
            transition.dir === "next" ? "stores-home-hero-slide-out-next" : "stores-home-hero-slide-out-prev"
          }`}
        />
      ) : null}
      <div
        key={`in-${slide.id}-${transition?.seq ?? 0}`}
        className={
          transition && transition.fromId !== slide.id
            ? transition.dir === "next"
              ? "stores-home-hero-slide-in-next"
              : "stores-home-hero-slide-in-prev"
            : undefined
        }
      >
      <DeliveryAdBanner
        // ADC-03: 슬라이드마다 새 인스턴스 — 노출 관찰·클릭 세션이 슬라이드(광고) 단위로 분리
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
        priority
        onAssetError={() => {
          // ADC-09: 이미지가 깨진 슬라이드는 캐러셀에서 제외 (남은 게 없으면 슬롯 숨김)
          const failedId = slide.id;
          setBanners((prev) => (prev ? prev.filter((b) => b.id !== failedId) : prev));
        }}
      />
      </div>
      </div>
      {DOTS_REQUIRED && slideCount > 1 ? (
        <div
          className="pointer-events-auto absolute bottom-2 left-0 right-0 z-[2] flex justify-center gap-1.5"
          data-stores-home-hero-dots-ui="1"
          role="tablist"
          aria-label={t("ui_delivery_banner_slides_aria")}
        >
          {banners!.map((b, i) => {
            const selected = i === Math.min(index, slideCount - 1);
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={t("ui_delivery_banner_slide_aria", { n: i + 1 })}
                className={`h-2 w-2 rounded-full transition ${
                  selected ? "bg-white shadow" : "bg-white/50 hover:bg-white/80"
                }`}
                onClick={() => goTo(i, i > Math.min(index, slideCount - 1) ? "next" : "prev")}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
