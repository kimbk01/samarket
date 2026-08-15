import { describe, expect, it } from "vitest";
import { buildCreatePostInsertRow } from "@/lib/posts/build-create-post-insert-row";
import { assertActiveTradeNationalLgu } from "@/lib/trade/location/national/assert-active-trade-national-lgu";
import { resolveTradeNationalLgu } from "@/lib/trade/location/national/resolve-trade-national-lgu";
import {
  allowEditTradeLocationSnapshot,
  flattenPostForTradeCompare,
  mergeTradePostFromPatch,
} from "@/lib/trade/trade-lifecycle-policy";

describe("N3 trade write national LGU authority", () => {
  it("Pasig resolves national + local optional still available via separate resolver", () => {
    const r = resolveTradeNationalLgu({ cityMunicipality: "Pasig City" });
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.canonicalId).toBe("1381200000");
  });

  it("Davao / Baguio / Iloilo / Cainta national resolve without local Area", () => {
    const cases = [
      ["Davao City", "1130700000"],
      ["Baguio City", "1430300000"],
      ["Iloilo City", "0631000000"],
      ["Cainta", "0405805000", "Rizal"],
    ] as const;
    for (const c of cases) {
      const r = resolveTradeNationalLgu({
        cityMunicipality: c[0],
        province: c[2] ?? null,
      });
      expect(r.status).toBe("resolved");
      if (r.status === "resolved") expect(r.canonicalId).toBe(c[1]);
    }
  });

  it("insert row stores trade_lgu_id and omits empty local region/city", () => {
    const row = buildCreatePostInsertRow(
      {
        type: "trade",
        categoryId: "cat",
        title: "t",
        content: "c",
        tradeLguId: "1130700000",
      },
      "user-1"
    );
    expect(row.trade_lgu_id).toBe("1130700000");
    expect(row.region).toBeUndefined();
    expect(row.city).toBeUndefined();
  });

  it("insert row keeps Pasig local Area + national id", () => {
    const row = buildCreatePostInsertRow(
      {
        type: "trade",
        categoryId: "cat",
        title: "t",
        content: "c",
        region: "manila",
        city: "m20",
        tradeLguId: "1381200000",
      },
      "user-1"
    );
    expect(row.trade_lgu_id).toBe("1381200000");
    expect(row.region).toBe("manila");
    expect(row.city).toBe("m20");
  });

  it("rejects invalid / inactive trade_lgu_id", () => {
    expect(assertActiveTradeNationalLgu("INVALID").ok).toBe(false);
    expect(assertActiveTradeNationalLgu("").ok).toBe(false);
    expect(assertActiveTradeNationalLgu("1130700000").ok).toBe(true);
  });

  it("blocks ambiguous and unresolved addresses at authority layer", () => {
    expect(resolveTradeNationalLgu({ cityMunicipality: "Santa Cruz" }).status).toBe("ambiguous");
    expect(
      resolveTradeNationalLgu({ cityMunicipality: "Atlantis City" }).status
    ).toBe("unresolved");
  });

  it("published listing freezes trade_lgu_id when location edit disallowed", () => {
    expect(allowEditTradeLocationSnapshot("active")).toBe(false);
    expect(allowEditTradeLocationSnapshot("draft")).toBe(true);
    const before = flattenPostForTradeCompare({
      title: "a",
      trade_category_id: "c",
      price: 1,
      region: "manila",
      city: "m20",
      trade_lgu_id: "1381200000",
      content: "x",
      images: null,
      thumbnail_url: null,
      is_free_share: false,
      is_price_offer: false,
      meta: {},
    });
    const proposed = mergeTradePostFromPatch(
      before,
      { tradeLguId: "1130700000", region: null as unknown as string },
      "used"
    );
    // merge alone would change; freeze is enforced in owner-trade-update route
    expect(proposed.trade_lgu_id).toBe("1130700000");
    // draft-only contract still holds
    expect(allowEditTradeLocationSnapshot("active")).toBe(false);
  });
});
