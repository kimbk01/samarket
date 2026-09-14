import * as cheerio from "cheerio";
import type { DetailDocument, ExternalBoardDef, ListArticle, SiteAdapter } from "../types";

const SITE_KEY = "philsamo";
const BASE = "https://philsamo.com";

/**
 * LIST AUTHORITY = `.list-board .list-row` / `.list-item` card grid.
 * Evidence (sharing board HTML):
 * - title: `a[href*=wr_id][title]`
 * - date: `.wr-date`
 * - author: `.list-info .sv_member`
 * - thumb: `.wr-img` / `.list-img img`
 *
 * NOT authority: `.list-user-widget-box .post-list` popular widget
 * (has title+MM.DD date, NO author) — must not be used as product list.
 */
export const PHILSAMO_LIST_SELECTORS = {
  row: ".list-board .list-row .list-item, .list-board .list-item.list-col",
  titleLink: 'a[href*="wr_id="][title]',
  author: ".list-info .sv_member",
  date: ".wr-date",
  thumb: ".list-img img.wr-img, .list-img img",
} as const;

function abs(url: string): string {
  try {
    return new URL(url, BASE).toString();
  } catch {
    return url;
  }
}

function parseWrId(href: string): string | null {
  const m = href.match(/[?&]wr_id=(\d+)/i);
  return m?.[1] ?? null;
}

function cleanMemberName(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").replace(/\d+\s*레벨\s*이미지/g, "").trim();
  return t || null;
}

/** Parse gnuboard-ish date strings into ISO when possible; else keep display text as null published_at and store raw in caller. */
export function parsePhilsamoListDate(raw: string): { display: string; iso: string | null } {
  const display = raw.replace(/\s+/g, " ").trim();
  if (!display) return { display: "", iso: null };
  // YYYY.MM.DD
  const full = display.match(/^(20\d{2})\.(\d{2})\.(\d{2})$/);
  if (full) {
    return { display, iso: `${full[1]}-${full[2]}-${full[3]}T00:00:00.000Z` };
  }
  return { display, iso: null };
}

export const philsamoBoards: ExternalBoardDef[] = [
  {
    siteKey: SITE_KEY,
    boardKey: "sharing",
    name: "정보공유",
    listUrl: `${BASE}/bbs/board.php?bo_table=sharing`,
    topicHint: "information",
    capabilities: {
      supportsRecent: true,
      supportsPageRange: true,
      supportsDateRange: false,
      recentCounts: [10, 20, 50],
    },
  },
];

