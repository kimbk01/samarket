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
export function StoresHomeBeforeRestBanner({ refreshToken = 0 }: { refreshToken?: number }) {
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
        /** 재조회 실패 — 이미 보이는 배너는 유지 */
        if (!cancelled) setBanners((prev) => prev ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
    /** H-02 — 홈 허브 수명주기(새로고침·주소 변경·앱 복귀)에서 증가 */
  }, [refreshToken]);

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
        key={slide.id}
        inventory={inventory}
        creative={{
          assetUrl: slide.imageUrl,
          headline: slide.title,
          subcopy: slide.subtitle,
          alt: slide.title,
        }}
        destination={{ href: slide.ctaHref }}
        adLabel={t(slide.isSampleAd ? "store_insertion_sample_ad" : "store_insertion_sponsored")}
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
