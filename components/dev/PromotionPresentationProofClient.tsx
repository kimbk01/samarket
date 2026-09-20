"use client";

/**
 * Local Presentation Final Close visual harness.
 * Uses production DibayPopupAd / FeedAdFramePreview / DeliveryAdBanner.
 * Not a Production route — gated by NODE_ENV !== production.
 * Mounted outside `(main)` so bottom-nav chrome cannot overlay captures.
 */

import { useMemo, useState } from "react";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import type { PlatformPopupPresentationWinner } from "@/lib/platform-popup/popup-presentation-types";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";

/** Opaque rectangular creative — CARD / sheet / benefit / banners. */
const FIXTURE_CARD_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="500" viewBox="0 0 720 500">
      <rect width="720" height="500" fill="#0ea5e9"/>
      <circle cx="360" cy="200" r="90" fill="#fbbf24"/>
      <text x="360" y="420" text-anchor="middle" fill="white" font-size="28" font-family="sans-serif">dibaY creative</text>
    </svg>`
  );

/** Transparent artwork — alpha preserved; no full-bleed white plate. */
const FIXTURE_ARTWORK_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520">
      <circle cx="360" cy="260" r="170" fill="#fbbf24"/>
      <circle cx="295" cy="220" r="22" fill="#0f172a"/>
      <circle cx="425" cy="220" r="22" fill="#0f172a"/>
      <path d="M280 310 Q360 380 440 310" stroke="#0f172a" stroke-width="16" fill="none" stroke-linecap="round"/>
    </svg>`
  );

type Viewport = "phone" | "tablet" | "desktop";
type Composition = "artwork" | "card" | "sheet" | "benefit";

const VIEWPORTS: Record<Viewport, { w: number; h: number }> = {
  phone: { w: 390, h: 844 },
  tablet: { w: 768, h: 1024 },
  desktop: { w: 1280, h: 800 },
};

function winnerFor(
  composition: Composition,
  overrides?: Partial<{ title: string; body: string; ctaLabel: string | null }>
): PlatformPopupPresentationWinner {
  const presentationType =
    composition === "sheet"
      ? "bottom_sheet"
      : composition === "benefit"
        ? "benefit_dialog"
        : "center_modal";
  const creativeMode = composition === "artwork" ? "artwork" : "card";
  return {
    campaignId: `proof-${composition}`,
    creativeId: `cr-${composition}`,
    surface: "TRADE",
    presentationType,
    frequencyMode: "once_per_session",
    title: overrides?.title ?? `Title ${composition}`,
    body: overrides?.body === "" ? null : (overrides?.body ?? `Body ${composition}`),
    creative: {
      id: `cr-${composition}`,
      imageUrl: composition === "artwork" ? FIXTURE_ARTWORK_IMG : FIXTURE_CARD_IMG,
      altText: "proof",
      aspectW: 36,
      aspectH: 25,
      creativeMode,
    },
    cta: {
      type: "internal_page",
      href: "/market",
      label: overrides?.ctaLabel === null ? null : (overrides?.ctaLabel ?? "CTA"),
    },
    suppressionOptions: [],
    timezone: "Asia/Manila",
    suppressionDurationSeconds: null,
  };
}

export function PromotionPresentationProofClient() {
  const [viewport, setViewport] = useState<Viewport>("phone");
  const [composition, setComposition] = useState<Composition>("artwork");
  const [title, setTitle] = useState("Title artwork");
  const [body, setBody] = useState("Body artwork");
  const [ctaLabel, setCtaLabel] = useState("Receive Benefit");
  const frame = VIEWPORTS[viewport];
  const winner = useMemo(
    () => winnerFor(composition, { title, body, ctaLabel }),
    [composition, title, body, ctaLabel]
  );
  const heroInv = useMemo(() => inventoryViewFromKey("STORES_HOME_HERO"), []);
  const stageH =
    composition === "sheet"
      ? Math.min(frame.h, 760)
      : Math.min(Math.round(frame.h * 0.72), 680);

  return (
    <div
      className="min-h-screen space-y-8 bg-sam-app p-4 pb-24 text-sam-fg"
      data-promotion-proof="1"
    >
      <h1 className="text-lg font-semibold">Promotion Presentation Final Close — Proof</h1>

      <div className="flex flex-wrap gap-2" data-proof-viewport-selector="1">
        {(["phone", "tablet", "desktop"] as const).map((v) => (
          <button
            key={v}
            type="button"
            data-proof-viewport={v}
            className={`rounded px-3 py-1.5 text-sm ${viewport === v ? "bg-sam-fg text-white" : "border"}`}
            onClick={() => setViewport(v)}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-proof-composition-selector="1">
        {(["artwork", "card", "sheet", "benefit"] as const).map((c) => (
          <button
            key={c}
            type="button"
            data-proof-composition={c}
            className={`rounded px-3 py-1.5 text-sm ${composition === c ? "bg-sam-fg text-white" : "border"}`}
            onClick={() => {
              setComposition(c);
              setTitle(`Title ${c}`);
              setBody(`Body ${c}`);
              setCtaLabel(
                c === "benefit" ? "Download Coupon" : c === "artwork" ? "Receive Benefit" : "Go"
              );
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid max-w-xl gap-2">
        <input
          data-proof-title-input="1"
          className="rounded border px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          data-proof-body-input="1"
          className="rounded border px-2 py-1"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <input
          data-proof-cta-input="1"
          className="rounded border px-2 py-1"
          value={ctaLabel}
          onChange={(e) => setCtaLabel(e.target.value)}
        />
      </div>

      <div
        data-proof-popup-stage="1"
        data-proof-composition={composition}
        data-proof-viewport={viewport}
        className="mx-auto overflow-hidden rounded-ui-rect border border-sam-border bg-slate-400/40"
        style={{ width: Math.min(frame.w, 1280), height: stageH }}
      >
        <div
          className={`flex h-full justify-center px-3 ${
            composition === "sheet" ? "items-end" : "items-center"
          }`}
        >
          <DibayPopupAd
            key={`${composition}-${viewport}-${title}-${body}-${ctaLabel}`}
            campaignId={winner.campaignId}
            surface={winner.surface}
            creative={winner.creative}
            cta={winner.cta}
            title={winner.title}
            body={winner.body}
            suppressionOptions={winner.suppressionOptions}
            exposureId={`proof-${composition}-${viewport}`}
            presentationType={winner.presentationType}
            embedded
            onClose={() => undefined}
            onSuppress={() => undefined}
            onCta={() => undefined}
            onImpression={() => undefined}
            onImageError={() => undefined}
          />
        </div>
      </div>

      <section data-proof-banner-inline="1" className="mx-auto w-full max-w-xl space-y-2">
        <h2 className="text-sm font-semibold">INLINE_BANNER</h2>
        <FeedAdFramePreview
          density="trade"
          imageUrl={FIXTURE_CARD_IMG}
          headline="Inline autumn special"
          alt="inline"
        />
      </section>

      <section data-proof-banner-hero="1" className="mx-auto w-full max-w-xl space-y-2">
        <h2 className="text-sm font-semibold">HERO_BANNER</h2>
        <DeliveryAdBanner
          inventory={heroInv}
          creative={{ assetUrl: FIXTURE_CARD_IMG, headline: "Hero campaign", alt: "hero" }}
          destination={{ href: "/market", ctaLabel: null }}
          adLabel="dibaY"
          renderContext="admin_preview"
          campaignId="proof-hero"
          exposureToken={null}
        />
      </section>
    </div>
  );
}
