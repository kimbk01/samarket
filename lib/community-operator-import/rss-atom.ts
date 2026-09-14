/**
 * RSS/Atom list + detail normalizer for verified official/news sources.
 * Detail prefers content:encoded / description HTML; falls back to public HTML article body.
 */
import * as cheerio from "cheerio";
import { createHash } from "crypto";
import type { OperatorContentBlock, OperatorListRow, OperatorNormalizedArticle } from "./types";
import type { VerifiedOperatorBoard, VerifiedOperatorSource } from "./registry";
import { resolveVerifiedBoard, resolveVerifiedSource } from "./registry";

type CheerioAPI = ReturnType<typeof cheerio.load>;
type CheerioSel = ReturnType<CheerioAPI>;

function absUrl(base: string, raw: string | null | undefined): string | null {
  const u = String(raw || "").trim();
  if (!u) return null;
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

function isNonContentImage(url: string): boolean {
  return /\/logo|favicon|sprite|emoji|gravatar|1x1|pixel\.|tracking|ad[sx]?\/|doubleclick/i.test(url);
}

function walkHtml($: CheerioAPI, root: CheerioSel, base: string): OperatorContentBlock[] {
  const blocks: OperatorContentBlock[] = [];
  function pushParagraph(text: string) {
    const t = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (t) blocks.push({ type: "paragraph", text: t });
  }
  function pushImage($img: CheerioSel) {
    const src = $img.attr("src") || $img.attr("data-src");
    const url = absUrl(base, src);
    if (!url || isNonContentImage(url)) return;
    blocks.push({ type: "image", url, displaySrc: url, alt: ($img.attr("alt") || "").trim() || null, caption: null });
  }
  root.contents().each((_: number, node: any) => {
    if (node.type === "text") {
      pushParagraph($(node).text());
      return;
    }
    if (node.type !== "tag") return;
    const tag = String(node.name || "").toLowerCase();
    const $el = $(node) as CheerioSel;
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "iframe" || tag === "nav" || tag === "footer" || tag === "header" || tag === "aside") return;
    if (tag === "img") {
      pushImage($el);
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const t = $el.text().replace(/\s+/g, " ").trim();
      if (t) blocks.push({ type: "heading", level: Number(tag[1]), text: t });
      return;
    }
    if (tag === "p" || tag === "div" || tag === "span" || tag === "section" || tag === "article") {
      const $imgs = $el.find("img");
      if ($imgs.length && (tag === "p" || tag === "div")) {
        const clone = $el.clone();
        clone.find("img, script, style, iframe, nav, aside").remove();
        pushParagraph(clone.text());
        $imgs.each((__: number, img: any) => pushImage($(img) as CheerioSel));
        return;
      }
      if (tag === "p") {
        pushParagraph($el.text());
        return;
      }
      walkHtml($, $el, base);
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const items: string[] = [];
      $el.children("li").each((__: number, li: any) => {
        const t = $(li).text().replace(/\s+/g, " ").trim();
        if (t) items.push(t);
      });
      if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
      return;
    }
    walkHtml($, $el, base);
  });
  return blocks;
}

function articleKeyFromLink(link: string): string {
  const m = link.match(/\/(\d{5,})(?:\/|$)/) || link.match(/-(\d{5,})(?:\/|$)/);
  if (m) return m[1];
  return createHash("sha1").update(link).digest("hex").slice(0, 16);
}

function decodeXmlText(s: string): string {
  return cheerio.load(`<div id="d">${s}</div>`)("#d").text().replace(/\s+/g, " ").trim();
}

type RssItem = {
  title: string;
  link: string;
  author: string | null;
  date: string | null;
  contentHtml: string;
};

function parseRssItems(xml: string): RssItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: RssItem[] = [];
  $("item").each((_, el) => {
    const $el = $(el);
    const title = decodeXmlText($el.find("title").first().text() || "");
    const link = String($el.find("link").first().text() || $el.find("guid").first().text() || "").trim();
    if (!title || !link) return;
    const author =
      decodeXmlText($el.find("dc\\:creator").first().text() || $el.find("author").first().text() || "") || null;
    const date =
      String($el.find("pubDate").first().text() || $el.find("dc\\:date").first().text() || "").trim() || null;
    const encoded = $el.find("content\\:encoded").first().html() || $el.find("description").first().html() || "";
    items.push({ title, link, author, date, contentHtml: encoded || "" });
  });
  if (items.length === 0) {
    $("entry").each((_, el) => {
      const $el = $(el);
      const title = decodeXmlText($el.find("title").first().text() || "");
      const link =
        String($el.find("link[rel='alternate']").attr("href") || $el.find("link").attr("href") || $el.find("id").text() || "").trim();
      if (!title || !link) return;
      const author = decodeXmlText($el.find("author name").first().text() || "") || null;
      const date = String($el.find("updated").first().text() || $el.find("published").first().text() || "").trim() || null;
      const encoded = $el.find("content").first().html() || $el.find("summary").first().html() || "";
      items.push({ title, link, author, date, contentHtml: encoded || "" });
    });
  }
  return items;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*",
      "User-Agent": "DIBAY-OperatorImport/1.0 (+community-import)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`rss_http_${res.status}`);
  return res.text();
}

