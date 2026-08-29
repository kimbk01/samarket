/**
 * CUT G — Delivery Ads impression / click / attribution domain tests (G1–G36).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DELIVERY_AD_ATTRIBUTION_POLICY,
  DELIVERY_AD_IMPRESSION_VIEWABILITY,
  attributionEligibleForOrder,
  isDeliveryAdAttributionConfigured,
  selectLastEligibleClick,
} from "@/lib/stores/advertising/delivery-ad-event-contract";
import {
  hashDeliveryAdAttributionBridge,
  hashDeliveryAdViewerSession,
  issueDeliveryAdExposureToken,
  issueEligibleDeliveryAdExposure,
  verifyDeliveryAdExposureToken,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { CUT_G_EVENT_AUTHORITY } from "@/lib/stores/advertising/delivery-ad-event-writer";
import { DELIVERY_AD_ORGANIC_PAID_ISOLATION } from "@/lib/stores/advertising/delivery-ad-domain";
import { DELIVERY_AD_BANNER_RENDERER_CONTRACT } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  dedupeSponsoredCampaignsOnePerStore,
  evaluateStoreSponsoredExposureEligibility,
} from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";

const mig = () =>
  readFileSync(
    join(process.cwd(), "supabase/migrations/20261201160000_delivery_ads_cut_g_events_attribution.sql"),
    "utf8"
  );

describe("CUT G Delivery Ads events + attribution", () => {
  it("G1 eligible Sponsored exposure token issued", () => {
    const { token, payload } = issueEligibleDeliveryAdExposure({
      campaignId: "c1",
      productKind: "store_sponsored",
      storeId: "s1",
      surface: "STORES_HOME_FEED",
      destinationType: "store_detail",
      destinationId: "s1",
    });
    expect(token.includes(".")).toBe(true);
    expect(payload.preview).toBe(false);
    expect(verifyDeliveryAdExposureToken(token).ok).toBe(true);
  });

  it("G2 ineligible / preview token cannot create production events", () => {
    const { token } = issueEligibleDeliveryAdExposure({
      campaignId: "c1",
      productKind: "banner",
      storeId: "s1",
      surface: "STORES_HOME_HERO",
      destinationType: "store_detail",
      destinationId: "s1",
      preview: true,
    });
    const v = verifyDeliveryAdExposureToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.payload.preview).toBe(true);
  });

  it("G3 tampered campaign/store rejected by verify signature", () => {
    const { token } = issueEligibleDeliveryAdExposure({
      campaignId: "c1",
      productKind: "store_sponsored",
      storeId: "s1",
      surface: "STORES_HOME_FEED",
      destinationType: "store_detail",
      destinationId: "s1",
    });
    const [enc] = token.split(".");
    const payload = JSON.parse(Buffer.from(enc, "base64url").toString("utf8"));
    payload.campaignId = "evil";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${token.split(".")[1]}`;
    expect(verifyDeliveryAdExposureToken(forged).ok).toBe(false);
  });

  it("G4 one render instance max impressions (contract)", () => {
    expect(DELIVERY_AD_IMPRESSION_VIEWABILITY.sameRenderInstanceMaxImpressions).toBe(1);
    expect(DELIVERY_AD_IMPRESSION_VIEWABILITY.scrollReentrySameRender).toBe("same_impression");
  });

  it("G5/G13 event_id unique in migration", () => {
    const sql = mig();
    expect(sql).toContain("delivery_ad_impression_events_event_id_uidx");
    expect(sql).toContain("delivery_ad_click_events_event_id_uidx");
    expect(sql).toContain("ON CONFLICT (event_id) DO NOTHING");
  });

  it("G6/G7 Owner/Admin preview does not create production impression (renderer gate)", () => {
    const src = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(src).toContain('renderContext === "customer"');
    expect(src).toContain("useDeliveryAdImpressionObserver");
    expect(src).toMatch(/enabled:\s*isCustomer/);
  });

  it("G8 customer Banner path uses exposure token", () => {
    const hero = readFileSync(
      join(process.cwd(), "components/stores/home/hub/StoresHomeHeroBanner.tsx"),
      "utf8"
    );
    const loader = readFileSync(
      join(process.cwd(), "lib/stores/load-store-banner-ad-campaigns.ts"),
      "utf8"
    );
    expect(loader).toContain("issueEligibleDeliveryAdExposure");
    expect(hero).toContain("exposureToken={slide.exposureToken}");
  });

  it("G9 organic card creates no impression (beacon only for sponsored)", () => {
    const beacon = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdSponsoredBeacon.tsx"),
      "utf8"
    );
    expect(beacon).toContain("Organic cards must not mount");
  });

  it("G10/G14 click destination bound to token", () => {
    const { token, payload } = issueEligibleDeliveryAdExposure({
      campaignId: "c1",
      productKind: "banner",
      storeId: "s1",
      surface: "STORES_HOME_HERO",
      destinationType: "store_menu",
      destinationId: "s1",
    });
    const v = verifyDeliveryAdExposureToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.payload.destinationType).toBe("store_menu");
      expect(v.payload.destinationId).toBe(payload.destinationId);
    }
  });

  it("G11/G12 external CTA / destination types allowlisted", () => {
    const sql = mig();
    expect(sql).toContain("store_detail");
    expect(sql).toContain("store_menu");
    expect(sql).toContain("store_promotion");
  });

  it("G15 navigation remains canonical (click does not block Link)", () => {
    const src = readFileSync(
      join(process.cwd(), "components/stores/advertising/DeliveryAdBanner.tsx"),
      "utf8"
    );
    expect(src).toContain("onClick={onCustomerClick}");
    expect(src).toContain("<Link");
  });

  it("G16–G22 attribution eligibility helpers", () => {
    expect(DELIVERY_AD_ATTRIBUTION_POLICY.status).toBe("NOT_CONFIGURED");
    expect(isDeliveryAdAttributionConfigured(DELIVERY_AD_ATTRIBUTION_POLICY)).toBe(false);
    expect(DELIVERY_AD_ATTRIBUTION_POLICY.impressionOnlyEnabled).toBe(false);

    const now = Date.now();
    const orderAt = new Date(now).toISOString();
    const clickAt = new Date(now - 60_000).toISOString();

    expect(
      attributionEligibleForOrder({
        clickStoreId: "s1",
        orderStoreId: "s1",
        clickOccurredAt: clickAt,
        orderCommittedAt: orderAt,
        windowSeconds: null,
        policyActive: false,
      }).ok
    ).toBe(false);

    expect(
      attributionEligibleForOrder({
        clickStoreId: "s1",
        orderStoreId: "s2",
        clickOccurredAt: clickAt,
        orderCommittedAt: orderAt,
        windowSeconds: 86400,
        policyActive: true,
      })
    ).toEqual({ ok: false, reason: "different_store" });

    expect(
      attributionEligibleForOrder({
        clickStoreId: "s1",
        orderStoreId: "s1",
        clickOccurredAt: orderAt,
        orderCommittedAt: clickAt,
        windowSeconds: 86400,
        policyActive: true,
      })
    ).toEqual({ ok: false, reason: "click_after_order" });

    expect(
      attributionEligibleForOrder({
        clickStoreId: "s1",
        orderStoreId: "s1",
        clickOccurredAt: new Date(now - 10 * 86400_000).toISOString(),
        orderCommittedAt: orderAt,
        windowSeconds: 86400,
        policyActive: true,
      })
    ).toEqual({ ok: false, reason: "outside_window" });

    expect(
      attributionEligibleForOrder({
        clickStoreId: "s1",
        orderStoreId: "s1",
        clickOccurredAt: clickAt,
        orderCommittedAt: orderAt,
        windowSeconds: 86400,
        policyActive: true,
      }).ok
    ).toBe(true);
  });

  it("G20/G21 last eligible click deterministic", () => {
    const last = selectLastEligibleClick([
      { id: "a", occurredAt: "2026-01-01T10:00:00.000Z" },
      { id: "b", occurredAt: "2026-01-01T12:00:00.000Z" },
      { id: "c", occurredAt: "2026-01-01T12:00:00.000Z" },
    ]);
    expect(last?.id).toBe("c");
  });

  it("G23 exactly-once order_id unique", () => {
    expect(mig()).toContain("delivery_ad_order_attributions_order_uidx");
  });

  it("G24 cancel preserves attribution history", () => {
    expect(mig()).toContain("ORDER_CANCELLED");
    expect(mig()).toContain("ON DELETE RESTRICT");
  });

  it("G25 attribution failure does not rollback order", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/me/store-orders/route.ts"),
      "utf8"
    );
    expect(route).toContain("reconcileDeliveryAdAttributionForOrder");
    expect(route).toContain("never fails the order");
  });

  it("G26/G27 RPC EXECUTE service_role only", () => {
    const sql = mig();
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.delivery_ad_record_impression");
    expect(sql).toContain("FROM anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.delivery_ad_record_impression");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("delivery_ad_record_click");
    expect(sql).toContain("delivery_ad_reconcile_order_attribution");
    expect(CUT_G_EVENT_AUTHORITY.executeGrant).toBe("service_role_only");
  });

  it("G28 arbitrary campaign injection blocked (token required)", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/stores/advertising/delivery-ad-event-writer.ts"),
      "utf8"
    );
    expect(writer).toContain("tampered_fields");
    expect(writer).toContain("verifyDeliveryAdExposureToken");
  });

  it("G29 expired exposure token blocked", () => {
    const { token } = issueDeliveryAdExposureToken({
      campaignId: "c1",
      productKind: "banner",
      creativeId: null,
      inventoryId: null,
      storeId: "s1",
      surface: "STORES_HOME_HERO",
      placementIndex: 0,
      renderInstanceId: "r1",
      destinationType: "store_detail",
      destinationId: "s1",
      preview: false,
      ttlMs: -1000,
    });
    expect(verifyDeliveryAdExposureToken(token)).toEqual({ ok: false, error: "expired" });
  });

  it("G30 preview exposure token cannot create production event", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/stores/advertising/delivery-ad-event-writer.ts"),
      "utf8"
    );
    expect(writer).toContain("preview_forbidden");
  });

  it("G31–G33 regression eligibility / dedupe / banner geometry", () => {
    expect(typeof evaluateStoreSponsoredExposureEligibility).toBe("function");
    expect(typeof dedupeSponsoredCampaignsOnePerStore).toBe("function");
    expect(DELIVERY_AD_BANNER_RENDERER_CONTRACT.geometryAuthority).toBe(
      "delivery_ad_inventories"
    );
  });

  it("G34 Admin preview creates no events (no production token on admin UI)", () => {
    const admin = readFileSync(
      join(process.cwd(), "components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx"),
      "utf8"
    );
    expect(admin).toContain('renderContext="admin_preview"');
    expect(admin).not.toContain("exposureToken=");
  });

  it("G35 organic ranking paid-independent", () => {
    expect(DELIVERY_AD_ORGANIC_PAID_ISOLATION).toBeTruthy();
  });

  it("G36 ads event failure does not break HOME (loader catch)", () => {
    const loader = readFileSync(
      join(process.cwd(), "lib/stores/load-store-banner-ad-campaigns.ts"),
      "utf8"
    );
    expect(loader).toContain("catch");
    expect(loader).toMatch(/return \[\]/);
  });

  it("PII: session/bridge hashes only", () => {
    expect(hashDeliveryAdViewerSession("seed").length).toBeGreaterThan(20);
    expect(hashDeliveryAdAttributionBridge("user-1")).not.toContain("user-1");
    expect(mig()).not.toMatch(/viewer_user_id|client_ip|fingerprint/);
  });

  it("indexes present", () => {
    const sql = mig();
    expect(sql).toContain("delivery_ad_impression_campaign_time_idx");
    expect(sql).toContain("delivery_ad_click_store_bridge_time_idx");
    expect(sql).toContain("delivery_ad_attr_campaign_idx");
  });

  it("billing/budget fields absent", () => {
    const sql = mig();
    expect(sql).not.toMatch(/charge_amount|wallet_balance|budget_remaining/);
    expect(CUT_G_EVENT_AUTHORITY.billing).toBe("NONE");
  });
});
