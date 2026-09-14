/**
 * DIVERSITY CLOSE — alternate authorities without lowering available gate.
 */
import { describe, expect, it } from "vitest";
import { listExternalBoardAdapters } from "@/lib/external-board-import/adapters/registry";
import {
  findCatalogSection,
  filterCatalogByTopicGroup,
  PHILIPPINES_SOURCE_CATALOG,
} from "@/lib/external-board-import/catalog/source-catalog";

describe("diversity close inventory", () => {
  it("keeps prior available four; does not wait on blocked primaries", () => {
    expect(findCatalogSection("dot-central-visayas")?.section.status).toBe("available");
    expect(findCatalogSection("hello-cebu-posts")?.section.status).toBe("available");
    expect(findCatalogSection("ncca-talapamana-articles")?.section.status).toBe("available");
    expect(findCatalogSection("bi-advisory")?.section.status).toBe("available");
    expect(findCatalogSection("pia-regional-news")?.section.status).toBe("needs_check");
    expect(findCatalogSection("nhcp-featured-articles")?.section.status).toBe("needs_check");
    expect(findCatalogSection("psa-press-releases")?.section.status).toBe("needs_check");
    expect(findCatalogSection("kwf-language-resources")?.section.status).toBe("needs_check");
  });

  it("BSP is separate economy authority: HTML media available, PEU reference", () => {
    expect(findCatalogSection("bsp-media-releases")?.section.status).toBe("available");
    expect(findCatalogSection("bsp-filipino-press-releases")?.section.status).toBe("available");
    expect(findCatalogSection("bsp-philippine-economic-updates")?.section.importKind).toBe("reference");
    expect(findCatalogSection("bsp-philippine-economic-updates")?.section.status).toBe("needs_check");
    expect(listExternalBoardAdapters().some((a) => a.id === "bsp-media-releases")).toBe(true);
    const economy = filterCatalogByTopicGroup("economy");
    expect(economy.some((s) => s.sourceId === "bsp")).toBe(true);
    expect(economy.some((s) => s.sourceId === "psa")).toBe(true);
  });

  it("golf: DOT reference + PIA/PNA candidates stay needs_check (no fake available)", () => {
    expect(findCatalogSection("dot-golfing")?.section.importKind).toBe("reference");
    expect(findCatalogSection("pia-golf-tourism")?.section.status).toBe("needs_check");
    expect(findCatalogSection("pna-golf-tourism")?.section.status).toBe("needs_check");
    expect(findCatalogSection("pna-golf-tourism")?.section.adapterId).toBeNull();
  });

  it("language: KWF resource ≠ PIA language articles; both needs_check until live", () => {
    expect(findCatalogSection("kwf-language-resources")?.section.importKind).toBe("language_resource");
    expect(findCatalogSection("pia-kwf-language-articles")?.section.importKind).toBe("article");
    expect(findCatalogSection("pia-kwf-language-articles")?.section.status).toBe("needs_check");
  });

  it("catalog still derives available only from proven matrix + adapter + url", () => {
    const available = PHILIPPINES_SOURCE_CATALOG.flatMap((s) =>
      s.sections.filter((sec) => sec.status === "available")
    );
    for (const sec of available) {
      expect(sec.adapterId).toBeTruthy();
      expect(sec.canonicalUrl).toBeTruthy();
    }
  });
});
