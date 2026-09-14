import { describe, expect, it } from "vitest";
import { parseWordpressPostJson } from "@/lib/community-operator-import/wordpress-rest";
import {
  isVerifiedSourceBoard,
  listVerifiedSources,
  NON_OPERATIONAL_SOURCES,
} from "@/lib/community-operator-import/registry";

describe("community-operator-import multi-source registry", () => {
  it("exposes verified multi-engine sources and keeps blocked off operational list", () => {
    const ids = listVerifiedSources().map((s) => s.id).sort();
    expect(ids).toContain("philsamo");
    expect(ids).toContain("hellocebuph");
    expect(ids).toContain("immigration");
    expect(ids).toContain("philstar");
    expect(ids).toContain("officialgazette");
    expect(ids).toContain("rappler");
    expect(ids).toContain("inquirer");
    expect(ids).toContain("dof");
    expect(ids).toContain("cesimo");
    expect(ids).toContain("danielinclarkphp");
    expect(ids).toContain("cebulife");
    expect(ids).toContain("cebuevan");
    expect(ids).not.toContain("philgo");
    expect(ids).not.toContain("tripstore");
    expect(ids).not.toContain("midnightmanila");
    expect(ids).not.toContain("manilaseoul");
    expect(NON_OPERATIONAL_SOURCES.some((s) => s.id === "philgo")).toBe(true);
    expect(NON_OPERATIONAL_SOURCES.some((s) => s.id === "tripstore")).toBe(true);
    expect(NON_OPERATIONAL_SOURCES.some((s) => s.id === "philmen_seo_cluster")).toBe(true);
    expect(NON_OPERATIONAL_SOURCES.some((s) => s.id === "manilaseoul")).toBe(true);
    expect(isVerifiedSourceBoard("immigration", "advisory")).toBe(true);
    expect(isVerifiedSourceBoard("philstar", "headlines")).toBe(true);
    expect(isVerifiedSourceBoard("cesimo", "feed")).toBe(true);
    expect(isVerifiedSourceBoard("cebulife", "feed")).toBe(true);
    expect(isVerifiedSourceBoard("cebuevan", "feed")).toBe(true);
  });

  it("normalizes WordPress JSON into ordered blocks with images", () => {
    const article = parseWordpressPostJson(
      {
        id: 2303,
        date: "2026-01-09T01:26:45",
        link: "https://hellocebuph.com/sample/",
        title: { rendered: "Cebu Life &amp; Leisure" },
        content: {
          rendered:
            "<p>Hello <strong>Cebu</strong></p><figure><img src=\"https://hellocebuph.com/wp-content/uploads/a.jpg\" alt=\"a\"/></figure><p>More text</p>",
        },
        _embedded: {
          author: [{ name: "Maria" }],
          "wp:featuredmedia": [{ source_url: "https://hellocebuph.com/wp-content/uploads/feat.jpg" }],
        },
      },
      "hellocebuph",
      "destinations",
      "https://hellocebuph.com",
    );
    expect(article.sourceSite).toBe("hellocebuph");
    expect(article.sourceBoard).toBe("destinations");
    expect(article.title).toContain("Cebu Life");
    expect(article.author).toBe("Maria");
    expect(article.orderedContentBlocks.some((b) => b.type === "paragraph")).toBe(true);
    expect(article.orderedContentBlocks.filter((b) => b.type === "image").length).toBeGreaterThanOrEqual(1);
  });
});
