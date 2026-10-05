/**
 * Adapter tests on synthetic pages modelled on the real structures seen during the audit
 * (gnuboard `view-img` attachments + JS-rendered list → rss.php fallback, Tistory escaped feeds).
 * Network is stubbed; SSRF guard is stubbed to accept the fixture hosts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/remote-image-import-url", () => ({
  assertPublicHttpUrlForImageFetch: async (u: string) => new URL(u),
}));

import { adapterFor } from "@/lib/community-operator-import/adapters";
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

describe("rss adapter", () => {
  const rss: RuntimeSource = { ...gnu, id: "blog", baseUrl: "https://blog.example.com", engine: "rss_atom" };
  const feedBoard: RuntimeBoard = { ...board("feed"), sourceId: "blog", boardId: "feed", engineKey: "https://blog.example.com/rss" };
  const feed = `<rss version="2.0"><channel><item><title>세부 맛집</title><link>https://blog.example.com/55</link>
    <description>&lt;p&gt;피드 본문&lt;/p&gt;&lt;img src="https://blog.example.com/f.jpg"&gt;</description>
    <pubDate>Mon, 05 Oct 2026 10:00:00 +0900</pubDate></item></channel></rss>`;

  it("uses the article page body when it is reachable", async () => {
    routes["https://blog.example.com/rss"] = { body: feed, type: "application/rss+xml" };
    routes["https://blog.example.com/55"] = {
      body: `<html><body><div class="tt_article_useless_p_margin"><p>페이지 본문 전체입니다.</p><img src="https://blog.example.com/p1.jpg"><img src="https://blog.example.com/p2.jpg"></div></body></html>`,
    };
    const rows = await adapterFor("rss_atom").list({ source: rss }, feedBoard, 1);
    expect(rows[0]!.articleKey).toBe("55");
    const a = await adapterFor("rss_atom").detail({ source: rss }, feedBoard, { articleKey: "55", detailUrl: rows[0]!.detailUrl, title: rows[0]!.title });
    expect(a.extraction?.usedFeedFallback).toBe(false);
    expect(a.orderedContentBlocks.filter((b) => b.type === "image")).toHaveLength(2);
  });

  it("falls back to the decoded feed body (PARTIAL) when the page is blocked", async () => {
    routes["https://blog.example.com/rss"] = { body: feed, type: "application/rss+xml" };
    routes["https://blog.example.com/55"] = { status: 403, body: "forbidden" };
    const a = await adapterFor("rss_atom").detail({ source: rss }, feedBoard, { articleKey: "55", detailUrl: "https://blog.example.com/55", title: "세부 맛집" });
    expect(a.extraction?.usedFeedFallback).toBe(true);
    expect(a.orderedContentBlocks.some((b) => b.type === "paragraph" && b.text.includes("피드 본문"))).toBe(true);
    expect(assessArticleQuality(a).verdict).toBe("PARTIAL");
  });
});
