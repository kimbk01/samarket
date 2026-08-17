import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types/product";
import {
  collectActivePromotionTargetIds,
  filterMyProductsByListingAxis,
  parseMyProductListingFilterKey,
} from "@/lib/products/my-product-listing-filter";

function product(partial: Partial<Product> & { id: string }): Product {
  return {
    title: partial.title ?? partial.id,
    price: 1,
    location: "",
    createdAt: "",
    status: "active",
    thumbnail: "",
    likesCount: 0,
    chatCount: 0,
    isBoosted: false,
    ...partial,
  };
}

const plainActive = product({ id: "plain" });
const inquiry = product({ id: "inq", status: "active", sellerListingState: "inquiry" });
const negotiating = product({
  id: "neg",
  status: "active",
  sellerListingState: "negotiating",
});
const reserved = product({ id: "res", status: "reserved", sellerListingState: "reserved" });
const sold = product({ id: "sold", status: "sold", sellerListingState: "completed" });
const hidden = product({ id: "hid", status: "hidden", sellerListingState: "inquiry" });
const all = [plainActive, inquiry, negotiating, reserved, sold, hidden];
const promoIds = new Set(["plain", "res", "sold", "hid", "missing"]);

describe("parseMyProductListingFilterKey", () => {
  it("aliases reserved to active and does not treat promoted as a listing status", () => {
    expect(parseMyProductListingFilterKey("reserved")).toBe("active");
    expect(parseMyProductListingFilterKey("active")).toBe("active");
    expect(parseMyProductListingFilterKey("sold")).toBe("sold");
    expect(parseMyProductListingFilterKey("hidden")).toBe("hidden");
    expect(parseMyProductListingFilterKey("promoted")).toBe("all");
    expect(parseMyProductListingFilterKey(null)).toBe("all");
  });
});

describe("filterMyProductsByListingAxis", () => {
  it("ACTIVE includes plain active, inquiry, negotiating, reserved and excludes sold/hidden", () => {
    const ids = filterMyProductsByListingAxis(all, "active").map((p) => p.id);
    expect(ids).toEqual(["plain", "inq", "neg", "res"]);
  });

  it("SOLD includes completed/sold and excludes reserved", () => {
    const ids = filterMyProductsByListingAxis(all, "sold").map((p) => p.id);
    expect(ids).toEqual(["sold"]);
  });

  it("all excludes hidden; hidden filter is owner-only", () => {
    expect(filterMyProductsByListingAxis(all, "all").map((p) => p.id)).toEqual([
      "plain",
      "inq",
      "neg",
      "res",
      "sold",
    ]);
    expect(filterMyProductsByListingAxis(all, "hidden").map((p) => p.id)).toEqual(["hid"]);
  });

  it("active + promoted ON keeps only active promoted listings", () => {
    const ids = filterMyProductsByListingAxis(all, "active", true, promoIds).map((p) => p.id);
    expect(ids).toEqual(["plain", "res"]);
  });

  it("active + promoted OFF ignores promotion membership", () => {
    const ids = filterMyProductsByListingAxis(all, "active", false, promoIds).map((p) => p.id);
    expect(ids).toEqual(["plain", "inq", "neg", "res"]);
  });

  it("sold + promoted ON is intersection only and may be empty", () => {
    expect(filterMyProductsByListingAxis(all, "sold", true, promoIds).map((p) => p.id)).toEqual([
      "sold",
    ]);
    expect(filterMyProductsByListingAxis(all, "sold", true, new Set(["plain"]))).toEqual([]);
  });

  it("promotedOnly does not change the base listing axis", () => {
    const activeOff = filterMyProductsByListingAxis(all, "active", false, promoIds).map((p) => p.id);
    const activeOn = filterMyProductsByListingAxis(all, "active", true, promoIds).map((p) => p.id);
    const soldOn = filterMyProductsByListingAxis(all, "sold", true, promoIds).map((p) => p.id);
    expect(activeOn.every((id) => activeOff.includes(id))).toBe(true);
    expect(activeOn).not.toContain("sold");
    expect(activeOn).not.toContain("hid");
    expect(soldOn).toEqual(["sold"]);
    expect(parseMyProductListingFilterKey("promoted")).toBe("all");
  });
});

describe("collectActivePromotionTargetIds", () => {
  it("keeps in-window active product entitlements only", () => {
    const now = Date.now();
    const ids = collectActivePromotionTargetIds([
      {
        targetId: "a",
        targetType: "product",
        orderStatus: "active",
        startAt: new Date(now - 1000).toISOString(),
        endAt: new Date(now + 60_000).toISOString(),
      },
      {
        targetId: "b",
        targetType: "product",
        orderStatus: "expired",
        startAt: new Date(now - 1000).toISOString(),
        endAt: new Date(now + 60_000).toISOString(),
      },
      {
        targetId: "c",
        targetType: "community_post",
        orderStatus: "active",
        startAt: new Date(now - 1000).toISOString(),
        endAt: new Date(now + 60_000).toISOString(),
      },
    ]);
    expect([...ids]).toEqual(["a"]);
  });
});
