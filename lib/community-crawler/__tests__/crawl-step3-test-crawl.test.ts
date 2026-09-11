import { describe, expect, it } from "vitest";
import { parseListPage, parseDetailPage } from "@/lib/community-crawler/adapters/generic-html";
import { parseGenericHtmlAdapterConfig } from "@/lib/community-crawler/adapters/generic-html-config";
import { htmlFragmentToCommunityMarkdown, normalizeTitleText } from "@/lib/community-crawler/core/html-to-community-markdown";
import {
  normalizePreviewAuthor,
  parseSourceDate,
  parseSourceViewCount,
  stableHash32,
} from "@/lib/community-crawler/core/normalize";
import { sanitizeHtmlFragment } from "@/lib/community-crawler/core/sanitize-html";
import { assertPublicHttpUrlForCrawlFetch, isPrivateOrReservedIp, resolveCrawlUrl } from "@/lib/community-crawler/core/safe-url";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CFG_PARSED = parseGenericHtmlAdapterConfig({
  listItemSelector: ".item",
  detailLinkSelector: "a.detail",
  titleSelector: "h1.title",
  contentSelector: ".body",
  authorSelector: ".author",
  dateSelector: ".date",
  viewSelector: ".views",
  imageSelector: ".body img",
});
if (!CFG_PARSED.ok) throw new Error(CFG_PARSED.error);
const CFG = CFG_PARSED.config;

describe("community crawler STEP3 core", () => {
  it("blocks private / localhost URLs", async () => {
    await expect(assertPublicHttpUrlForCrawlFetch("http://127.0.0.1/x")).rejects.toThrow();
    await expect(assertPublicHttpUrlForCrawlFetch("http://localhost/x")).rejects.toThrow();
    await expect(assertPublicHttpUrlForCrawlFetch("http://192.168.1.1/x")).rejects.toThrow();
    await expect(assertPublicHttpUrlForCrawlFetch("http://user:pass@example.com/x")).rejects.toThrow();
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
  });

  it("resolves relative detail URLs", () => {
    expect(resolveCrawlUrl("https://ex.com/board/", "./post/1")).toBe("https://ex.com/board/post/1");
    expect(resolveCrawlUrl("https://ex.com/board/list", "/post/2")).toBe("https://ex.com/post/2");
  });

  it("parses list page and dedupes", () => {
    const html = `
      <div class="item"><a class="detail" href="/p/1">a</a></div>
      <div class="item"><a class="detail" href="/p/1">dup</a></div>
      <div class="item"><a class="detail" href="/p/2">b</a></div>
    `;
    const { items } = parseListPage(html, "https://ex.com/list", CFG);
    expect(items.map((i) => i.detailUrl)).toEqual(["https://ex.com/p/1", "https://ex.com/p/2"]);
  });

  it("parses detail title/content and extracts images", () => {
    const html = `
      <h1 class="title">Hello &amp; World</h1>
      <div class="author">Alice</div>
      <div class="date">2024-01-02</div>
      <div class="views">1.2k</div>
      <div class="body"><p>Hi</p><img src="/img/a.jpg" data-src="/img/b.jpg"><script>evil()</script></div>
    `;
    const detail = parseDetailPage(html, "https://ex.com/p/1", CFG);
    expect(detail.title).toBe("Hello & World");
    expect(detail.contentMarkdown).toContain("Hi");
    expect(detail.contentMarkdown).not.toContain("evil");
    expect(detail.bodyImageUrls[0]).toMatch(/^https:\/\/ex\.com\/img\//);
    expect(detail.author).toBe("Alice");
  });

  it("sanitizes script/style/handlers", () => {
    const out = sanitizeHtmlFragment(
      `<p onclick="x()">ok</p><script>a()</script><style>.x{}</style><img src="javascript:alert(1)">`
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
  });

  it("converts HTML to community markdown with links/images", () => {
    const { content, imageUrls } = htmlFragmentToCommunityMarkdown(
      `<p>Hello</p><a href="/x">link</a><img src="/i.png">`,
      "https://ex.com/"
    );
    expect(content).toContain("Hello");
    expect(content).toContain("[link](https://ex.com/x)");
    expect(content).toContain("![image](https://ex.com/i.png)");
    expect(imageUrls).toEqual(["https://ex.com/i.png"]);
  });

  it("normalizes title empty rejection helper", () => {
    expect(normalizeTitleText("  ")).toBe("");
    expect(normalizeTitleText("  ok  ")).toBe("ok");
  });

  it("parses view/date and deterministic author pick", () => {
    expect(parseSourceViewCount("1,234")).toBe(1234);
    expect(parseSourceViewCount("1.2k")).toBe(1200);
    expect(parseSourceDate("2024.05.01")?.startsWith("2024-05-01")).toBe(true);
    const a = normalizePreviewAuthor({
      policy: "RANDOM_POOL",
      config: { random_pool: [{ display_name: "A" }, { display_name: "B" }] },
      sourceAuthor: null,
      stableKey: "board:post1",
    });
    const b = normalizePreviewAuthor({
      policy: "RANDOM_POOL",
      config: { random_pool: [{ display_name: "A" }, { display_name: "B" }] },
      sourceAuthor: null,
      stableKey: "board:post1",
    });
    expect(a.displayName).toBe(b.displayName);
    expect(stableHash32("x")).toBe(stableHash32("x"));
  });

  it("TEST API available; MANUAL route retired 410", () => {
    const root = process.cwd();
    const testRoute = readFileSync(
      join(root, "app/api/admin/community/crawl/boards/[id]/test/route.ts"),
      "utf8"
    );
    const manualRoute = readFileSync(
      join(root, "app/api/admin/community/crawl/boards/[id]/manual/route.ts"),
      "utf8"
    );
    expect(testRoute).toContain("runCommunityTestCrawl");
    expect(testRoute).not.toContain("status: 501");
    expect(manualRoute).toContain("MANUAL_CRAWL_RETIRED");
    expect(manualRoute).toContain("status: 410");
  });

  it("UI enables TEST preview + REAL crawl; removes obsolete MANUAL CTA", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/community/AdminCommunityExternalSourcesPage.tsx"),
      "utf8"
    );
    expect(ui).toContain("runTestCrawl");
    expect(ui).toContain("runRealCrawl");
    expect(ui).toContain("admin_community_crawl_test");
    expect(ui).toContain("admin_community_crawl_run_now");
    expect(ui).not.toContain("admin_community_crawl_manual");
    expect(ui).toContain("detailLinkSelector");
    expect(ui).not.toContain("mock crawl");
  });
});
