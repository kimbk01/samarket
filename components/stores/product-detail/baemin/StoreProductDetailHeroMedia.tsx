"use client";

import { useCallback, useMemo, useRef } from "react";
import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import { storeDetailHeroMediaBoxStyle } from "@/lib/dibay/store-detail-hero-layout";
import { STORE_HERO_RUBBER_STRETCH_ATTR } from "@/lib/ui/rubber-band-gesture";
import { useRubberBandAtDocumentTop } from "@/lib/ui/use-rubber-band-at-document-top";

/** 매장 상세 `StoreOrderHeroSummary` 와 동일 — `#store-hero-media` + 당김 확대 */
export function StoreProductDetailHeroMedia({
  imageUrl,
  profileFallbackUrl,
}: {
  imageUrl: string;
  profileFallbackUrl: string;
}) {
  const heroMediaRef = useRef<HTMLDivElement>(null);

  const syncHeroRubberStretchAttr = useCallback((px: number) => {
    const el = heroMediaRef.current;
    if (!el) return;
    if (px > 0) {
      el.setAttribute(STORE_HERO_RUBBER_STRETCH_ATTR, String(Math.round(px)));
    } else {
      el.removeAttribute(STORE_HERO_RUBBER_STRETCH_ATTR);
    }
  }, []);

  const { stretch: heroStretch, scale: heroRubberScale } = useRubberBandAtDocumentTop(120, {
    blockNativeViewportOverscroll: true,
    onStretchChange: syncHeroRubberStretchAttr,
  });
  const heroRubberPx = Math.max(0, heroStretch);
  const img = imageUrl.trim() || profileFallbackUrl.trim() || "";

  const heroBannerPullScale = useMemo(() => {
    const pullComp = heroRubberPx > 0 ? 1 + heroRubberPx / 208 : 1;
    return Math.min(2.25, Math.max(heroRubberScale, pullComp));
  }, [heroRubberPx, heroRubberScale]);

  return (
    <div className="relative z-0">
      <div
        className="relative will-change-transform"
        style={
          heroRubberPx > 0
            ? {
                transform: `translateY(${-heroRubberPx}px)`,
                marginBottom: `${-heroRubberPx}px`,
              }
            : undefined
        }
      >
        <div
          ref={heroMediaRef}
          id="store-hero-media"
          className={
            img
              ? "relative w-full overflow-hidden bg-[#15181b]"
              : "relative w-full overflow-hidden bg-[color:var(--delivery-primary)]"
          }
        >
          <div
            className="relative w-full overflow-hidden"
            style={storeDetailHeroMediaBoxStyle(heroRubberPx)}
          >
            {img ? (
              <div
                className="absolute inset-0 will-change-transform"
                style={{
                  transform: `translateY(${-heroRubberPx * 0.15}px) scale(${heroBannerPullScale})`,
                  transformOrigin: "center top",
                }}
              >
                <DeliveryMediaImage
                  src={img}
                  alt=""
                  fill
                  className="object-cover"
                  priority
                  surface="detail-hero"
                />
                <div className="absolute inset-0 bg-black/[0.14]" aria-hidden />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
