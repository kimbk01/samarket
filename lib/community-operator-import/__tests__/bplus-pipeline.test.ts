import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { classifyBoardKind, feedItemsToRows, parseFeed, parseSourceDate } from "@/lib/community-operator-import/adapters/common";
import { rankItemTemplates, urlTemplate } from "@/lib/community-operator-import/adapters/html";
import { defaultOperatorDraftEdit } from "@/lib/community-operator-import/draft-apply";
import { nextInboxStatus } from "@/lib/community-operator-import/inbox-store";
import { carryEditToArticle } from "@/lib/community-operator-import/draft-store";
import { blockStats, htmlToBlocks, selectBody, unthumbnailUrl } from "@/lib/community-operator-import/normalize";
import { mapPublishRpcError } from "@/lib/community-operator-import/publish-errors";
import { buildPublishContent, effectivePolicy, leadSummary } from "@/lib/community-operator-import/publish-content";
import { assessArticleQuality } from "@/lib/community-operator-import/quality";
import { isPathAllowed, parseRobots } from "@/lib/community-operator-import/robots";
import { applyRulesToText, type ImportRule, rulesFor, validateRulePattern } from "@/lib/community-operator-import/rules";
import { dueBoards, isBoardDue } from "@/lib/community-operator-import/scheduler";
import type { ManagedBoard, ManagedSource } from "@/lib/community-operator-import/source-store";
import type { OperatorContentBlock, OperatorNormalizedArticle } from "@/lib/community-operator-import/types";
import { combineBoardVerdicts } from "@/lib/community-operator-import/verify";

function article(blocks: OperatorContentBlock[], extra: Partial<OperatorNormalizedArticle> = {}): OperatorNormalizedArticle {
  return {
    sourceSite: "s",
    sourceBoard: "b",
    sourceBoardLabel: "B",
    canonicalUrl: "https://example.com/post/1",
    sourceArticleKey: "1",
    title: "제목",
    author: "글쓴이",
    sourcePublishedDate: "2026-10-01T01:00:00.000Z",
    orderedContentBlocks: blocks,
    ...extra,
  };
}

describe("normalize", () => {
  it("keeps text and nested lazy images in reading order and decodes entities once", () => {
    const html = `
      <div><p>첫 문단&nbsp;입니다 &amp; 끝</p>
        <div><span><img data-src="/img/a.jpg" src="/img/blank.gif"></span></div>
        <script>bad()</script><nav>메뉴</nav>
        <p>둘째 문단</p><figure><img srcset="/img/b-300.jpg 300w, /img/b-1200.jpg 1200w"></figure></div>`;
    const blocks = htmlToBlocks(html, { baseUrl: "https://ex.com/post/1" });
    const types = blocks.map((b) => b.type);
    expect(types).toEqual(["paragraph", "image", "paragraph", "image"]);
    expect((blocks[0] as { text: string }).text).toBe("첫 문단 입니다 & 끝");
    expect((blocks[1] as { url: string }).url).toBe("https://ex.com/img/a.jpg");
    expect((blocks[3] as { url: string }).url).toBe("https://ex.com/img/b-1200.jpg");
    expect(blockStats(blocks).entityLeak).toBe(false);
    expect(JSON.stringify(blocks)).not.toContain("메뉴");
  });

  it("selectBody prefers configured selector and falls back to text density", () => {
    const $ = cheerio.load(
      `<body><div class="menu"><a>a</a><a>b</a></div><div id="main"><p>${"본문 내용입니다. ".repeat(20)}</p><p>둘째</p></div></body>`,
    );
    expect(selectBody($, ["#nope", "#main"])?.selector).toBe("#main");
    const auto = selectBody($, ["#nope"]);
    expect(auto?.selector).toBe("auto:density");
    expect(auto?.html).toContain("본문 내용입니다");
  });

  it("unthumbnails gnuboard thumbs", () => {
    expect(unthumbnailUrl("https://x.com/data/file/b/thumb-abc_300x200.jpg")).toBe("https://x.com/data/file/b/abc.jpg");
  });
});

