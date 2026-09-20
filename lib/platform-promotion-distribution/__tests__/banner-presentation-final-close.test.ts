/**
 * Banner presentation + A–D roundtrip / rotation re-proof for Presentation Final Close.
 */
import { describe, expect, it } from "vitest";
import {
  isEventBannerPlacementPresentationCompatible,
  normalizeEventBannerPresentation,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import { planBannerDistributionAdapter } from "@/lib/platform-promotion-distribution/adapters";
import { comparePopupCandidatesForRotation } from "@/lib/platform-popup/popup-rotation";
import { resolvePopupAd, type PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import { buildPlatformPopupPresentationWinner } from "@/lib/platform-popup/build-presentation-winner";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

describe("Event Banner presentation SSOT", () => {
  it("INLINE + TRADE_HOME allowed; HERO + TRADE_HOME allowed; HERO + CATEGORY denied", () => {
    expect(isEventBannerPlacementPresentationCompatible("TRADE_HOME", "INLINE_BANNER")).toBe(true);
    expect(isEventBannerPlacementPresentationCompatible("TRADE_HOME", "HERO_BANNER")).toBe(true);
    expect(
      isEventBannerPlacementPresentationCompatible("TRADE_CATEGORY", "HERO_BANNER")
    ).toBe(false);
    expect(
      isEventBannerPlacementPresentationCompatible("TRADE_CATEGORY", "INLINE_BANNER")
    ).toBe(false);
  });

  it("adapter: INLINE materializes feed_ad; HERO does not (paid Delivery write = 0)", () => {
    const inline = planBannerDistributionAdapter({
      eventId: "evt-1",
      eventTitle: "Grand Open",
      enabled: true,
      config: {
        presentation: "INLINE_BANNER",
        placement: "TRADE_HOME",
        imageUrl: "https://cdn.example/i.webp",
      },
    });
    expect(inline.ok).toBe(true);
    if (inline.ok) {
      expect(inline.value.presentation).toBe("INLINE_BANNER");
      expect(inline.value.materializeFeedAd).toBe(true);
      expect(inline.value.source).toBe("ADMIN_DIRECT");
      expect(inline.value.destinationUrl).toContain("/events/");
    }

    const hero = planBannerDistributionAdapter({
      eventId: "evt-1",
      eventTitle: "Grand Open",
      enabled: true,
      config: {
        presentation: "HERO_BANNER",
        placement: "TRADE_HOME",
        imageUrl: "https://cdn.example/h.webp",
      },
    });
    expect(hero.ok).toBe(true);
    if (hero.ok) {
      expect(hero.value.presentation).toBe("HERO_BANNER");
      expect(hero.value.materializeFeedAd).toBe(false);
      expect(hero.value.source).toBe("ADMIN_DIRECT");
    }

    const bad = planBannerDistributionAdapter({
      eventId: "evt-1",
      eventTitle: "X",
      enabled: true,
      config: { presentation: "HERO_BANNER", placement: "TRADE_CATEGORY" },
    });
    expect(bad.ok).toBe(false);
  });

  it("normalize defaults missing presentation to INLINE_BANNER (explicit save preferred)", () => {
    expect(normalizeEventBannerPresentation(undefined)).toBe("INLINE_BANNER");
    expect(normalizeEventBannerPresentation("HERO_BANNER")).toBe("HERO_BANNER");
  });

  it("Admin Dist panel uses FeedAdFramePreview + DeliveryAdBanner (no fake markup)", () => {
    const src = readFileSync(
      join(ROOT, "components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx"),
      "utf8"
    );
    expect(src).toContain("FeedAdFramePreview");
    expect(src).toContain("DeliveryAdBanner");
    expect(src).toContain("listEventBannerPresentations");
    expect(src).toContain("listEventBannerPlacementsForPresentation");
    expect(src).toContain("presentation: bannerPresentation");
  });
});

function candidate(
  partial: Partial<PlatformPopupCandidate> & { id: string }
): PlatformPopupCandidate {
  return {
    id: partial.id,
    status: "active",
    approvalStatus: "approved",
    priority: partial.priority ?? 10,
    startAt: partial.startAt ?? "2026-01-01T00:00:00.000Z",
    endAt: partial.endAt ?? "2026-12-31T00:00:00.000Z",
    timezone: "Asia/Manila",
    surfaces: ["GLOBAL"],
    presentationType: partial.presentationType ?? "center_modal",
    frequencyMode: "once_per_session",
    creative: {
      id: `cr-${partial.id}`,
      status: "ready",
      aspectW: 36,
      aspectH: 25,
      creativeMode: (partial.creative && partial.creative.creativeMode) || "card",
      assetPath: `${partial.id}.webp`,
      assetUrl: `https://cdn.example/${partial.id}.webp`,
      altText: "Ad",
    },
    ctaType: "internal_page",
    ctaTarget: "/market",
    ctaLabel: `CTA ${partial.id}`,
    title: `Title ${partial.id}`,
    body: `Body ${partial.id}`,
    suppressionMode: "SESSION",
    suppressions: [],
    lastImpressionAt: partial.lastImpressionAt ?? null,
    ctaLookup: { exists: true, visible: true, authorized: true },
  };
}

describe("A–D rotation re-proof after presentation content fields", () => {
  it("SAME WINNER FOREVER = NO; each winner keeps own presentation content", () => {
    const a = candidate({
      id: "camp-a",
      presentationType: "center_modal",
      creative: {
        id: "cr-a",
        status: "ready",
        aspectW: 36,
        aspectH: 25,
        creativeMode: "artwork",
        assetPath: "a.webp",
        assetUrl: "https://cdn.example/a.webp",
        altText: "A",
      },
      lastImpressionAt: "2026-06-01T00:00:00.000Z",
    });
    const b = candidate({
      id: "camp-b",
      presentationType: "center_modal",
      lastImpressionAt: null,
    });
    const c = candidate({
      id: "camp-c",
      presentationType: "bottom_sheet",
      lastImpressionAt: "2026-05-01T00:00:00.000Z",
    });
    const d = candidate({
      id: "camp-d",
      presentationType: "benefit_dialog",
      lastImpressionAt: "2026-07-01T00:00:00.000Z",
    });

    const sorted = [a, b, c, d].slice().sort(comparePopupCandidatesForRotation);
    expect(sorted[0].id).toBe("camp-b");

    const r1 = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-08-01T00:00:00.000Z"),
      sessionKey: "s1",
      candidates: [a, b, c, d],
    });
    expect(r1.ok && r1.winner?.campaignId).toBe("camp-b");

    const afterB = [a, { ...b, lastImpressionAt: "2026-08-01T00:00:00.000Z" }, c, d];
    const r2 = resolvePopupAd({
      pathname: "/market",
      now: new Date("2026-08-01T01:00:00.000Z"),
      sessionKey: "s2",
      candidates: afterB,
    });
    expect(r2.ok && r2.winner?.campaignId).toBe("camp-c");

    const winners = [r1, r2].map((r) => (r.ok ? r.winner?.campaignId : null));
    expect(new Set(winners).size).toBe(2);

    const presentation = buildPlatformPopupPresentationWinner(
      {
        campaignId: c.id,
        creativeId: c.creative!.id,
        surface: "TRADE",
        href: "/market",
        presentationType: "bottom_sheet",
        frequencyMode: "once_per_session",
        creativeMode: "card",
      },
      c,
      {
        assetUrl: c.creative!.assetUrl,
        assetPath: c.creative!.assetPath,
        altText: c.creative!.altText,
      },
      {
        title: c.title,
        body: c.body,
        ctaLabel: c.ctaLabel,
        frequencyMode: "once_per_session",
        suppressionMode: "SESSION",
        timezone: "Asia/Manila",
      }
    );
    expect(presentation?.title).toBe("Title camp-c");
    expect(presentation?.cta.label).toBe("CTA camp-c");
    expect(presentation?.presentationType).toBe("bottom_sheet");
  });
});
