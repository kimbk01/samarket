/**
 * LIVE re-verification of the B+ collector against real public sites (read-only: no DB, no auth).
 * Every fetch honors robots.txt. Results → live-probe-results.json (printed as CI annotations).
 */
import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { adapterFor } from "@/lib/community-operator-import/adapters";
import { detectSource, probeBoard } from "@/lib/community-operator-import/detect";
import { blockStats } from "@/lib/community-operator-import/normalize";
import type { OperatorNormalizedArticle } from "@/lib/community-operator-import/types";

type Row = { site: string; check: string; result: "PASS" | "FAIL"; detail: string };
const rows: Row[] = [];
const record = (site: string, check: string, ok: boolean, detail: string) => {
  rows.push({ site, check, result: ok ? "PASS" : "FAIL", detail: detail.slice(0, 400) });
  return ok;
};
const summary = (a: OperatorNormalizedArticle | null | undefined) => {
  if (!a) return "no article";
  const s = blockStats(a.orderedContentBlocks);
  const links = a.orderedContentBlocks.filter((b) => b.type === "link").map((b) => (b as { href: string | null }).href);
  return `title="${a.title.slice(0, 70)}" date=${a.sourcePublishedDate} author=${a.author} chars=${s.textChars} imgs=${s.imageCount} src=${a.extraction?.bodySource} links=${links.slice(0, 2).join(",")} url=${a.canonicalUrl}`;
};

afterAll(() => {
  writeFileSync("live-probe-results.json", JSON.stringify(rows, null, 2));
});