describe("feeds", () => {
  it("decodes entity-escaped HTML bodies (Tistory style) and reads media thumbnails", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
      <item><title>세부 여행 &amp; 맛집</title><link>https://blog.example.com/12345</link>
        <description>&lt;p&gt;안녕하세요&amp;nbsp;세부입니다&lt;/p&gt;&lt;img src="https://blog.example.com/a.jpg"&gt;</description>
        <pubDate>Mon, 05 Oct 2026 10:00:00 +0900</pubDate>
        <media:thumbnail url="https://blog.example.com/t.jpg"/></item>
    </channel></rss>`;
    const { items, isFeed } = parseFeed(xml);
    expect(isFeed).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("세부 여행 & 맛집");
    expect(items[0]!.contentHtml).toContain("<img");
    expect(items[0]!.summary).toContain("안녕하세요");
    expect(items[0]!.summary).not.toContain("&nbsp;");
    const rows = feedItemsToRows(items, "https://blog.example.com/");
    expect(rows[0]!.articleKey).toBe("12345");
    expect(rows[0]!.thumbnailUrl).toBeTruthy();
    expect(rows[0]!.sourcePublishedDate).toBe("2026-10-05T01:00:00.000Z");
  });

  it("parses Atom", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A</title><link rel="alternate" href="https://a.com/x-55555"/>
      <updated>2026-10-01T00:00:00Z</updated><summary>s</summary></entry></feed>`;
    const { items } = parseFeed(xml);
    expect(items[0]!.link).toBe("https://a.com/x-55555");
  });

  it("parses loose dates as Manila time", () => {
    expect(parseSourceDate("2026.10.05 12:30")).toBe("2026-10-05T04:30:00.000Z");
    expect(parseSourceDate("not a date")).toBeNull();
  });
});

describe("board discovery helpers", () => {
  it("classifies board kinds safely", () => {
    expect(classifyBoardKind("자유게시판")).toBe("community");
    expect(classifyBoardKind("질문과 답변")).toBe("member_qa");
    expect(classifyBoardKind("업소록")).toBe("directory");
    expect(classifyBoardKind("여행 정보")).toBe("editorial");
  });

  it("ranks article link templates above menu links", () => {
    const items = Array.from({ length: 8 }, (_, i) => `<li><a href="/news/article.html?no=${1000 + i}">필리핀 뉴스 제목 ${i} 입니다 길게</a></li>`).join("");
    const html = `<header><a href="/menu.html?id=111">홈</a><a href="/menu.html?id=222">뉴스</a><a href="/menu.html?id=333">정보</a></header><ul>${items}</ul>`;
    const ranked = rankItemTemplates(html, "https://news.example.com/list");
    expect(ranked[0]!.template).toBe("/news/article.html?no");
    expect(urlTemplate("https://a.com/view/12345")).toBe("/view/#?");
  });
});

describe("robots", () => {
  it("applies longest match with allow overrides", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /bbs/\nAllow: /bbs/board.php\n\nUser-agent: GPTBot\nDisallow: /");
    expect(isPathAllowed(groups, "/bbs/board.php?bo_table=free")).toBe(true);
    expect(isPathAllowed(groups, "/bbs/login.php")).toBe(false);
    expect(isPathAllowed(groups, "/", "gptbot")).toBe(false);
    expect(isPathAllowed([], "/anything")).toBe(true);
  });
});

describe("quality gate", () => {
  it("FAILED without body, PARTIAL when images were lost, FULL for a short text notice", () => {
    expect(assessArticleQuality(article([])).verdict).toBe("FAILED");
    const partial = assessArticleQuality(
      article([{ type: "paragraph", text: "본문" }], {
        extraction: { bodySource: "x", sourceImageCount: 4, ogImage: null, usedFeedFallback: false, warnings: [] },
      }),
    );
    expect(partial.verdict).toBe("PARTIAL");
    expect(partial.reasons).toContain("images_missing");
    expect(assessArticleQuality(article([{ type: "paragraph", text: "짧은 공지" }])).verdict).toBe("FULL");
  });
});

describe("inbox status transitions", () => {
  it("never loses operator state on re-collection", () => {
    expect(nextInboxStatus(null, "a").status).toBe("new");
    expect(nextInboxStatus({ status: "published", fingerprint: "a", publishedPostId: "p" }, "a").status).toBe("published");
    expect(nextInboxStatus({ status: "published", fingerprint: "a", publishedPostId: "p" }, "b")).toEqual({ status: "source_updated", changed: true });
    expect(nextInboxStatus({ status: "draft", fingerprint: "a", publishedPostId: null }, "a").status).toBe("draft");
    expect(nextInboxStatus({ status: "hidden", fingerprint: "a", publishedPostId: null }, "b").status).toBe("hidden");
    expect(nextInboxStatus({ status: "failed", fingerprint: "a", publishedPostId: null }, "a").status).toBe("new");
  });
});

