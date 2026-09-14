import { describe, expect, it } from "vitest";
import {
  countAvailableCatalogSections,
  filterCatalogByTopicGroup,
  findCatalogSection,
  PHILIPPINES_SOURCE_CATALOG,
} from "@/lib/external-board-import/catalog/source-catalog";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";

describe("CUT L diversity inventory (catalog-level)", () => {
  it("minimum available categories after proven adapters", () => {
    expect(findCatalogSection("dot-central-visayas")?.section.status).toBe("available");
    expect(findCatalogSection("hello-cebu-posts")?.section.status).toBe("available");
    expect(findCatalogSection("ncca-talapamana-articles")?.section.status).toBe("available");
    expect(findCatalogSection("bi-advisory")?.section.status).toBe("available");
    expect(findCatalogSection("dot-golfing")?.section.importKind).toBe("reference");
    expect(findCatalogSection("dot-golfing")?.section.status).toBe("needs_check");
    // Cloudflare-blocked in this environment — must stay needs_check
    expect(findCatalogSection("pia-regional-news")?.section.status).toBe("needs_check");
    expect(findCatalogSection("nhcp-featured-articles")?.section.status).toBe("needs_check");
    expect(findCatalogSection("psa-press-releases")?.section.status).toBe("needs_check");
    expect(findCatalogSection("kwf-language-resources")?.section.importKind).toBe("language_resource");
    expect(countAvailableCatalogSections()).toBeGreaterThanOrEqual(4);

    for (const group of ["travel", "culture", "visa", "expat", "economy"] as const) {
      const sources = filterCatalogByTopicGroup(group);
      expect(sources.some((s) => s.sections.some((sec) => sec.status === "available"))).toBe(true);
    }

    for (const src of PHILIPPINES_SOURCE_CATALOG) {
      for (const sec of src.sections) {
        if (sec.status !== "available" || !sec.canonicalUrl) continue;
        const { adapter } = resolveExternalBoardAdapter(sec.canonicalUrl);
        expect(adapter?.id).toBe(sec.adapterId);
      }
    }
  });
});