function feedUrlForPair(source: VerifiedOperatorSource, board: VerifiedOperatorBoard): string {
  if (source.engine !== "rss_atom") throw new Error("rss_board_unsupported");
  const path = String(board.engineKey || "").trim();
  if (/^https?:\/\//i.test(path)) return path;
  return `${source.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveRssPair(
  sourceOrId: VerifiedOperatorSource | string,
  boardOrId: VerifiedOperatorBoard | string,
): { source: VerifiedOperatorSource; board: VerifiedOperatorBoard } {
  if (typeof sourceOrId === "string" || typeof boardOrId === "string") {
    const source = typeof sourceOrId === "string" ? resolveVerifiedSource(sourceOrId) : sourceOrId;
    const board =
      typeof boardOrId === "string"
        ? resolveVerifiedBoard(typeof sourceOrId === "string" ? sourceOrId : sourceOrId.id, boardOrId)
        : boardOrId;
    if (!source || !board || source.engine !== "rss_atom") throw new Error("rss_board_unsupported");
    return { source, board };
  }
  if (sourceOrId.engine !== "rss_atom") throw new Error("rss_board_unsupported");
  return { source: sourceOrId, board: boardOrId };
}

export async function fetchRssList(
  sourceOrId: VerifiedOperatorSource | string,
  boardOrId: VerifiedOperatorBoard | string,
  page = 1,
): Promise<OperatorListRow[]> {
  const { source, board } = resolveRssPair(sourceOrId, boardOrId);
  const feedUrl = feedUrlForPair(source, board);
  const xml = await fetchText(feedUrl);
  const items = parseRssItems(xml);
  if (!items.length) throw new Error(`${source.id}_rss_empty`);
  const pageSize = 20;
  const p = Math.max(1, Math.min(20, page));
  const slice = items.slice((p - 1) * pageSize, p * pageSize);
  return slice.map((it, i) => {
    const key = articleKeyFromLink(it.link);
    let thumb: string | null = null;
    if (it.contentHtml) {
      const $ = cheerio.load(it.contentHtml);
      const src = $("img").first().attr("src");
      thumb = absUrl(it.link, src || null);
    }
    return {
      articleKey: key,
      title: it.title,
      detailUrl: it.link,
      author: it.author,
      sourcePublishedDate: it.date,
      thumbnailUrl: thumb && !isNonContentImage(thumb) ? thumb : null,
      listOrder: i,
    };
  });
}

export async function fetchRssDetail(
  sourceOrId: VerifiedOperatorSource | string,
  boardOrId: VerifiedOperatorBoard | string,
  articleKey: string,
): Promise<OperatorNormalizedArticle> {
  const { source, board } = resolveRssPair(sourceOrId, boardOrId);
  const feedUrl = feedUrlForPair(source, board);
  const xml = await fetchText(feedUrl);
  const items = parseRssItems(xml);
  const item = items.find((it) => articleKeyFromLink(it.link) === articleKey);
  if (!item) throw new Error(`${source.id}_rss_item_not_found`);

  let orderedContentBlocks: OperatorContentBlock[] = [];
  if (item.contentHtml && item.contentHtml.replace(/<[^>]+>/g, "").trim().length > 80) {
    const $ = cheerio.load(`<div id="rss-root">${item.contentHtml}</div>`);
    orderedContentBlocks = walkHtml($, $("#rss-root") as CheerioSel, item.link);
  }
  const hasText = orderedContentBlocks.some((b) => b.type === "paragraph" || b.type === "heading");
  const hasImages = orderedContentBlocks.some((b) => b.type === "image");
  // Tistory/blog RSS often ships text-only description; enrich from public HTML when images missing.
  if (!hasText || !hasImages) {
    try {
      const html = await fetchText(item.link);
      const $ = cheerio.load(html);
      $("script, style, noscript, iframe, nav, footer, header, aside, form").remove();
      const $root =
        $("article").first().length
          ? $("article").first()
          : $(".tt_article_useless_p_margin, .entry-content, .article__content, .post-content, main").first().length
            ? $(".tt_article_useless_p_margin, .entry-content, .article__content, .post-content, main").first()
            : $("body");
      const htmlBlocks = walkHtml($, $root as CheerioSel, item.link);
      if (!hasText) {
        orderedContentBlocks = htmlBlocks;
      } else if (!hasImages) {
        const htmlImages = htmlBlocks.filter((b) => b.type === "image");
        if (htmlImages.length) {
          // Prefer structured HTML body when it carries the article images.
          const htmlTextCount = htmlBlocks.filter((b) => b.type === "paragraph" || b.type === "heading").length;
          orderedContentBlocks = htmlTextCount >= 1 ? htmlBlocks : [...orderedContentBlocks, ...htmlImages];
        }
      }
    } catch {
      /* keep RSS snippet blocks if any */
    }
  }
  if (!orderedContentBlocks.length) {
    orderedContentBlocks = [{ type: "paragraph", text: item.title }];
  }

  return {
    sourceSite: source.id,
    sourceBoard: board.boardId,
    sourceBoardLabel: board.displayName,
    canonicalUrl: item.link,
    sourceArticleKey: articleKey,
    title: item.title,
    author: item.author,
    sourcePublishedDate: item.date,
    orderedContentBlocks,
  };
}
