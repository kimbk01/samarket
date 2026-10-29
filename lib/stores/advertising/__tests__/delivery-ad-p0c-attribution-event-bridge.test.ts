/**
 * P0-C — HOME/BROWSE sponsored attribution event-bridge proof (CODE_EVENT_BRIDGE_PROVEN).
 * Test-only. No production implementation changes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  issueEligibleDeliveryAdExposure,
  verifyDeliveryAdExposureToken,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { projectBrowsePaidAdInsertionMetaRow } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";
import { orderHomeRestStoresForPaidInsertion } from "@/lib/stores/product/stores-home-shelf-card-benefit";
import { CUT_G_EVENT_AUTHORITY } from "@/lib/stores/advertising/delivery-ad-event-writer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("P0-C HOME/BROWSE attribution event bridge", () => {
  it("C1/C2 — HOME issued token is the same token handed to beacon impression+click props", () => {
    const issued = issueEligibleDeliveryAdExposure({
      campaignId: "home-camp-1",
      productKind: "store_sponsored",
      creativeId: null,
      inventoryId: null,
      storeId: "store-home-1",
      surface: "STORES_HOME_FEED",
      destinationType: "store_detail",
      destinationId: "store-home-1",
      preview: false,
    });
    const verified = verifyDeliveryAdExposureToken(issued.token);
    expect(verified.ok).toBe(true);

    const stores = [{ id: "store-home-1", slug: "home-store" }] as StoreHomeFeedItem[];
    const meta: StoresHomeInsertionMeta = {
      paidAds: [],
      coupons: [],
      restInsertion: {
        organicIds: ["store-home-1"],
        rows: [
          {
            kind: "paid_ad",
            campaignId: "home-camp-1",
            storeId: "store-home-1",
            title: "t",
            headline: "h",
            bodyCopy: null,
            imageUrl: null,
            placement: "stores_home",
            isSponsored: true,
            exposureToken: issued.token,
          },
        ],
        adCount: 1,
        sponsoredStoreIds: ["store-home-1"],
        surfaceAllowed: true,
      },
    };
    const ordered = orderHomeRestStoresForPaidInsertion(stores, meta);
    const sponsored = ordered.find((o) => o.isSponsored);
    expect(sponsored?.exposureToken).toBe(issued.token);

    const timesale = read("components/stores/home/presentation/StoresHomeTimesaleRowCard.tsx");
    expect(timesale).toContain("exposureToken={exposureToken}");
    expect(timesale).toContain("<DeliveryAdSponsoredBeacon");
    expect(timesale).not.toContain("issueEligibleDeliveryAdExposure");

    const beacon = read("components/stores/advertising/DeliveryAdSponsoredBeacon.tsx");
    expect(beacon).toContain("exposureToken: token || null");
    expect(beacon).toContain("reportDeliveryAdClick({ exposureToken: token, sessionSeed })");
    expect(beacon).toMatch(/const token = String\(props\.exposureToken/);
  });

  it("C3/C4 — BROWSE issued token is the same token handed to beacon impression+click props", () => {
    const row = projectBrowsePaidAdInsertionMetaRow({
      id: "browse-camp-1",
      storeId: "store-browse-1",
      title: "t",
      headline: "h",
      bodyCopy: null,
      imageUrl: null,
      placement: "stores_browse",
    });
    const verified = verifyDeliveryAdExposureToken(row.exposureToken);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.surface).toBe("STORES_CATEGORY_FEED");
      expect(verified.payload.campaignId).toBe("browse-camp-1");
    }

    const browseView = read("components/stores/browse/StoresBrowsePrimaryView.tsx");
    expect(browseView).toContain("exposureToken={item.row.exposureToken}");
    expect(browseView).toContain("<DeliveryAdSponsoredBeacon");
    expect(browseView).not.toContain("issueEligibleDeliveryAdExposure");

    const beacon = read("components/stores/advertising/DeliveryAdSponsoredBeacon.tsx");
    /** Same prop token drives both impression observer and click capture — no re-issue. */
    expect(beacon).toContain("useDeliveryAdImpressionObserver(ref,");
    expect(beacon).toContain("reportDeliveryAdClick({ exposureToken: token, sessionSeed })");
    expect(beacon).not.toContain("issueEligibleDeliveryAdExposure");
    expect(beacon).not.toContain("issueDeliveryAdExposureToken");
  });

  it("C5 — HOME/BROWSE terminate at the same existing impression/click API + event writer", () => {
    const events = read("components/stores/advertising/useDeliveryAdEvents.ts");
    expect(events).toContain('postEvent("/api/stores/ads/impression"');
    expect(events).toContain("exposureToken: props.exposureToken");
    expect(events).toContain('postEvent("/api/stores/ads/click"');
    expect(events).toContain("exposureToken: input.exposureToken");

    const impressionRoute = read("app/api/stores/ads/impression/route.ts");
    const clickRoute = read("app/api/stores/ads/click/route.ts");
    expect(impressionRoute).toContain("recordDeliveryAdImpressionFromToken");
    expect(clickRoute).toContain("recordDeliveryAdClickFromToken");

    const writer = read("lib/stores/advertising/delivery-ad-event-writer.ts");
    expect(writer).toContain("recordDeliveryAdImpressionFromToken");
    expect(writer).toContain("recordDeliveryAdClickFromToken");
    expect(CUT_G_EVENT_AUTHORITY.impressionRpc).toBe("delivery_ad_record_impression");
    expect(CUT_G_EVENT_AUTHORITY.clickRpc).toBe("delivery_ad_record_click");
    expect(impressionRoute).toContain("tryGetSupabaseForStores");
    expect(clickRoute).toContain("tryGetSupabaseForStores");
  });

  it("C6 — organic HOME has no sponsored attribution", () => {
    const stores = [{ id: "o1" }, { id: "o2" }] as StoreHomeFeedItem[];
    const ordered = orderHomeRestStoresForPaidInsertion(stores, {
      paidAds: [],
      coupons: [],
      restInsertion: {
        organicIds: ["o1", "o2"],
        rows: [
          { kind: "organic", storeId: "o1" },
          { kind: "organic", storeId: "o2" },
        ],
        adCount: 0,
        sponsoredStoreIds: [],
        surfaceAllowed: true,
      },
    });
    expect(ordered.every((o) => !o.isSponsored && !o.exposureToken)).toBe(true);

    const timesale = read("components/stores/home/presentation/StoresHomeTimesaleRowCard.tsx");
    expect(timesale).toMatch(/isSponsored\s*&&\s*campaignId\s*&&\s*exposureToken/);
  });

  it("C7 — organic BROWSE has no sponsored attribution mount", () => {
    const browseView = read("components/stores/browse/StoresBrowsePrimaryView.tsx");
    const organicStart = browseView.indexOf('if (item.kind === "organic")');
    expect(organicStart).toBeGreaterThanOrEqual(0);
    const organicBlock = browseView.slice(organicStart, organicStart + 500);
    expect(organicBlock).toContain("StoreBrowseCategoryRowCard");
    expect(organicBlock).not.toContain("DeliveryAdSponsoredBeacon");
    expect(browseView).toMatch(/item\.kind === "paid_ad" && item\.row\.exposureToken/);
  });

  it("C8 — preview paths remain telemetry-free (no beacon / no homeInsertions handoff)", () => {
    const homePreview = read("components/admin/stores/AdminStoresHomeShelfLivePreview.tsx");
    const browsePreview = read("components/admin/stores/AdminStoresCategoryBrowseLivePreview.tsx");
    expect(homePreview).not.toContain("DeliveryAdSponsoredBeacon");
    expect(browsePreview).not.toContain("DeliveryAdSponsoredBeacon");

    const timesaleCallStart = homePreview.indexOf("<StoresHomeTimesaleRowCardList");
    expect(timesaleCallStart).toBeGreaterThanOrEqual(0);
    const timesaleCall = homePreview.slice(
      timesaleCallStart,
      homePreview.indexOf("/>", timesaleCallStart) + 2
    );
    expect(timesaleCall).not.toContain("homeInsertions");
  });

  it("C9 — HOME/BROWSE consumers do not issue a second token", () => {
    const timesale = read("components/stores/home/presentation/StoresHomeTimesaleRowCard.tsx");
    const browseView = read("components/stores/browse/StoresBrowsePrimaryView.tsx");
    const browseCard = read("components/stores/browse/StoreBrowseCategoryRowCard.tsx");
    for (const src of [timesale, browseView, browseCard]) {
      expect(src).not.toContain("issueEligibleDeliveryAdExposure");
      expect(src).not.toContain("issueDeliveryAdExposureToken");
    }
  });

  it("C10 — original store destination contracts preserved after sponsored click wiring", () => {
    const timesale = read("components/stores/home/presentation/StoresHomeTimesaleRowCard.tsx");
    expect(timesale).toContain('const href = `/stores/${encodeURIComponent(store.slug)}`');
    expect(timesale).toContain("<Link");
    expect(timesale).toContain("href={href}");

    const browseCard = read("components/stores/browse/StoreBrowseCategoryRowCard.tsx");
    expect(browseCard).toContain("storeDetailHrefFromSlug");
    expect(browseCard).toContain("navigateToDeliveryStoreCard");
    expect(browseCard).not.toContain("DeliveryAdSponsoredBeacon");

    const beacon = read("components/stores/advertising/DeliveryAdSponsoredBeacon.tsx");
    expect(beacon).toContain("onClickCapture");
    expect(beacon).not.toMatch(/preventDefault\(/);
    expect(beacon).not.toMatch(/router\.(push|replace)/);
  });

  it("HOME and BROWSE issuer surfaces are distinct but share the same issuer authority", () => {
    const homeMeta = read("lib/stores/composition/stores-composition-home-insertion-meta.ts");
    const browseMeta = read("lib/stores/composition/stores-composition-browse-insertion-meta.ts");
    expect(homeMeta).toContain("issueEligibleDeliveryAdExposure");
    expect(homeMeta).toContain('"STORES_HOME_FEED"');
    expect(browseMeta).toContain("issueEligibleDeliveryAdExposure");
    expect(browseMeta).toContain('surface: "STORES_CATEGORY_FEED"');
    expect(browseMeta).toContain("projectBrowsePaidAdInsertionMetaRow");
  });
});
