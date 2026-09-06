/**
 * PRODUCT GAP close — Delivery paid/compensation extension money semantics + schedule guard.
 */
import { describe, expect, it } from "vitest";
import { calculateDeliveryAdExtensionQuote } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const policy = {
  extensionEnabled: true,
  additionalDayPriceMinor: 10000,
  currency: "PHP",
  minimumExtensionDays: 1,
  maximumExtensionDays: 30,
  extensionUnitDays: 1,
};

describe("delivery ad extension money semantics", () => {
  it("PAID quote charges days × unit price", () => {
    const q = calculateDeliveryAdExtensionQuote({
      previousEndAtIso: "2026-10-01T00:00:00.000Z",
      requestedDays: 7,
      policy,
      partnerDiscountPercent: 0,
      extensionKind: "PAID",
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.finalExtensionAmountMinor).toBe(70000);
    expect(q.currency).toBe("PHP");
    expect(q.daysAdded).toBe(7);
    expect(q.newEndAt).toBe("2026-10-08T00:00:00.000Z");
  });

  it("ADMIN_FREE_COMPENSATION quote is zero charge", () => {
    const q = calculateDeliveryAdExtensionQuote({
      previousEndAtIso: "2026-10-01T00:00:00.000Z",
      requestedDays: 3,
      policy,
      extensionKind: "ADMIN_FREE_COMPENSATION",
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.finalExtensionAmountMinor).toBe(0);
    expect(q.extensionKind).toBe("ADMIN_FREE_COMPENSATION");
  });

  it("extension writer uses cash debit + snapshot + audit extended", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/advertising/admin-delivery-ad-extension-writer.ts"),
      "utf8"
    );
    expect(src).toContain("debitBusinessCashForDeliveryAd");
    expect(src).toContain("DELIVERY_AD_EXTENSION_SNAPSHOT_TABLE");
    expect(src).toContain('action: "extended"');
    expect(src).toContain("ADMIN_FREE_COMPENSATION");
    expect(src).not.toContain("ADMIN_OVERRIDE");
  });

  it("schedule update blocks silent paid end_at lengthening", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/advertising/admin-delivery-ad-writer.ts"),
      "utf8"
    );
    expect(src).toContain("use_extension_flow");
    expect(src).toContain("nextEndMs > prevEndMs");
  });

  it("Admin Delivery UI has no hide CTA; extend route exists", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx"),
      "utf8"
    );
    expect(ui).toContain("/extend");
    expect(ui).toContain("ADMIN_FREE_COMPENSATION");
    expect(ui).not.toMatch(/action:\s*[\"']hide[\"']/);
    expect(ui).not.toMatch(/act\([\"']hide[\"']\)/);
    const route = readFileSync(
      join(process.cwd(), "app/api/admin/delivery-ads/[campaignId]/extend/route.ts"),
      "utf8"
    );
    expect(route).toContain("adminExtendDeliveryAdCampaign");
  });

  it("Feed pause removes eligibility; Admin compensation extend wired", () => {
    const place = readFileSync(join(process.cwd(), "lib/ads/feed-ad-placement.ts"), "utf8");
    expect(place).toContain('if (c.status !== "active") return false');
    const route = readFileSync(
      join(process.cwd(), "app/api/admin/feed-ad-requests/[id]/route.ts"),
      "utf8"
    );
    expect(route).toContain("extend_compensation");
    expect(route).toContain("adminCompensateExtendFeedAdCampaign");
    const renew = readFileSync(join(process.cwd(), "lib/ads/renew-feed-ad-campaign.ts"), "utf8");
    expect(renew).toContain("spendUserPoints");
    expect(renew).toContain("Period extended + Point NOT spent = forbidden");
  });

  it("control plane does not coerce unavailable collision counts to 0", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/ads/AdminAdsExposureControlPlane.tsx"),
      "utf8"
    );
    expect(ui).toContain("collisionBlocking.unavailable");
    expect(ui).not.toMatch(/collisionBlocking\.count \?\? 0/);
    expect(ui).not.toMatch(/collisionWarning\.count \?\? 0/);
  });

  it("owner popup creative uses POPUP_CREATIVE_SOURCE_MAX_BYTES", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/me/platform-popup-requests/[requestId]/creative/route.ts"),
      "utf8"
    );
    expect(route).toContain("POPUP_CREATIVE_SOURCE_MAX_BYTES");
  });

  it("feed ops default excludes live exposing", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/ads/AdminFeedAdsListPage.tsx"),
      "utf8"
    );
    expect(src).toContain('exposure !== "exposing"');
    expect(src).not.toMatch(
      /actionable[\s\S]{0,120}c\.status === \"active\"/
    );
  });

  it("owner history loads before/after for extension parity", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/stores/advertising/owner-store-sponsored-writer.ts"),
      "utf8"
    );
    expect(writer).toContain("before_json, after_json");
    const detail = readFileSync(
      join(process.cwd(), "components/business/owner/ads/OwnerDeliveryAdDetailView.tsx"),
      "utf8"
    );
    expect(detail).toContain('h.action === "extended"');
  });
});

describe("delivery ad extension money semantics (contract doc)", () => {
  it("contract documents hide UNSUPPORTED and extension authorities", () => {
    const contract = readFileSync(
      join(process.cwd(), "docs/perf/admin-ads-reconstruction/ADS-PRODUCT-CONTRACT.md"),
      "utf8"
    );
    expect(contract).toContain("UNSUPPORTED");
    expect(contract).toContain("EXTEND PAID");
    expect(contract).not.toMatch(/HIDE \| maps to pause\/end/);
  });
});