describe("content policy", () => {
  const blocks: OperatorContentBlock[] = [
    { type: "image", url: "https://e.com/1.jpg", displaySrc: null, alt: null, caption: null },
    { type: "paragraph", text: "첫 문장입니다. 둘째 문장입니다." },
    { type: "image", url: "https://e.com/2.jpg", displaySrc: null, alt: null, caption: null },
  ];
  const a = article(blocks, { summary: null });
  const edit = { ...defaultOperatorDraftEdit(a), topicId: "t", topicSlug: "news" };

  it("policy can only narrow", () => {
    expect(effectivePolicy("summary_link", "full")).toBe("summary_link");
    expect(effectivePolicy("full", "link_only")).toBe("link_only");
    expect(effectivePolicy("summary_link", null)).toBe("summary_link");
  });

  it("summary_link publishes thumbnail + lead + source link only", () => {
    const c = buildPublishContent({ article: a, edit, sourcePolicy: "summary_link", sourceName: "출처", rules: [] });
    expect(c.policy).toBe("summary_link");
    expect(c.imageUrls).toEqual(["https://e.com/1.jpg"]);
    expect(c.blocks.map((b) => b.type)).toEqual(["image", "paragraph", "link"]);
    expect(c.blocks[2]).toMatchObject({ type: "link", href: a.canonicalUrl });
    expect(c.attributionUrl).toBe(a.canonicalUrl);
  });

  it("full keeps all images and appends attribution", () => {
    const c = buildPublishContent({ article: a, edit, sourcePolicy: "full", sourceName: "출처", rules: [] });
    expect(c.imageUrls).toHaveLength(2);
    expect(c.blocks.at(-1)).toMatchObject({ type: "link", text: "출처: 출처" });
  });

  it("link_only has no images", () => {
    const c = buildPublishContent({ article: a, edit: { ...edit, contentPolicy: "link_only" }, sourcePolicy: "full", sourceName: "출처", rules: [] });
    expect(c.imageUrls).toEqual([]);
    expect(c.blocks).toHaveLength(1);
  });

  it("lead summary cuts on a sentence boundary without inventing text", () => {
    const long: OperatorContentBlock[] = [{ type: "paragraph", text: `${"가".repeat(200)}다. ${"나".repeat(200)}` }];
    const s = leadSummary(long, 300);
    expect(s.endsWith("다.")).toBe(true);
    expect(long[0]!.type === "paragraph" && long[0].text.startsWith(s)).toBe(true);
  });
});

describe("rules", () => {
  const rule = (p: Partial<ImportRule>): ImportRule => ({
    id: "r",
    scope: "global",
    sourceSite: null,
    sourceBoard: null,
    findText: "x",
    replaceText: "",
    isRegex: false,
    sortOrder: 0,
    enabled: true,
    note: null,
    ...p,
  });
  it("scopes and orders global → source → board", () => {
    const rules = [
      rule({ id: "b", scope: "board", sourceSite: "s", sourceBoard: "b", findText: "A", replaceText: "C" }),
      rule({ id: "g", findText: "A", replaceText: "B" }),
      rule({ id: "o", scope: "source", sourceSite: "other", findText: "B", replaceText: "Z" }),
    ];
    const applied = rulesFor(rules, "s", "b");
    expect(applied.map((r) => r.id)).toEqual(["g", "b"]);
    expect(applyRulesToText("A", applied)).toBe("B");
  });
  it("rejects dangerous regex", () => {
    expect(validateRulePattern("(a+)+", true)).toBe("regex_nested_quantifier");
    expect(validateRulePattern("[", true)).toBe("regex_invalid");
    expect(validateRulePattern("\\d+원", true)).toBeNull();
  });
  it("applies rules inside published content", () => {
    const a = article([{ type: "paragraph", text: "광고문구 본문" }], { summary: null });
    const c = buildPublishContent({
      article: a,
      edit: { ...defaultOperatorDraftEdit(a), contentPolicy: "full" },
      sourcePolicy: "full",
      sourceName: "S",
      rules: [rule({ findText: "광고문구 ", replaceText: "" })],
    });
    expect(c.blocks[0]).toMatchObject({ type: "paragraph", text: "본문" });
  });
});

