import { describe, expect, it } from "vitest";
import {
  kwfMetaToDocument,
  parseKwfDetail,
  parseKwfSearchResults,
} from "@/lib/external-board-import/adapters/kwf-language-resource";
import {
  findCatalogSection,
  PHILIPPINES_SOURCE_CATALOG,
} from "@/lib/external-board-import/catalog/source-catalog";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";

describe("remaining-close inventory", () => {
  it("AVAILABLE 4 stay available only with adapter+url+critical proven", () => {
    for (const id of [
      "dot-central-visayas",
      "hello-cebu-posts",
      "ncca-talapamana-articles",
      "bi-advisory",
    ]) {
      const sec = findCatalogSection(id)?.section;
      expect(sec?.status).toBe("available");
      expect(sec?.adapterId).toBeTruthy();
      expect(sec?.canonicalUrl).toBeTruthy();
      const { adapter } = resolveExternalBoardAdapter(sec!.canonicalUrl!);
      expect(adapter?.id).toBe(sec!.adapterId);
    }
  });

  it("NCCA cultural property DB is REFERENCE not article; articles pagination proven", () => {
    expect(findCatalogSection("ncca-cultural-property-db")?.section.importKind).toBe("reference");
    expect(findCatalogSection("ncca-cultural-property-db")?.section.status).toBe("needs_check");
    expect(findCatalogSection("ncca-talapamana-articles")?.section.capabilities.pagination).toBe(
      "proven"
    );
  });

  it("NHCP splits article vs bibliographic index; no fake available", () => {
    expect(findCatalogSection("nhcp-featured-articles")?.section.importKind).toBe("article");
    expect(findCatalogSection("nhcp-local-history-index")?.section.importKind).toBe("reference");
    expect(findCatalogSection("nhcp-featured-articles")?.section.status).toBe("needs_check");
    expect(findCatalogSection("nhcp-local-history-index")?.section.status).toBe("needs_check");
  });

  it("KWF is LANGUAGE_RESOURCE with adapter but needs_check until live OPAC proof", () => {
    const kwf = findCatalogSection("kwf-language-resources")?.section;
    expect(kwf?.importKind).toBe("language_resource");
    expect(kwf?.adapterId).toBe("kwf-language-resource");
    expect(kwf?.status).toBe("needs_check");
    expect(kwf?.canonicalUrl).toContain("library.kwf.gov.ph");
  });

  it("PIA/PSA/Golf stay needs_check or reference — no CF bypass available", () => {
    expect(findCatalogSection("pia-regional-news")?.section.status).toBe("needs_check");
    expect(findCatalogSection("psa-press-releases")?.section.status).toBe("needs_check");
    expect(findCatalogSection("dot-golfing")?.section.importKind).toBe("reference");
    expect(findCatalogSection("dot-golfing")?.section.status).toBe("needs_check");
  });

  it("KWF metadata parser builds card body without full-text scrape fields", () => {
    const searchHtml = `
      <table><tr><td><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=2077">Diksiyunaryo ng pang-araw-araw</a> 2010</td></tr></table>
    `;
    const listed = parseKwfSearchResults(searchHtml, "https://library.kwf.gov.ph/");
    expect(listed[0]?.biblionumber).toBe("2077");
    const detailHtml = `
      <h1>Diksiyunaryo ng pang-araw-araw na English-Filipino.</h1>
      <span>Language:</span><span>Tagalog, English</span>
      <div class="record">Publication details: Manila : KWF, 2010. Summary: Everyday dictionary.</div>
    `;
    const meta = parseKwfDetail(
      detailHtml,
      "https://library.kwf.gov.ph/cgi-bin/koha/opac-detail.pl?biblionumber=2077"
    );
    expect(meta?.publicationYear).toBe("2010");
    const doc = kwfMetaToDocument(meta!);
    expect(doc.nodes.every((n) => n.type === "paragraph")).toBe(true);
    expect(doc.nodes.map((n) => (n.type === "paragraph" ? n.text : "")).join("\n")).toContain(
      "자료명:"
    );
    expect(doc.nodes.map((n) => (n.type === "paragraph" ? n.text : "")).join("\n")).not.toMatch(
      /full text|chapter 1/i
    );
  });

  it("no available section without adapter registry match", () => {
    for (const src of PHILIPPINES_SOURCE_CATALOG) {
      for (const sec of src.sections) {
        if (sec.status !== "available") continue;
        expect(sec.adapterId).toBeTruthy();
        expect(sec.canonicalUrl).toBeTruthy();
      }
    }
  });
});
