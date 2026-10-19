/**
 * Scope B EVT-05 / EVT-07 — feed ad + banner link validation on the shared DestinationRef contract.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { feedAdDestinationRef, normalizeFeedAdDestination } from "@/lib/ads/feed-ad-destination";
import {
  describeDestinationForAdmin,
  normalizeOptionalDestinationHref,
} from "@/lib/destination/optional-destination-href";
import {
  parseStoreBannerAdCampaignCreateBody,
  parseStoreBannerAdCampaignUpdateBody,
} from "@/lib/stores/store-banner-ad-campaign-writer";

describe("feed ad destination (EVT-05)", () => {
  it("accepts event destinations (stored as internal_page /events/:id)", () => {
    const viaType = normalizeFeedAdDestination({ destinationType: "event", destinationId: "ev1" });
    expect(viaType).toEqual({
      ok: true,
      value: { destinationType: "internal_page", destinationId: "", destinationUrl: "/events/ev1" },
    });
    const viaPath = normalizeFeedAdDestination({ destinationType: "internal_page", destinationUrl: "/events/ev1" });
    expect(viaPath.ok).toBe(true);
    expect(feedAdDestinationRef({ destinationType: "internal_page", destinationUrl: "/events/ev1" })).toEqual({
      kind: "event",
      eventId: "ev1",
    });
  });

  it("rejects http and unsafe links", () => {
    const err = (destinationType: string, destinationUrl: string) => {
      const r = normalizeFeedAdDestination({ destinationType, destinationUrl });
      return r.ok ? "ok" : r.error;
    };
    expect(err("external_url", "http://example.com")).toBe("https_required");
    expect(err("internal_page", "http://example.com")).toBe("https_required");
    expect(err("external_url", "javascript:alert(1)")).toBe("invalid_url_scheme");
    expect(err("internal_page", "//evil.com")).toBe("internal_path_required");
    expect(err("internal_page", "/admin/users")).toBe("internal_path_forbidden");
    expect(err("external_url", "https://example.com/x")).toBe("ok");
  });

  it("render ref re-validates legacy rows (http never opens; NONE → null)", () => {
    expect(feedAdDestinationRef({ destinationType: "external_url", destinationUrl: "http://legacy.example" })).toBeNull();
    expect(feedAdDestinationRef({ destinationType: "internal_page", destinationUrl: "" })).toBeNull();
    expect(feedAdDestinationRef({ destinationType: "store", destinationId: "s 1" })).toEqual({
      kind: "internal_route",
      path: "/stores/s%201",
    });
    expect(feedAdDestinationRef({ destinationType: "external_url", destinationUrl: "https://a.b/" })).toEqual({
      kind: "external_url",
      url: "https://a.b/",
    });
  });

  it("feed ad carousel opens via the shared destination link (openDestination)", () => {
    const src = readFileSync("components/ads/FeedAdBannerCarousel.tsx", "utf8");
    expect(src).toContain("<DestinationLink");
    expect(src).toContain("feedAdDestinationRef");
    expect(src).not.toContain('target={external ? "_blank"');
  });
});

describe("banner links (EVT-07)", () => {
  it("optional link: empty = no link, otherwise canonical DestinationRef href", () => {
    expect(normalizeOptionalDestinationHref("")).toEqual({ ok: true, href: "", ref: null });
    expect(normalizeOptionalDestinationHref("  /market ")).toMatchObject({ ok: true, href: "/market" });
    expect(normalizeOptionalDestinationHref("/events/e1")).toMatchObject({ ok: true, href: "/events/e1", ref: { kind: "event" } });
    expect(normalizeOptionalDestinationHref("http://x.y")).toEqual({ ok: false, error: "https_required" });
    expect(normalizeOptionalDestinationHref("javascript:alert(1)").ok).toBe(false);
    expect(normalizeOptionalDestinationHref("/stores/owner/x").ok).toBe(false);
  });

  it("admin preview describes kind + href", () => {
    expect(describeDestinationForAdmin("/events/e1")).toEqual({ ok: true, kind: "event", href: "/events/e1", error: null });
    expect(describeDestinationForAdmin("https://a.b")).toMatchObject({ kind: "external_url", href: "https://a.b/" });
    expect(describeDestinationForAdmin("")).toMatchObject({ ok: true, kind: "none" });
    expect(describeDestinationForAdmin("//x")).toMatchObject({ ok: false, error: "invalid_internal_path" });
  });

  it("store banner writer rejects invalid cta_href on create and update", () => {
    const base = {
      surface: "stores_home_hero",
      imageUrl: "https://img/x.png",
      startAt: "2026-10-01T00:00:00Z",
      endAt: "2026-11-01T00:00:00Z",
    };
    expect(parseStoreBannerAdCampaignCreateBody({ ...base, ctaHref: "http://x.y" })).toEqual({
      ok: false,
      error: "invalid_cta_href",
    });
    const ok = parseStoreBannerAdCampaignCreateBody({ ...base, ctaHref: "/events/e1" });
    expect(ok.ok && ok.value.ctaHref).toBe("/events/e1");
    const none = parseStoreBannerAdCampaignCreateBody({ ...base });
    expect(none.ok && none.value.ctaHref).toBe("");
    expect(parseStoreBannerAdCampaignUpdateBody({ id: "b1", cta_href: "javascript:alert(1)" })).toEqual({
      ok: false,
      error: "invalid_cta_href",
    });
    const upd = parseStoreBannerAdCampaignUpdateBody({ id: "b1", ctaHref: "https://a.b/c" });
    expect(upd.ok && upd.value.ctaHref).toBe("https://a.b/c");
  });

  it("admin banners API validates link on create and update; renderers open via openDestination", () => {
    for (const f of ["app/api/admin/banners/route.ts", "app/api/admin/banners/[id]/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("normalizeOptionalDestinationHref(body.targetUrl)");
      expect(src).toContain("invalid_target_url");
    }
    for (const f of [
      "components/my/MyTopBanner.tsx",
      "components/stores/advertising/DeliveryAdBanner.tsx",
      "components/platform-events/PlatformEventDetailContent.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("<DestinationLink");
      expect(src).not.toContain('from "next/link"');
    }
    const link = readFileSync("components/destination/DestinationLink.tsx", "utf8");
    expect(link).toContain("openDestination(ref, router)");
  });
});