describe("scheduler & verification", () => {
  const board = (p: Partial<ManagedBoard> & { last?: string | null; fails?: number }): ManagedBoard => ({
    sourceId: "s",
    boardId: p.boardId ?? "b",
    displayName: "B",
    shortLabel: "B",
    category: "x",
    engineKey: "k",
    enabled: p.enabled ?? true,
    collectEnabled: p.collectEnabled ?? true,
    boardKind: "editorial",
    defaultTopicId: null,
    status: {
      lastCheckedAt: p.last ?? null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      lastVerdict: "FULL",
      latestSourceAt: null,
      consecutiveFailures: p.fails ?? 0,
    },
  });
  const now = Date.parse("2026-10-05T12:00:00Z");
  it("isBoardDue respects interval, opt-in and failure backoff", () => {
    expect(isBoardDue(board({}), now)).toBe(true);
    expect(isBoardDue(board({ collectEnabled: false }), now)).toBe(false);
    expect(isBoardDue(board({ last: "2026-10-05T11:30:00Z" }), now)).toBe(false);
    expect(isBoardDue(board({ last: "2026-10-05T10:30:00Z" }), now)).toBe(true);
    expect(isBoardDue(board({ last: "2026-10-05T10:30:00Z", fails: 3 }), now)).toBe(false);
  });
  it("dueBoards skips unverified or disabled sources", () => {
    const src = (verification: string, enabled = true): ManagedSource =>
      ({
        id: verification,
        displayName: verification,
        baseUrl: "https://e.com",
        engine: "rss_atom",
        enabled,
        contentPolicy: "summary_link",
        adapterConfig: {},
        verification,
        status: {} as ManagedSource["status"],
        boards: [board({})],
      }) as ManagedSource;
    const due = dueBoards([src("FULL"), src("NOT_PROVEN"), src("BLOCKED"), src("PARTIAL", false)], now);
    expect(due.map((d) => d.source.id)).toEqual(["FULL"]);
  });
  it("combines board verdicts", () => {
    expect(combineBoardVerdicts(["FAILED", "PARTIAL"])).toBe("PARTIAL");
    expect(combineBoardVerdicts(["BLOCKED", "BLOCKED"])).toBe("BLOCKED");
    expect(combineBoardVerdicts(["BLOCKED", "FAILED"])).toBe("FAILED");
    expect(combineBoardVerdicts([])).toBe("FAILED");
  });
});

describe("edits and publish errors", () => {
  it("keeps index edits only when the source structure is unchanged", () => {
    const a1 = article([
      { type: "paragraph", text: "x" },
      { type: "image", url: "https://e.com/1.jpg", displaySrc: null, alt: null, caption: null },
    ]);
    const e1 = { ...defaultOperatorDraftEdit(a1), imageIncludes: { "1": false }, displayTitle: "바꾼 제목", topicId: "t", topicSlug: "s" };
    const same = carryEditToArticle(e1, a1, { ...a1, title: "새 원문 제목" });
    expect(same.imageIncludes["1"]).toBe(false);
    expect(same.displayTitle).toBe("바꾼 제목");
    const changed = carryEditToArticle(e1, a1, article([{ type: "paragraph", text: "y" }], { title: "새 원문 제목" }));
    expect(changed.imageIncludes).toEqual({});
    expect(changed.topicId).toBe("t");
  });
  it("maps RPC errors to operator codes", () => {
    expect(mapPublishRpcError("already_published:abc").code).toBe("already_published");
    expect(mapPublishRpcError("Could not find the function public.community_import_publish").code).toBe("publish_rpc_missing");
  });
});

describe("staging findings (2026-10-05 live probe)", () => {
  it("strips the gnuboard `> board | site` title suffix but keeps titles that contain pipes", async () => {
    const { stripSiteSuffix } = await import("@/lib/community-operator-import/adapters/gnuboard");
    expect(stripSiteSuffix("기아차 부사장 인터뷰 > 인터뷰 | 알이즈웰")).toBe("기아차 부사장 인터뷰");
    expect(stripSiteSuffix("태풍 북상 | 필리핀동포방송 | 필리핀뉴스룸")).toBe("태풍 북상 | 필리핀동포방송 | 필리핀뉴스룸");
  });

  it("drops news-CMS reporter cards, tip lines and copyright footers from the body", () => {
    const html = `<div><p>본문 문단입니다.</p><img src="/photo/1.jpg"><div class="dn_txt">기사제보 전화</div>
      <div class="view-copyright">저작권자 © 무단전재 금지</div><div class="view-editors"><div class="profile-images"><img src="/img/reporter.jpg"></div>기자</div></div>`;
    const blocks = htmlToBlocks(html, { baseUrl: "https://news.example.com/a" });
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(1);
    expect(JSON.stringify(blocks)).not.toMatch(/기사제보|저작권자|reporter/);
  });

  it("HTML board discovery uses menu labels, skips login/member pages and collapses http/https", async () => {
    const { discoverHtmlBoards } = await import("@/lib/community-operator-import/adapters/html");
    const home = `<nav><a href="/news/list.html?sec=1">교민뉴스</a><a href="http://news.example.com/news/list.html?sec=1">교민뉴스 2</a>
      <a href="/member/login.html">로그인</a><a href="/news/list.html?sec=2">여행</a><a href="https://other.com/x">외부</a></nav>`;
    const source = { id: "n", displayName: "N", baseUrl: "https://news.example.com/", engine: "html" as const, enabled: true, contentPolicy: "summary_link" as const, adapterConfig: {}, verification: "NOT_PROVEN" };
    const boards = await discoverHtmlBoards({ source }, home, "https://news.example.com/");
    expect(boards.map((b) => b.displayName)).toEqual(["교민뉴스", "여행"]);
    expect(boards[0]!.engineKey).toBe("https://news.example.com/news/list.html?sec=1");
    expect(boards[0]!.boardId).not.toContain("https");
  });
});

