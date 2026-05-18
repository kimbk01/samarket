import { describe, expect, it } from "vitest";
import { resolveStoreBrowseListHref } from "@/lib/stores/resolve-store-browse-list-href";

describe("resolveStoreBrowseListHref", () => {
  it("uses store category slug when present", () => {
    expect(
      resolveStoreBrowseListHref({
        storeSlug: "aa11",
        storeCategorySlug: "mart",
        businessType: "식당 · 한식",
      })
    ).toBe("/stores/browse/mart?sub=all");
  });

  it("parses business_type primary display name", () => {
    expect(
      resolveStoreBrowseListHref({
        storeSlug: "x",
        businessType: "공구류 · 전동공구",
      })
    ).toBe("/stores/browse/hardware?sub=all");
  });

  it("defaults to restaurant when unknown", () => {
    expect(resolveStoreBrowseListHref({ storeSlug: "x" })).toBe(
      "/stores/browse/restaurant?sub=all"
    );
  });
});
