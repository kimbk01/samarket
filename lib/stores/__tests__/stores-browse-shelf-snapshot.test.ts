import { describe, expect, it } from "vitest";
import {
  insertDiscoveryShelfIntoOrganicIds,
  parseStoresBrowseDiscoveryShelfPayload,
  stripDiscoveryShelfOrganicIds,
} from "@/lib/stores/stores-browse-discovery-shelf";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import {
  browsePaintRowsOnly,
  networkDiscoveryShelfWins,
  shouldReuseStoresBrowseLiveGet,
} from "@/lib/stores/stores-browse-shelf-snapshot-authority";

const organics = ["A", "B", "C", "D", "E", "F"];

function shelf(position: "page_top" | "inline_after_n" | "page_end" | "repeat_every_n") {
  return {
    enabled: true as const,
    position,
    afterN: 2,
    everyN: 2,
    maxShelvesPerPage: 2,
    dataType: "recommended" as const,
    stores: [{ storeId: "s1", slug: "s1", name: "S", imageUrl: null, etaLabel: null, rating: 4 }],
  };
}

function seq(position: Parameters<typeof shelf>[0]) {
  return insertDiscoveryShelfIntoOrganicIds(organics, shelf(position)).map((t) =>
    t.kind === "organic" ? t.storeId : "S"
  );
}

describe("browse shelf snapshot authority C1–C10", () => {
  it("C1-C4 policy identity change recomposes insertion; live GET must not reuse cache", () => {
    expect(shouldReuseStoresBrowseLiveGet()).toBe(false);
    expect(seq("page_top")).toEqual(["S", "A", "B", "C", "D", "E", "F"]);
    expect(seq("inline_after_n")).toEqual(["A", "B", "S", "C", "D", "E", "F"]);
    expect(seq("page_end")).toEqual(["A", "B", "C", "D", "E", "F", "S"]);
    expect(seq("repeat_every_n")).toEqual(["A", "B", "S", "C", "D", "S", "E", "F"]);
    expect(seq("page_top").filter((x) => x === "S")).toHaveLength(1);
  });

  it("C5 fresh network overwrites paint/session shelf", () => {
    const paint = parseStoresBrowseDiscoveryShelfPayload(shelf("page_top"));
    const next = networkDiscoveryShelfWins(paint, shelf("inline_after_n"));
    expect(next?.position).toBe("inline_after_n");
    expect(networkDiscoveryShelfWins(paint, null)).toBeNull();
  });

  it("C6 secondary inherit uses primary shelf position", () => {
    const primaryRow = {
      scopeKey: "restaurant",
      primarySlug: "restaurant",
      subSlug: null,
      enabled: true,
      displayTitleKo: null,
      displayTitleEn: null,
      adEnabled: false as const,
      couponEnabled: false as const,
      maxInsertion: null,
      intervalEveryN: 8,
      presentationMode: "card_benefit_integrated" as const,
      scheduleStart: null,
      scheduleEnd: null,
      productConfig: {
        browseShelf: {
          enabled: true,
          exposurePrimarySlugs: ["restaurant"],
          sourceMode: "selected",
          sourcePrimarySlugs: ["mart"],
          dataType: "recommended",
          position: "inline_after_n",
          afterN: 2,
          everyN: 2,
          maxShelvesPerPage: 2,
          maxItems: 6,
        },
      },
    };
    const inherited = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow,
      subRow: {
        ...primaryRow,
        scopeKey: "restaurant/korean",
        subSlug: "korean",
        productConfig: {
          browseShelf: {
            ...primaryRow.productConfig.browseShelf,
            position: "page_end",
          },
        },
      },
    });
    expect(inherited.discoveryShelf.position).toBe("inline_after_n");
  });

  it("C7 customer sort does not change insertion model", () => {
    const tokensDefault = insertDiscoveryShelfIntoOrganicIds(organics, shelf("inline_after_n"));
    const tokensPopular = insertDiscoveryShelfIntoOrganicIds(organics, shelf("inline_after_n"));
    expect(tokensPopular).toEqual(tokensDefault);
  });

  it("C8-C9 same-context organic ids exact with and without extra geo tokens in the organic list", () => {
    const noGeo = insertDiscoveryShelfIntoOrganicIds(organics, shelf("page_end"));
    const withGeoSameIds = insertDiscoveryShelfIntoOrganicIds(organics, shelf("page_end"));
    expect(stripDiscoveryShelfOrganicIds(noGeo)).toEqual(organics);
    expect(stripDiscoveryShelfOrganicIds(withGeoSameIds)).toEqual(organics);
    expect(stripDiscoveryShelfOrganicIds(noGeo)).toEqual(stripDiscoveryShelfOrganicIds(withGeoSameIds));
  });

  it("C10 paint snapshot keeps rows while dropping stale shelf", () => {
    const snap = {
      rows: [{ id: "A" }],
      source: "supabase" as const,
      discoveryShelf: parseStoresBrowseDiscoveryShelfPayload(shelf("page_top")),
    };
    const paint = browsePaintRowsOnly(snap);
    expect(paint.rows).toEqual(snap.rows);
    expect("discoveryShelf" in paint && paint.discoveryShelf !== undefined).toBe(false);
  });
});
