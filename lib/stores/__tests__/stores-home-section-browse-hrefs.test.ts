import { describe, expect, it } from "vitest";
import { storesBrowsePathWithSort } from "@/components/stores/browse/stores-browse-paths";
import {
  STORES_HOME_SECTION_BROWSE,
  parseStoreBrowseSortParam,
} from "@/lib/stores/stores-home-section-browse-hrefs";

describe("stores-home-section-browse-hrefs", () => {
  it("maps order now to fast sort", () => {
    expect(STORES_HOME_SECTION_BROWSE.orderNow()).toContain("sort=fast");
    expect(STORES_HOME_SECTION_BROWSE.orderNow()).toContain("sub=all");
  });

  it("maps nearby to distance sort", () => {
    expect(STORES_HOME_SECTION_BROWSE.nearby()).toContain("sort=distance");
  });

  it("maps top rated to rating sort", () => {
    expect(STORES_HOME_SECTION_BROWSE.topRated()).toContain("sort=rating");
  });

  it("parseStoreBrowseSortParam rejects unknown", () => {
    expect(parseStoreBrowseSortParam("rating")).toBe("rating");
    expect(parseStoreBrowseSortParam("bogus")).toBe("default");
  });
});

describe("storesBrowsePathWithSort", () => {
  it("omits sort when default", () => {
    const href = storesBrowsePathWithSort("restaurant", { sub: "all", sort: "default" });
    expect(href).toBe("/stores/browse/restaurant?sub=all");
    expect(href).not.toContain("sort=");
  });
});
