/**
 * P0-A — HOME STORES_HOME_FEED attribution consumer handoff (EXISTING_API_CONSUMPTION).
 * Proves Timesale list mounts existing DeliveryAdSponsoredBeacon with the API token.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { orderHomeRestStoresForPaidInsertion } from "@/lib/stores/product/stores-home-shelf-card-benefit";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";

const timesaleListSrc = () =>
  readFileSync(
    join(process.cwd(), "components/stores/home/presentation/StoresHomeTimesaleRowCard.tsx"),
    "utf8"
  );

const beaconSrc = () =>
  readFileSync(
    join(process.cwd(), "components/stores/advertising/DeliveryAdSponsoredBeacon.tsx"),
    "utf8"
  );

describe("P0-A HOME attribution consumer handoff", () => {
  it("T1/T2/T3 — Timesale list forwards exposureToken into DeliveryAdSponsoredBeacon", () => {
    const src = timesaleListSrc();
    expect(src).toContain('from "@/components/stores/advertising/DeliveryAdSponsoredBeacon"');
    expect(src).toMatch(/exposureToken/);
    expect(src).toMatch(
      /ordered\.map\(\(\{\s*store:\s*s,\s*isSponsored,\s*campaignId,\s*exposureToken\s*\}\)/
    );
    expect(src).toContain("<DeliveryAdSponsoredBeacon");
    expect(src).toContain("exposureToken={exposureToken}");
    expect(src).toContain("campaignId={campaignId}");
    expect(src).toMatch(/isSponsored\s*&&\s*campaignId\s*&&\s*exposureToken/);
  });

  it("T2/T3 — canonical beacon owns impression observer + click capture", () => {
    const src = beaconSrc();
    expect(src).toContain("useDeliveryAdImpressionObserver");
    expect(src).toContain("reportDeliveryAdClick");
    expect(src).toContain("onClickCapture");
    expect(src).toContain("exposureToken: token");
  });

  it("T4 — organic rows from order helper have no sponsored token mount condition", () => {
    const stores = [{ id: "a" }, { id: "b" }] as StoreHomeFeedItem[];
    const meta: StoresHomeInsertionMeta = {
      paidAds: [],
      coupons: [],
      restInsertion: {
        organicIds: ["a", "b"],
        rows: [
          { kind: "organic", storeId: "a" },
          { kind: "organic", storeId: "b" },
        ],
        adCount: 0,
        sponsoredStoreIds: [],
        surfaceAllowed: true,
      },
    };
    const ordered = orderHomeRestStoresForPaidInsertion(stores, meta);
    expect(ordered.every((o) => !o.isSponsored && !o.exposureToken)).toBe(true);
  });

  it("T1 — sponsored insertion row preserves exposureToken through order helper", () => {
    const token = "issued.token.example";
    const stores = [{ id: "s1" }, { id: "s2" }] as StoreHomeFeedItem[];
    const meta: StoresHomeInsertionMeta = {
      paidAds: [],
      coupons: [],
      restInsertion: {
        organicIds: ["s1", "s2"],
        rows: [
          {
            kind: "paid_ad",
            campaignId: "c1",
            storeId: "s1",
            title: "t",
            headline: "h",
            bodyCopy: null,
            imageUrl: null,
            placement: "stores_home",
            isSponsored: true,
            exposureToken: token,
          },
          { kind: "organic", storeId: "s2" },
        ],
        adCount: 1,
        sponsoredStoreIds: ["s1"],
        surfaceAllowed: true,
      },
    };
    const ordered = orderHomeRestStoresForPaidInsertion(stores, meta);
    const sponsored = ordered.find((o) => o.isSponsored);
    expect(sponsored?.campaignId).toBe("c1");
    expect(sponsored?.exposureToken).toBe(token);
    expect(ordered.find((o) => o.store.id === "s2")?.isSponsored).toBe(false);
  });

  it("T5 — Timesale consumer does not issue a second exposure token", () => {
    const src = timesaleListSrc();
    expect(src).not.toContain("issueEligibleDeliveryAdExposure");
    expect(src).not.toContain("issueDeliveryAdExposureToken");
  });

  it("T6 — store destination Link contract unchanged on Timesale card", () => {
    const src = timesaleListSrc();
    expect(src).toContain('const href = `/stores/${encodeURIComponent(store.slug)}`');
    expect(src).toContain("<Link");
    expect(src).toContain("href={href}");
  });

  it("T7 — admin live preview Timesale path does not pass homeInsertions (telemetry-free)", () => {
    const preview = readFileSync(
      join(process.cwd(), "components/admin/stores/AdminStoresHomeShelfLivePreview.tsx"),
      "utf8"
    );
    const start = preview.indexOf("<StoresHomeTimesaleRowCardList");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = preview.indexOf("/>", start);
    expect(end).toBeGreaterThan(start);
    const block = preview.slice(start, end + 2);
    expect(block).toContain("StoresHomeTimesaleRowCardList");
    expect(block).not.toContain("homeInsertions");
  });
});
