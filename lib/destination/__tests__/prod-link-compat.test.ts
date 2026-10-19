import { describe, expect, it } from "vitest";
import { feedAdDestinationRef, normalizeFeedAdDestination } from "@/lib/ads/feed-ad-destination";
import { normalizeOptionalDestinationHref } from "@/lib/destination/optional-destination-href";
import { normalizePlatformPopupCta, resolvePlatformPopupCtaDestinationRef } from "@/lib/platform-popup/cta";
import { destinationHref } from "@/lib/destination/destination-contract";

/**
 * Scope B compatibility — every link SHAPE stored in production on 2026-10-19 (feed ads, store
 * banners, promotion popups, incl. store / product / community targets) keeps resolving to the
 * same href it had before the shared DestinationRef contract. No new entity check is added here.
 */
describe("production link shapes stay compatible", () => {
  it("feed ads", () => {
    const rows = [
      { destinationType: "internal_page", destinationUrl: "/market", href: "/market" },
      { destinationType: "internal_page", destinationUrl: "/philife", href: "/philife" },
      { destinationType: "internal_page", destinationUrl: "/", href: "/" },
      { destinationType: "internal_page", destinationUrl: "/events/4b366b69-a80d-4c0d-9689-f358551a8c40", href: "/events/4b366b69-a80d-4c0d-9689-f358551a8c40" },
      { destinationType: "external_url", destinationUrl: "https://example.com/final-d", href: "https://example.com/final-d" },
      { destinationType: "community_post", destinationId: "3e2d5995-f0a5-425e-bed8-13426eca634c", href: "/philife/post/3e2d5995-f0a5-425e-bed8-13426eca634c" },
      { destinationType: "store", destinationId: "aa11", href: "/stores/aa11" },
      { destinationType: "trade_listing", destinationId: "p1", href: "/post/p1" },
    ];
    for (const r of rows) {
      expect(normalizeFeedAdDestination(r).ok, JSON.stringify(r)).toBe(true);
      const ref = feedAdDestinationRef(r);
      expect(ref && destinationHref(ref), JSON.stringify(r)).toBe(r.href);
    }
    // empty internal_page = "no link" (unchanged)
    expect(normalizeFeedAdDestination({ destinationType: "internal_page", destinationUrl: "" }).ok).toBe(true);
  });

  it("store banners (cta_href)", () => {
    for (const href of ["/stores", "/stores/%EB%A7%8C%EB%91%90%EB%84%A4%EC%A7%91-cdcf25a7", ""]) {
      expect(normalizeOptionalDestinationHref(href).ok, href).toBe(true);
    }
  });

  it("promotion popups incl. store targets", () => {
    const rows = [
      { ctaType: "internal_page", ctaTarget: "/market", href: "/market" },
      { ctaType: "internal_page", ctaTarget: "/stores/19085860-52d2-4183-b033-e71fcb58bcec", href: "/stores/19085860-52d2-4183-b033-e71fcb58bcec" },
      { ctaType: "store", ctaTarget: "aa11", href: "/stores/aa11" },
      { ctaType: "event_detail", ctaTarget: "4b366b69-a80d-4c0d-9689-f358551a8c40", href: "/events/4b366b69-a80d-4c0d-9689-f358551a8c40" },
      { ctaType: "community_post", ctaTarget: "c1", href: "/philife/post/c1" },
      { ctaType: "trade_listing", ctaTarget: "t1", href: "/post/t1" },
    ];
    for (const r of rows) {
      const n = normalizePlatformPopupCta(r);
      expect(n.ok && n.value.href, JSON.stringify(r)).toBe(r.href);
      const ref = resolvePlatformPopupCtaDestinationRef(r);
      expect(ref && destinationHref(ref), JSON.stringify(r)).toBe(r.href);
    }
  });
});