describe("B+ live re-verification", () => {
  it("필사모 뉴스 (gnuboard): YouTube video preserved", async () => {
    const p = await probeBoard({ baseUrl: "https://philsamo.com/", engine: "gnuboard", engineKey: "news" });
    record("필사모 뉴스", "list", p.rows.length >= 5, `rows=${p.rows.length} thumbs=${p.rows.filter((r) => r.thumbnailUrl).length} err=${p.listError}`);
    const a = p.article;
    const hasVideo = !!a?.orderedContentBlocks.some((b) => b.type === "link" && /youtube\.com\/watch/.test(String((b as { href: string | null }).href)));
    record("필사모 뉴스", "video_link", hasVideo, summary(a) + ` detailErr=${p.detailError}`);
    expect(p.rows.length).toBeGreaterThan(0);
  });

  it("필수다 (rss): 맛집 category board", async () => {
    const d = await detectSource("https://philsuda.com/", { sampleBoards: 2, budgetMs: 60_000 });
    const cat = d.boards.find((b) => /맛집/.test(b.displayName));
    record("필수다", "detect", d.engine === "rss_atom", `engine=${d.engine} verdict=${d.verdict} boards=${d.boards.map((b) => b.displayName).join(" | ").slice(0, 300)}`);
    record("필수다", "category_board_맛집", !!cat, cat ? `${cat.displayName} key=${cat.engineKey}` : "no 맛집 category board");
    if (cat) {
      const p = await probeBoard({ baseUrl: d.baseUrl, engine: "rss_atom", engineKey: cat.engineKey });
      const allFood = p.rows.length > 0;
      record("필수다", "category_filter", allFood, `rows=${p.rows.length} titles=${p.rows.slice(0, 3).map((r) => r.title).join(" / ")}`);
      record("필수다", "article", !!p.article && blockStats(p.article.orderedContentBlocks).textChars > 200, summary(p.article) + ` q=${p.quality?.verdict} ${p.quality?.reasons}`);
    }
  });

  it("마닐라서울 (rss): full title and #ct body", async () => {
    const p = await probeBoard({ baseUrl: "http://manilaseoul.co.kr/", engine: "rss_atom", engineKey: "http://manilaseoul.co.kr/happynews_rss.php", adapterConfig: { bodySelectors: ["#ct"] } });
    record("마닐라서울", "list", p.rows.length >= 5, `rows=${p.rows.length} err=${p.listError}`);
    const a = p.article;
    record("마닐라서울", "title_not_truncated", !!a && !/(\.\.\.|…|�)\s*$/.test(a.title), summary(a));
    record("마닐라서울", "body_from_page", !!a && a.extraction?.bodySource === "#ct" && blockStats(a.orderedContentBlocks).textChars > 200, `src=${a?.extraction?.bodySource} q=${p.quality?.verdict} ${p.quality?.reasons} detailErr=${p.detailError}`);
  });

  it("알이즈웰 (gnuboard): title without board/site suffix", async () => {
    const p = await probeBoard({ baseUrl: "https://alabang-zapote.com/madang/", engine: "gnuboard", engineKey: "interwiew" });
    record("알이즈웰", "title_suffix_removed", !!p.article && !/>\s*인터뷰\s*\|/.test(p.article.title), summary(p.article));
  });

  it("GolfAsian (WordPress): thumbnails for posts without featured media", async () => {
    const rows = await adapterFor("wordpress_rest").list(
      { source: { id: "golfasian", displayName: "GolfAsian", baseUrl: "https://www.golfasian.com/", engine: "wordpress_rest", enabled: true, contentPolicy: "summary_link", adapterConfig: {}, verification: "NOT_PROVEN" } },
      { sourceId: "golfasian", boardId: "latest", displayName: "latest", shortLabel: "latest", category: "x", engineKey: "all", enabled: true, collectEnabled: false, boardKind: "editorial", defaultTopicId: null },
      1,
    );
    const thumbs = rows.filter((r) => r.thumbnailUrl).length;
    record("GolfAsian", "latest_thumbnails", thumbs >= Math.ceil(rows.length * 0.7), `rows=${rows.length} thumbs=${thumbs}`);
  });

  it("필리핀 이모저모 (tistory rss)", async () => {
    const p = await probeBoard({ baseUrl: "https://www.phil1234.com/", engine: "rss_atom", engineKey: "https://www.phil1234.com/rss" });
    record("필리핀 이모저모", "article", !!p.article && (p.article.extraction?.usedFeedFallback === false), summary(p.article) + ` q=${p.quality?.verdict}`);
  });

  it("월드코리안 (news CMS): RSS detected, keyword board", async () => {
    const d = await detectSource("https://www.worldkorean.net/", { sampleBoards: 1, budgetMs: 60_000 });
    record("월드코리안", "detect_rss", d.engine === "rss_atom", `engine=${d.engine} verdict=${d.verdict} boards=${d.boards.map((b) => `${b.displayName}=${b.engineKey}`).join(" | ").slice(0, 300)}`);
    const feed = d.boards[0]?.engineKey.split("#")[0] || "https://www.worldkorean.net/rss/allArticle.xml";
    const p = await probeBoard({ baseUrl: d.baseUrl, engine: "rss_atom", engineKey: `${feed}#keyword=${encodeURIComponent("필리핀,마닐라,세부")}` });
    record("월드코리안", "keyword_board_필리핀", !p.listError, `rows=${p.rows.length} titles=${p.rows.slice(0, 3).map((r) => r.title).join(" / ")} err=${p.listError}`);
    if (p.article) {
      const txt = JSON.stringify(p.article.orderedContentBlocks);
      record("월드코리안", "footer_removed", !/저작권자|기사제보/.test(txt), summary(p.article));
    }
  });

  it("아세안익스프레스: section URL keeps the section list", async () => {
    const d = await detectSource("https://www.aseanexpress.co.kr/news/section.html?sec_no=77", { sampleBoards: 1, budgetMs: 60_000 });
    record("아세안익스프레스", "section_kept", d.engine === "html" && d.boards.some((b) => /sec_no=77/.test(b.engineKey)), `engine=${d.engine} verdict=${d.verdict} boards=${d.boards.map((b) => b.engineKey).join(" | ").slice(0, 300)} sample=${JSON.stringify(d.boards[0]?.sample ?? null).slice(0, 250)}`);
  });

  it("HTML board discovery labels (월드코리안 as HTML list)", async () => {
    const p = await probeBoard({ baseUrl: "https://www.worldkorean.net/", engine: "html", adapterConfig: { itemUrlTemplate: "/news/articleView.html?idxno" }, engineKey: "https://www.worldkorean.net/news/articleList.html?view_type=sm" });
    const txt = JSON.stringify(p.article?.orderedContentBlocks ?? []);
    record("월드코리안 HTML", "reporter_footer_removed", !!p.article && !/저작권자|기사제보|horomong/.test(txt), summary(p.article));
    record("월드코리안 HTML", "author", !!p.article?.author, `author=${p.article?.author}`);
  });
});