export const philsamoAdapter: SiteAdapter = {
  site: {
    countryCode: "PH",
    siteKey: SITE_KEY,
    name: "필사모",
    baseUrl: BASE,
    engine: "cheerio",
    adapterKey: "philsamo",
  },

  listBoards() {
    return philsamoBoards;
  },

  nextListPageUrl({ board, pageUrl, html }) {
    const $ = cheerio.load(html);
    const current = new URL(pageUrl);
    const page = Number(current.searchParams.get("page") || "1");
    const nextHref =
      $(".pg_next a").attr("href") ||
      $(`a[href*="page=${page + 1}"]`).attr("href") ||
      null;
    if (nextHref) return abs(nextHref);
    if (page < 3) {
      const u = new URL(board.listUrl);
      u.searchParams.set("page", String(page + 1));
      return u.toString();
    }
    return null;
  },

  fetchArticleList({ html, pageUrl }) {
    const $ = cheerio.load(html);
    const out: ListArticle[] = [];
    const seen = new Set<string>();
    const page = Number(new URL(pageUrl).searchParams.get("page") || "1");

    $(PHILSAMO_LIST_SELECTORS.row).each((_, row) => {
      const $row = $(row);
      const $a = $row.find(PHILSAMO_LIST_SELECTORS.titleLink).first();
      const href = $a.attr("href");
      if (!href) return;
      const wrId = parseWrId(href);
      if (!wrId || seen.has(wrId)) return;

      const title = String($a.attr("title") || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!title) return;

      const author = cleanMemberName($row.find(PHILSAMO_LIST_SELECTORS.author).first().text());
      const dateRaw = $row.find(PHILSAMO_LIST_SELECTORS.date).first().text();
      const dateParsed = parsePhilsamoListDate(dateRaw);
      const thumb =
        $row.find(PHILSAMO_LIST_SELECTORS.thumb).first().attr("src") ||
        $row.find(PHILSAMO_LIST_SELECTORS.thumb).first().attr("data-src") ||
        null;

      seen.add(wrId);
      out.push({
        externalArticleKey: wrId,
        canonicalUrl: abs(href),
        title,
        author,
        sourcePublishedAt: dateParsed.iso ?? (dateParsed.display || null),
        thumbnailUrl: thumb ? abs(thumb) : null,
        listPage: page,
      });
    });

    return out;
  },

  fetchArticleDetail({ article, html, pageUrl }) {
    const $ = cheerio.load(html);
    const title =
      $("#bo_v_title").text().replace(/\s+/g, " ").trim() ||
      $("h1").first().text().replace(/\s+/g, " ").trim() ||
      article.title;

    const author =
      cleanMemberName($(".bo_v_info .sv_member, .view-wrap .sv_member").first().text()) ||
      article.author;

    const dateText =
      $(".bo_v_info .if_date, .bo_date, time").first().text().replace(/\s+/g, " ").trim() ||
      article.sourcePublishedAt;

    const $body = $("#bo_v_con, .view-content, #view_content").first();
    const bodyHtml = ($body.html() || "").trim();
    const bodyText = $body.text().replace(/\s+/g, " ").trim();

    const bodyImageUrls: string[] = [];
    const galleryImageUrls: string[] = [];
    const decorative = ["icon", "btn", "logo", "emoji", "profile", "avatar", "banner", "level/"];

    $body.find("img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src");
      if (!src) return;
      const u = abs(src);
      const low = u.toLowerCase();
      if (decorative.some((d) => low.includes(d))) return;
      if (!bodyImageUrls.includes(u)) bodyImageUrls.push(u);
    });

    $(".bo_v_file img, .bo_v_img img, #bo_v_img img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src");
      if (!src) return;
      const u = abs(src);
      if (!galleryImageUrls.includes(u) && !bodyImageUrls.includes(u)) galleryImageUrls.push(u);
    });

    const thumbnailUrl = article.thumbnailUrl || bodyImageUrls[0] || galleryImageUrls[0] || null;

    const nodes = buildNodesFromPhilsamoBody($, $body);

    return {
      externalArticleKey: article.externalArticleKey,
      canonicalUrl: pageUrl || article.canonicalUrl,
      title,
      author,
      sourcePublishedAt: dateText,
      bodyHtml,
      bodyText,
      thumbnailUrl,
      bodyImageUrls,
      galleryImageUrls,
      nodes,
      mediaMeta: {
        thumbnailAuthority: "list_thumb_else_first_body_image",
        bodyImageSelector: "#bo_v_con img",
        gallerySelector: ".bo_v_file img, #bo_v_img img",
        decorativeExclusions: decorative,
      },
    } satisfies DetailDocument;
  },
};

function buildNodesFromPhilsamoBody($: cheerio.CheerioAPI, $body: cheerio.Cheerio<any>): DetailDocument["nodes"] {
  const nodes: DetailDocument["nodes"] = [];
  const decorative = ["icon", "btn", "logo", "emoji", "profile", "avatar", "banner", "level/"];

  /**
   * FIRST DIVERGENCE (CUT2): `$body.children()` only saw wrapper divs → missed nested semantic <p>.
   * SOURCE allP=86 = empty layout 44 + text 39 + img-only 3.
   * Semantic authority = text paragraphs + image-bearing paragraphs (empty layout excluded).
   */
  $body.find("h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote").each((_, el) => {
    const tag = String((el as { name?: string }).name || "").toLowerCase();
    const $el = $(el);
    // Nested list/quote items are owned by the parent block — do not double-count.
    if ($el.parents("ul,ol,blockquote").length > 0) return;

    if (tag === "p") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      const imgs = $el.find("img");
      let emittedImage = false;
      imgs.each((__, img) => {
        const src = $(img).attr("src") || $(img).attr("data-src");
        if (!src) return;
        const u = abs(src);
        const low = u.toLowerCase();
        if (decorative.some((d) => low.includes(d))) return;
        nodes.push({ type: "image", src: u, alt: $(img).attr("alt") || undefined });
        emittedImage = true;
      });
      // empty/layout-only paragraph (no text, no semantic image) — exclude
      if (!text && !emittedImage) return;
      if (text) nodes.push({ type: "paragraph", text });
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text) nodes.push({ type: "heading", text, level: Number(tag[1]) });
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const items: string[] = [];
      $el.find("> li").each((__, li) => {
        const t = $(li).text().replace(/\s+/g, " ").trim();
        if (t) items.push(t);
      });
      if (items.length) nodes.push({ type: "list", ordered: tag === "ol", items });
      return;
    }
    if (tag === "blockquote") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text) nodes.push({ type: "quote", text });
    }
  });
  return nodes;
}
