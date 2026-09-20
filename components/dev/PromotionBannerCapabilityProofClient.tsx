"use client";

/**
 * CUT 2 local Banner placement proof harness.
 * Combo driven by URL searchParams (Playwright sets query per shot).
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  EVENT_BANNER_CAPABILITY_MATRIX,
  eventBannerPlacementLabel,
  eventBannerPresentationLabel,
  getEventBannerCapability,
  isEventBannerOrientationEligible,
  type EventBannerPlacement,
  type EventBannerPresentation,
} from "@/lib/platform-promotion-distribution/banner-presentation";

function fixtureSvg(label: string, bg: string, w: number, h: number): string {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="${w}" height="${h}" fill="${bg}"/>
        <text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="white" font-size="${Math.round(h / 8)}" font-family="sans-serif">${label}</text>
      </svg>`
    )
  );
}

const FIXTURES: Record<string, { imageUrl: string; headline: string }> = {
  "COMMUNITY_HOME:INLINE_BANNER": {
    imageUrl: fixtureSvg("Community Inline", "#0d9488", 1200, 400),
    headline: "Community Inline · Event A",
  },
  "COMMUNITY_HOME:HERO_BANNER": {
    imageUrl: fixtureSvg("Community Hero", "#7c3aed", 1560, 640),
    headline: "Community Hero · Event B",
  },
  "TRADE_HOME:INLINE_BANNER": {
    imageUrl: fixtureSvg("Trade Inline", "#ea580c", 1200, 400),
    headline: "Trade Inline · Event C",
  },
  "TRADE_HOME:HERO_BANNER": {
    imageUrl: fixtureSvg("Trade Hero", "#0369a1", 1560, 640),
    headline: "Trade Hero · Event D",
  },
};

export function PromotionBannerCapabilityProofClient({
  pathPlacement,
  pathPresentation,
}: {
  pathPlacement?: string;
  pathPresentation?: string;
} = {}) {
  const searchParams = useSearchParams();
  const placementRaw = pathPlacement || searchParams.get("placement");
  const presentationRaw = pathPresentation || searchParams.get("presentation");
  const placement: EventBannerPlacement =
    placementRaw === "TRADE_HOME" || placementRaw === "COMMUNITY_HOME"
      ? placementRaw
      : "COMMUNITY_HOME";
  const presentation: EventBannerPresentation =
    presentationRaw === "INLINE_BANNER" || presentationRaw === "HERO_BANNER"
      ? presentationRaw
      : "INLINE_BANNER";

  const key = `${placement}:${presentation}`;
  const fixture = FIXTURES[key];
  const capability = getEventBannerCapability(placement, presentation);
  const heroInv = useMemo(() => inventoryViewFromKey("STORES_HOME_HERO"), []);
  const density = placement.startsWith("COMMUNITY") ? "community" : "trade";
  // Client-only viewport label — never read window during useState init (SSR hydrate mismatch).
  const [viewportLabel, setViewportLabel] = useState<"portrait" | "landscape" | "pending">(
    "pending"
  );
  useEffect(() => {
    const update = () =>
      setViewportLabel(window.innerWidth > window.innerHeight ? "landscape" : "portrait");
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div
      className="min-h-screen space-y-6 bg-sam-app p-4 text-sam-fg"
      data-banner-capability-proof="1"
      data-proof-placement={placement}
      data-proof-presentation={presentation}
      data-proof-host-id={capability?.hostId ?? ""}
      data-proof-aspect={`${capability?.aspectW ?? ""}:${capability?.aspectH ?? ""}`}
      data-proof-orientation-policy={capability?.orientationPolicy ?? "allow_all"}
      data-proof-landscape-eligible={
        isEventBannerOrientationEligible("landscape") ? "1" : "0"
      }
    >
      <h1 className="text-lg font-semibold">CUT 2 — Banner Placement Capability Proof</h1>
      <p className="text-xs text-sam-muted">
        Matrix rows: {EVENT_BANNER_CAPABILITY_MATRIX.length} · landscape allowed · paid side-effect 0
      </p>

      <div className="flex flex-wrap gap-2" data-proof-combo-selector="1">
        {EVENT_BANNER_CAPABILITY_MATRIX.map((row) => (
          <a
            key={`${row.placement}:${row.presentation}`}
            data-proof-combo={`${row.placement}:${row.presentation}`}
            className={`rounded px-3 py-1.5 text-sm ${
              placement === row.placement && presentation === row.presentation
                ? "bg-sam-fg text-white"
                : "border"
            }`}
            href={`/dev/promotion-banner-capability/${row.placement}/${row.presentation}`}
          >
            {eventBannerPlacementLabel(row.placement, "ko")} ·{" "}
            {eventBannerPresentationLabel(row.presentation, "ko")}
          </a>
        ))}
      </div>

      <div
        data-proof-banner-stage="1"
        className="mx-auto w-full max-w-5xl overflow-hidden rounded-ui-rect border border-sam-border bg-slate-300/40 p-3"
      >
        {presentation === "INLINE_BANNER" ? (
          <FeedAdFramePreview
            density={density}
            imageUrl={fixture.imageUrl}
            headline={fixture.headline}
            alt={fixture.headline}
          />
        ) : (
          <div
            data-event-promotion-hero-banner="1"
            data-placement={placement}
            data-paid-side-effect="0"
          >
            <DeliveryAdBanner
              inventory={heroInv}
              creative={{
                assetUrl: fixture.imageUrl,
                headline: fixture.headline,
                alt: fixture.headline,
              }}
              destination={{ href: "/events/proof-cut2", ctaLabel: null }}
              adLabel="dibaY"
              renderContext="admin_preview"
              campaignId={`proof-${key}`}
              exposureToken={null}
            />
          </div>
        )}
      </div>

      {/* Orientation policy is registry SSOT (allow_all) — Popup landscape deny must not apply. */}
      <p className="text-sm font-medium text-sam-fg" data-proof-landscape-allowed="1">
        Banner orientation: allow_all · viewport={viewportLabel} · Popup landscape deny 미적용
      </p>
    </div>
  );
}
