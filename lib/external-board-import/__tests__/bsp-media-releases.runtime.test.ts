import { describe, expect, it } from "vitest";
import { bspMediaReleasesAdapter } from "@/lib/external-board-import/adapters/bsp-media-releases";
import { findCatalogSection } from "@/lib/external-board-import/catalog/source-catalog";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";

describe("bsp live matrix", () => {
  it("English media releases: list/detail/date/author/body", async () => {
    const url = findCatalogSection("bsp-media-releases")!.section.canonicalUrl!;
    const { adapter } = resolveExternalBoardAdapter(url);
    expect(adapter?.id).toBe("bsp-media-releases");
    const items = await bspMediaReleasesAdapter.discoverArticles(
      { sourceUrl: url, siteKey: "bsp.gov.ph", boardKey: "/SitePages/MediaAndResearch/MediaList.aspx?TabId=1" },
      { limit: 3, pageFrom: 1, pageTo: 1 }
    );
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const it of items) {
      expect(it.title.length).toBeGreaterThan(5);
      expect(it.sourceAuthor).toBe("Bangko Sentral ng Pilipinas");
      expect(it.sourcePublishedAt).toBeTruthy();
      expect(it.sampleDocument?.nodes.length).toBeGreaterThan(0);
      expect(it.stableArticleIdentity).toMatch(/^stable:bsp-media-\d+$/);
    }
  }, 60000);

  it("Filipino press releases via PR Translations", async () => {
    const url = findCatalogSection("bsp-filipino-press-releases")!.section.canonicalUrl!;
    const items = await bspMediaReleasesAdapter.discoverArticles(
      { sourceUrl: url, siteKey: "bsp.gov.ph", boardKey: "/x?lang=fil" },
      { limit: 2, pageFrom: 1, pageTo: 1 }
    );
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]?.title.length).toBeGreaterThan(5);
    expect(items[0]?.sampleDocument?.nodes.length).toBeGreaterThan(0);
  }, 60000);
});
