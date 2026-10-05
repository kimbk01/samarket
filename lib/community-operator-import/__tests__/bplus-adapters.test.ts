/**
 * Adapter tests on synthetic pages modelled on the real structures seen during the audit
 * (gnuboard `view-img` attachments + JS-rendered list → rss.php fallback, Tistory escaped feeds).
 * Network is stubbed; SSRF guard is stubbed to accept the fixture hosts.
 */
import * as cheerio from "cheerio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/remote-image-import-url", () => ({
  assertPublicHttpUrlForImageFetch: async (u: string) => new URL(u),
}));

import { adapterFor } from "@/lib/community-operator-import/adapters";
import { feedDirectoryLinks } from "@/lib/community-operator-import/detect";
import { assessArticleQuality } from "@/lib/community-operator-import/quality";
import type { RuntimeBoard, RuntimeSource } from "@/lib/community-operator-import/types";

type Route = { status?: number; body: string; type?: string };
let routes: Record<string, Route> = {};

beforeEach(() => {
  routes = {};
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    const r = routes[url];
    if (!r) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    const res = new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "text/html; charset=utf-8" } });
    Object.defineProperty(res, "url", { value: url });
    return res;
  });
});
afterEach(() => vi.unstubAllGlobals());

const gnu: RuntimeSource = {
  id: "gnu",
  displayName: "Gnu",
  baseUrl: "https://gnu.example.com/madang/",
  engine: "gnuboard",
  enabled: true,
  contentPolicy: "summary_link",
  adapterConfig: {},
  verification: "NOT_PROVEN",
};
const board = (engineKey: string): RuntimeBoard => ({
  sourceId: "gnu",
  boardId: engineKey,
  displayName: engineKey,
  shortLabel: engineKey,
  category: "x",
  engineKey,
  enabled: true,
  collectEnabled: false,
  boardKind: "editorial",
  defaultTopicId: null,
});

describe("gnuboard adapter", () => {
  it("falls back to bbs/rss.php when the skin renders the list client-side", async () => {
    routes["https://gnu.example.com/madang/bbs/board.php?bo_table=news"] = { body: "<html><body><div id='app'></div></body></html>" };
    routes["https://gnu.example.com/madang/bbs/rss.php?bo_table=news"] = {
      type: "application/rss+xml",
      body: `<rss version="2.0"><channel>
        <item><title>뉴스 하나</title><link>https://gnu.example.com/madang/bbs/board.php?bo_table=news&amp;wr_id=101</link><pubDate>Mon, 05 Oct 2026 10:00:00 +0800</pubDate><description>a</description></item>
        <item><title>뉴스 둘</title><link>https://gnu.example.com/madang/bbs/board.php?bo_table=news&amp;wr_id=100</link><description>b</description></item>
      </channel></rss>`,
    };
    const rows = await adapterFor("gnuboard").list({ source: gnu }, board("news"), 1);
    expect(rows.map((r) => r.articleKey)).toEqual(["101", "100"]);
    expect(rows[0]!.detailUrl).toContain("wr_id=101");
  });

  it("reads attachment images (view-img) before the body and keeps text", async () => {
    const url = "https://gnu.example.com/madang/bbs/board.php?bo_table=info&wr_id=71";
    routes[url] = {
      body: `<html><head><meta property="og:title" content="오카다 마닐라 후기"></head><body>
        <div id="bo_v_info"><span class="sv_member">작성자</span><strong class="if_date">26-10-05 12:30</strong></div>
        <div class="view-img">
          <a class="view_image" href="../bbs/view_image.php?fn=%2Fmadang%2Fdata%2Ffile%2Finfo%2Fbig1.jpg"><img src="/madang/data/file/info/thumb-big1_600x400.jpg"></a>
          <a class="view_image" href="../bbs/view_image.php?fn=%2Fmadang%2Fdata%2Ffile%2Finfo%2Fbig2.jpg"><img src="/madang/data/file/info/thumb-big2_600x400.jpg"></a>
        </div>
        <div class="view-content"><p>리조트 방문 후기입니다.</p><p>두 번째 문단.</p></div>
        <div id="bo_v_share">공유</div></body></html>`,
    };
    const a = await adapterFor("gnuboard").detail({ source: gnu }, board("info"), { articleKey: "71", detailUrl: url, title: "x" });
    const imgs = a.orderedContentBlocks.filter((b) => b.type === "image").map((b) => (b as { url: string }).url);
    expect(imgs).toEqual(["https://gnu.example.com/madang/data/file/info/big1.jpg", "https://gnu.example.com/madang/data/file/info/big2.jpg"]);
    expect(a.orderedContentBlocks.some((b) => b.type === "paragraph" && b.text.includes("후기"))).toBe(true);
    expect(JSON.stringify(a.orderedContentBlocks)).not.toContain("공유");
    expect(a.title).toBe("오카다 마닐라 후기");
    expect(a.extraction?.bodySource).toBe("div.view-content");
    expect(assessArticleQuality(a).verdict).toBe("FULL");
  });
});

describe("RSS directory page (GMA-style)", () => {
  it("turns each same-site feed link into a board; ignores other sites and pages", () => {
    const html = `<html><body>
      <a href="https://data.news.example.com/rss/news/nation/feed.xml">Nation</a>
      <a href="https://data.news.example.com/rss/news/metro/feed.xml">Metro</a>
      <a href="https://data.news.example.com/rss/sports/basketball/feed.xml">Basketball</a>
      <a href="https://www.news.example.com/news/">News home</a>
      <a href="https://other.example.org/rss.xml">Other site</a></body></html>`;
    const feeds = feedDirectoryLinks(cheerio.load(html), "https://www.news.example.com/news/rss/");
    expect(feeds.map((f) => f.title)).toEqual(["Nation", "Metro", "Basketball"]);
  });

  it("a page with one or two feed links is not a directory", () => {
    const html = `<a href="/rss.xml">RSS</a><a href="/feed/">Feed</a>`;
    expect(feedDirectoryLinks(cheerio.load(html), "https://blog.example.com/")).toEqual([]);
  });
});

