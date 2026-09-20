"use client";

/**
 * Local Presentation Final Close visual harness.
 * Uses production DibayPopupAd / FeedAdFramePreview / DeliveryAdBanner.
 * Not a Production route — gated by NODE_ENV !== production.
 * Mounted outside `(main)` so bottom-nav chrome cannot overlay captures.
 */

import { useEffect, useMemo, useState } from "react";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { AdminPlatformPopupPreview } from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import type { PlatformPopupPresentationWinner } from "@/lib/platform-popup/popup-presentation-types";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";

/** Opaque rectangular creative — CARD / sheet / banners (36:25). */
const FIXTURE_CARD_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="500" viewBox="0 0 720 500">
      <rect width="720" height="500" fill="#0ea5e9"/>
      <circle cx="360" cy="200" r="90" fill="#fbbf24"/>
      <text x="360" y="420" text-anchor="middle" fill="white" font-size="28" font-family="sans-serif">dibaY creative</text>
    </svg>`
  );

/**
 * Alpha-bearing artwork fixture — no opaque rectangular cage.
 * Representative of production transparent PNG/WebP geometry.
 */
const FIXTURE_ARTWORK_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
      <defs>
        <radialGradient id="g" cx="50%" cy="42%" r="48%">
          <stop offset="0%" stop-color="#fbbf24"/>
          <stop offset="70%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <!-- transparent canvas (no rect fill) -->
      <circle cx="360" cy="300" r="210" fill="url(#g)"/>
      <ellipse cx="360" cy="520" rx="140" ry="48" fill="#0f172a" fill-opacity="0.12"/>
      <circle cx="300" cy="260" r="28" fill="#0f172a"/>
      <circle cx="420" cy="260" r="28" fill="#0f172a"/>
      <path d="M290 360 Q360 430 430 360" stroke="#0f172a" stroke-width="18" fill="none" stroke-linecap="round"/>
    </svg>`
  );

/** Benefit visual — soft stage, not Card crop. */
const FIXTURE_BENEFIT_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="280" viewBox="0 0 480 280">
      <rect x="40" y="40" width="400" height="200" rx="24" fill="#ecfdf5" stroke="#10b981" stroke-width="4"/>
      <text x="240" y="130" text-anchor="middle" fill="#065f46" font-size="42" font-weight="700" font-family="sans-serif">₱100 OFF</text>
      <text x="240" y="180" text-anchor="middle" fill="#047857" font-size="18" font-family="sans-serif">Event Benefit</text>
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
  const eventBenefit =
    composition === "benefit"
      ? {
          title: overrides?.title?.trim() || "₱100 OFF Delivery",
          body: overrides?.body?.trim() || "Min order ₱500 · linked Event Benefit section",
        }
      : null;
  return {
    campaignId: `proof-${composition}`,
    creativeId: `cr-${composition}`,
    surface: "TRADE",
    presentationType,
    frequencyMode: "once_per_session",
    title: composition === "benefit" ? null : (overrides?.title ?? `Title ${composition}`),
    body:
      composition === "benefit"
        ? null
        : overrides?.body === ""
          ? null
          : (overrides?.body ?? `Body ${composition}`),
    benefit: eventBenefit,
    creative: {
      id: `cr-${composition}`,
      imageUrl:
        composition === "artwork"
          ? FIXTURE_ARTWORK_IMG
          : composition === "benefit"
            ? FIXTURE_BENEFIT_IMG
            : FIXTURE_CARD_IMG,
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c") as Composition | null;
    const v = params.get("v") as Viewport | null;
    if (c === "artwork" || c === "card" || c === "sheet" || c === "benefit") {
      setComposition(c);
      if (c === "benefit") {
        setTitle("₱100 OFF Delivery");
        setBody("Min order ₱500 · linked Event Benefit section");
        setCtaLabel("Download Coupon");
      } else {
        setTitle(`Title ${c}`);
        setBody(
          c === "sheet"
            ? "Sheet body with enough copy to exercise CTA above safe-bottom spacer."
            : `Body ${c}`
        );
        setCtaLabel(c === "artwork" ? "Receive Benefit" : "Go");
      }
    }
    if (v === "phone" || v === "tablet" || v === "desktop") setViewport(v);
  }, []);

  const frame = VIEWPORTS[viewport];
  const winner = useMemo(
    () => winnerFor(composition, { title, body, ctaLabel }),
    [composition, title, body, ctaLabel]
  );
  const heroInv = useMemo(() => inventoryViewFromKey("STORES_HOME_HERO"), []);
  const stageH =
    composition === "sheet"
      ? Math.min(frame.h, viewport === "phone" ? 520 : 700)
      : Math.min(Math.round(frame.h * 0.55), viewport === "phone" ? 480 : 620);

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
              if (c === "benefit") {
                setTitle("₱100 OFF Delivery");
                setBody("Min order ₱500 · linked Event Benefit section");
                setCtaLabel("Download Coupon");
              } else {
                setTitle(`Title ${c}`);
                setBody(
                  c === "sheet"
                    ? "Sheet body with enough copy to exercise CTA above safe-bottom spacer."
                    : `Body ${c}`
                );
                setCtaLabel(c === "artwork" ? "Receive Benefit" : "Go");
              }
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
          style={{
            ["--safe-bottom" as string]: composition === "sheet" ? "34px" : "0px",
            ["--safe-top" as string]: "47px",
          }}
        >
          <DibayPopupAd
            key={`${composition}-${viewport}-${title}-${body}-${ctaLabel}`}
            campaignId={winner.campaignId}
            surface={winner.surface}
            creative={winner.creative}
            cta={winner.cta}
            title={winner.title}
            body={winner.body}
            benefit={winner.benefit}
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

      <section
        data-proof-admin-preview="1"
        className="mx-auto w-full max-w-3xl space-y-2 rounded-ui-rect border border-sam-border p-3"
      >
        <h2 className="text-sm font-semibold">Admin preview (same DibayPopupAd path)</h2>
        <AdminPlatformPopupPreview
          source={{
            campaignId: winner.campaignId,
            creativeId: winner.creative.id,
            imageUrl: winner.creative.imageUrl,
            altText: winner.creative.altText,
            ctaHref: winner.cta.href,
            ctaType: String(winner.cta.type),
            ctaLabel: winner.cta.label,
            title: winner.title,
            body: winner.body,
            benefit: winner.benefit,
            benefitEligible: composition !== "benefit" || Boolean(winner.benefit?.title),
            surface: "TRADE",
            suppressionMode: "SESSION",
            suppressionDurationSeconds: null,
            timezone: "Asia/Manila",
            presentationType: winner.presentationType,
            frequencyMode: winner.frequencyMode,
            creativeMode: winner.creative.creativeMode,
            aspectW: winner.creative.aspectW,
            aspectH: winner.creative.aspectH,
          }}
        />
      </section>

      <section data-proof-banner-inline="1" className="mx-auto w-full max-w-xl space-y-2">
        <h2 className="text-sm font-semibold">INLINE_BANNER (out of CUT 1 — fixture only)</h2>
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