describe("feed boards by category and keyword", () => {
  const xml = `<rss version="2.0"><channel>
    <item><title>당하리 장어 후기</title><link>https://c.example.com/p/10001</link><category>맛집</category><description>마닐라 맛집</description></item>
    <item><title>KTV 안내</title><link>https://c.example.com/p/10002</link><category>JTV</category><description>x</description></item>
    <item><title>레오피자 후기</title><link>https://c.example.com/p/10003</link><category>맛집</category><description>피자</description></item>
    <item><title>말라테 이자카야</title><link>https://c.example.com/p/10004</link><category>맛집</category><description>한잔</description></item>
    <item><title>세부 골프장 후기</title><link>https://c.example.com/p/10005</link><category>골프</category><description>세부 막탄</description></item>
  </channel></rss>`;
  it("splits one site feed into category boards and filters items", async () => {
    const { applyFeedFilter, categoryBoards, feedFilterOf } = await import("@/lib/community-operator-import/adapters/rss");
    const { items } = parseFeed(xml);
    expect(items[0]!.categories).toEqual(["맛집"]);
    const boards = categoryBoards("https://c.example.com/rss", items);
    expect(boards).toHaveLength(1);
    expect(boards[0]!.displayName).toBe("맛집 (3)");
    expect(applyFeedFilter(items, feedFilterOf(boards[0]!.engineKey)).map((i) => i.title)).toEqual(["당하리 장어 후기", "레오피자 후기", "말라테 이자카야"]);
    expect(applyFeedFilter(items, feedFilterOf(`https://c.example.com/rss#keyword=${encodeURIComponent("세부,클락")}`)).map((i) => i.title)).toEqual(["세부 골프장 후기"]);
    expect(applyFeedFilter(items, feedFilterOf("https://c.example.com/rss"))).toHaveLength(5);
  });
});

describe("truncated feed titles", () => {
  it("uses the page title when the feed title was cut", async () => {
    const { pickFeedTitle } = await import("@/lib/community-operator-import/adapters/rss");
    expect(pickFeedTitle("한국 스포츠 빛내는 필리핀계  국가대표들... 이해란�...", "한국 스포츠 빛내는 필리핀계 국가대표들... 이해란·카노아 활약")).toBe(
      "한국 스포츠 빛내는 필리핀계 국가대표들... 이해란·카노아 활약",
    );
    expect(pickFeedTitle("완전한 제목", "사이트 이름")).toBe("완전한 제목");
    expect(pickFeedTitle("", "페이지 제목")).toBe("페이지 제목");
  });
});

describe("video posts", () => {
  it("keeps a YouTube embed as thumbnail + watch link instead of dropping it", () => {
    const html = `<div class="view-content"><p>태풍 초이완 북상 | 필리핀동포방송</p>
      <iframe src="https://www.youtube.com/embed/QLiT2yyw6gU?autohide=1" width="640"></iframe></div>`;
    const blocks = htmlToBlocks(html, { baseUrl: "https://philsamo.com/bbs/board.php" });
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "image", "link"]);
    expect(blocks[1]).toMatchObject({ type: "image", url: "https://img.youtube.com/vi/QLiT2yyw6gU/hqdefault.jpg" });
    expect(blocks[2]).toMatchObject({ type: "link", href: "https://www.youtube.com/watch?v=QLiT2yyw6gU" });
  });
});