describe("structure change (REPORT L criterion 6)", () => {
  const url = "https://gnu.example.com/madang/bbs/board.php?bo_table=info&wr_id=72";
  const page = `<html><head><meta property="og:title" content="세부 골프 후기"></head><body>
    <div id="bo_v_info"><strong class="if_date">26-10-05 12:30</strong></div>
    <div class="view-content"><p>세부 골프장 라운딩 후기입니다. 그린 상태가 좋았습니다.</p></div></body></html>`;

  it("configured body selector that matches → no structure warning", async () => {
    routes[url] = { body: page };
    const src = { ...gnu, adapterConfig: { bodySelectors: ["div.view-content"] } };
    const a = await adapterFor("gnuboard").detail({ source: src }, board("info"), { articleKey: "72", detailUrl: url, title: "x" });
    expect(a.extraction?.warnings).not.toContain("body_selector_changed");
    expect(assessArticleQuality(a).reasons).not.toContain("structure_changed");
  });

  it("configured body selector that no longer matches → 구조 변경 의심 (PARTIAL), body still extracted", async () => {
    routes[url] = { body: page };
    const src = { ...gnu, adapterConfig: { bodySelectors: ["#old-layout-body"] } };
    const a = await adapterFor("gnuboard").detail({ source: src }, board("info"), { articleKey: "72", detailUrl: url, title: "x" });
    const q = assessArticleQuality(a);
    expect(a.extraction?.warnings).toContain("body_selector_changed");
    expect(q.verdict).toBe("PARTIAL");
    expect(q.reasons).toContain("structure_changed");
    expect(a.orderedContentBlocks.some((b) => b.type === "paragraph" && b.text.includes("라운딩"))).toBe(true);
  });
});

describe("rss adapter", () => {
  const rss: RuntimeSource = { ...gnu, id: "blog", baseUrl: "https://blog.example.com", engine: "rss_atom" };
  const feedBoard: RuntimeBoard = { ...board("feed"), sourceId: "blog", boardId: "feed", engineKey: "https://blog.example.com/rss" };
  const feed = `<rss version="2.0"><channel><item><title>세부 맛집</title><link>https://blog.example.com/55555</link>
    <description>&lt;p&gt;피드 본문&lt;/p&gt;&lt;img src="https://blog.example.com/f.jpg"&gt;</description>
    <pubDate>Mon, 05 Oct 2026 10:00:00 +0900</pubDate></item></channel></rss>`;

  it("uses the article page body when it is reachable", async () => {
    routes["https://blog.example.com/rss"] = { body: feed, type: "application/rss+xml" };
    routes["https://blog.example.com/55555"] = {
      body: `<html><body><div class="tt_article_useless_p_margin"><p>페이지 본문 전체입니다.</p><img src="https://blog.example.com/p1.jpg"><img src="https://blog.example.com/p2.jpg"></div></body></html>`,
    };
    const rows = await adapterFor("rss_atom").list({ source: rss }, feedBoard, 1);
    expect(rows[0]!.articleKey).toBe("55555");
    const a = await adapterFor("rss_atom").detail({ source: rss }, feedBoard, { articleKey: "55555", detailUrl: rows[0]!.detailUrl, title: rows[0]!.title });
    expect(a.extraction?.usedFeedFallback).toBe(false);
    expect(a.orderedContentBlocks.filter((b) => b.type === "image")).toHaveLength(2);
  });

  it("falls back to the decoded feed body (PARTIAL) when the page is blocked", async () => {
    routes["https://blog.example.com/rss"] = { body: feed, type: "application/rss+xml" };
    routes["https://blog.example.com/55555"] = { status: 403, body: "forbidden" };
    const a = await adapterFor("rss_atom").detail({ source: rss }, feedBoard, { articleKey: "55555", detailUrl: "https://blog.example.com/55555", title: "세부 맛집" });
    expect(a.extraction?.usedFeedFallback).toBe(true);
    expect(a.orderedContentBlocks.some((b) => b.type === "paragraph" && b.text.includes("피드 본문"))).toBe(true);
    expect(assessArticleQuality(a).verdict).toBe("PARTIAL");
  });
});

describe("wordpress thumbnails", () => {
  it("falls back to the first content image when a post has no featured media", async () => {
    const wp: RuntimeSource = { ...gnu, id: "wp", baseUrl: "https://wp.example.com/", engine: "wordpress_rest" };
    routes["https://wp.example.com/wp-json/wp/v2/posts?per_page=20&page=1&_embed=1"] = {
      type: "application/json",
      body: JSON.stringify([
        { id: 1, link: "https://wp.example.com/a/", title: { rendered: "A" }, content: { rendered: '<p>x</p><img src="https://wp.example.com/u/a.jpg">' } },
        { id: 2, link: "https://wp.example.com/b/", title: { rendered: "B" }, _embedded: { "wp:featuredmedia": [{ source_url: "https://wp.example.com/u/f.jpg" }] }, content: { rendered: "" } },
      ]),
    };
    const rows = await adapterFor("wordpress_rest").list({ source: wp }, { ...board("all"), engineKey: "all" }, 1);
    expect(rows.map((r) => r.thumbnailUrl)).toEqual(["https://wp.example.com/u/a.jpg", "https://wp.example.com/u/f.jpg"]);
  });
});
