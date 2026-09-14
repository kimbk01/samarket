/**
 * Generic WordPress REST extractor — produces OperatorNormalizedArticle.
 * Configured per verified source via registry (baseUrl + category engineKey).
 */
import * as cheerio from "cheerio";
import type { OperatorContentBlock, OperatorListRow, OperatorNormalizedArticle } from "./types";
import type { VerifiedOperatorBoard, VerifiedOperatorSource } from "./registry";
import { resolveVerifiedBoard, resolveVerifiedSource } from "./registry";

type CheerioAPI = ReturnType<typeof cheerio.load>;
type CheerioSel = ReturnType<CheerioAPI>;

type WpPost = {
  id: number;
  date?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  categories?: number[];
  _embedded?: {
    author?: Array<{ name?: string }>;
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
  };
};

function absUrl(base: string, raw: string | null | undefined): string | null {
  const u = String(raw || "").trim();
  if (!u) return null;
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

function decodeHtml(raw: string): string {
  const $ = cheerio.load(`<div id="d">${raw}</div>`);
  return $("#d").text().replace(/\s+/g, " ").trim();
}

function isNonContentImage(url: string): boolean {
  return /\/logo|favicon|sprite|emoji|gravatar|1x1|pixel\.|tracking|wp-includes\/js/i.test(url);
}

function walkWpContent($: CheerioAPI, root: CheerioSel, base: string): OperatorContentBlock[] {
  const blocks: OperatorContentBlock[] = [];

  function pushParagraph(text: string) {
    const t = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (t) blocks.push({ type: "paragraph", text: t });
  }

  function pushImage($img: CheerioSel) {
    const src = $img.attr("src") || $img.attr("data-src") || $img.attr("data-lazy-src");
    const url = absUrl(base, src);
    if (!url || isNonContentImage(url)) return;
    blocks.push({
      type: "image",
      url,
      displaySrc: url,
      alt: ($img.attr("alt") || "").trim() || null,
      caption: null,
    });
  }

  root.contents().each((_: number, node: any) => {
    if (node.type === "text") {
      pushParagraph($(node).text());
      return;
    }
    if (node.type !== "tag") return;
    const tag = String(node.name || "").toLowerCase();
    const $el = $(node) as CheerioSel;
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "iframe" || tag === "form") return;
    if (tag === "img") {
      pushImage($el);
      return;
    }
    if (tag === "figure") {
      const $img = $el.find("img").first() as CheerioSel;
      if ($img.length) pushImage($img);
      const cap = $el.find("figcaption").text().replace(/\s+/g, " ").trim();
      if (cap) pushParagraph(cap);
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const t = $el.text().replace(/\s+/g, " ").trim();
      if (t) blocks.push({ type: "heading", level: Number(tag[1]), text: t });
      return;
    }
    if (tag === "blockquote") {
      const t = $el.text().replace(/\s+/g, " ").trim();
      if (t) blocks.push({ type: "quote", text: t });
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
    if (tag === "p" || tag === "div" || tag === "span") {
      const $imgs = $el.find("img");
      if ($imgs.length) {
        const clone = $el.clone();
        clone.find("img, script, style, iframe, form").remove();
        pushParagraph(clone.text());
        $imgs.each((__: number, img: any) => pushImage($(img) as CheerioSel));
        return;
      }
      pushParagraph($el.text());
      return;
    }
    walkWpContent($, $el, base);
  });

  return blocks;
}

async function wpFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DIBAY-OperatorImport/1.0 (+community-import)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
}

function featuredThumb(base: string, post: WpPost): string | null {
  const media = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  return absUrl(base, media || null);
}

export function parseWordpressPostJson(
  post: WpPost,
  sourceId: string,
  boardId: string,
  baseUrl: string,
  boardLabel?: string,
): OperatorNormalizedArticle {
  const articleKey = String(post.id);
  const html = String(post.content?.rendered || "");
  const $ = cheerio.load(`<div id="wp-root">${html}</div>`);
  let orderedContentBlocks = walkWpContent($, $("#wp-root") as CheerioSel, baseUrl);
  const feat = featuredThumb(baseUrl, post);
  if (feat && !orderedContentBlocks.some((b) => b.type === "image" && b.url === feat)) {
    orderedContentBlocks = [
      { type: "image", url: feat, displaySrc: feat, alt: null, caption: null },
      ...orderedContentBlocks,
    ];
  }
  return {
    sourceSite: sourceId,
    sourceBoard: boardId,
    sourceBoardLabel: boardLabel || boardId,
    canonicalUrl: String(post.link || `${baseUrl}/?p=${articleKey}`),
    sourceArticleKey: articleKey,
    title: decodeHtml(String(post.title?.rendered || "")),
    author: post._embedded?.author?.[0]?.name?.trim() || null,
    sourcePublishedDate: post.date ? String(post.date).slice(0, 19).replace("T", " ") : null,
    orderedContentBlocks,
  };
}

function resolveWpPair(
  sourceOrId: VerifiedOperatorSource | string,
  boardOrId: VerifiedOperatorBoard | string,
): { source: VerifiedOperatorSource; board: VerifiedOperatorBoard } {
  if (typeof sourceOrId === "string" || typeof boardOrId === "string") {
    const source = typeof sourceOrId === "string" ? resolveVerifiedSource(sourceOrId) : sourceOrId;
    const board =
      typeof boardOrId === "string"
        ? resolveVerifiedBoard(typeof sourceOrId === "string" ? sourceOrId : sourceOrId.id, boardOrId)
        : boardOrId;
    if (!source || !board || source.engine !== "wordpress_rest") throw new Error("wordpress_board_unsupported");
    return { source, board };
  }
  if (sourceOrId.engine !== "wordpress_rest") throw new Error("wordpress_board_unsupported");
  return { source: sourceOrId, board: boardOrId };
}

export async function fetchWordpressList(
  sourceOrId: VerifiedOperatorSource | string,
  boardOrId: VerifiedOperatorBoard | string,
  page = 1,
): Promise<OperatorListRow[]> {
  const { source, board } = resolveWpPair(sourceOrId, boardOrId);
  const base = source.baseUrl.replace(/\/$/, "");
  const p = Math.max(1, Math.min(20, page));
  const cat = String(board.engineKey || "").trim();
  const qs = new URLSearchParams({
    per_page: "20",
    page: String(p),
    _embed: "1",
  });
  if (cat && cat !== "*" && cat !== "all") qs.set("categories", cat);
  const url = `${base}/wp-json/wp/v2/posts?${qs.toString()}`;
  const res = await wpFetch(url);
  if (!res.ok) throw new Error(`${source.id}_list_http_${res.status}`);
  const posts = (await res.json()) as WpPost[];
  if (!Array.isArray(posts)) throw new Error(`${source.id}_list_invalid`);
  return posts.map((post, i) => {
    const id = String(post.id);
    return {
      articleKey: id,
      title: decodeHtml(String(post.title?.rendered || "")) || `(untitled ${id})`,
      detailUrl: String(post.link || `${base}/?p=${id}`),
      author: post._embedded?.author?.[0]?.name?.trim() || null,
      sourcePublishedDate: post.date ? String(post.date).slice(0, 19).replace("T", " ") : null,
      thumbnailUrl: featuredThumb(base, post),
      listOrder: i,
    };
  });
}

export async function fetchWordpressDetail(
  sourceOrId: VerifiedOperatorSource | string,
  boardOrId: VerifiedOperatorBoard | string,
  articleKey: string,
): Promise<OperatorNormalizedArticle> {
  const { source, board } = resolveWpPair(sourceOrId, boardOrId);
  if (!/^\d+$/.test(articleKey)) throw new Error(`${source.id}_invalid_article_key`);
  const base = source.baseUrl.replace(/\/$/, "");
  const url = `${base}/wp-json/wp/v2/posts/${encodeURIComponent(articleKey)}?_embed=1`;
  const res = await wpFetch(url);
  if (!res.ok) throw new Error(`${source.id}_detail_http_${res.status}`);
  const post = (await res.json()) as WpPost;
  if (!post?.id) throw new Error(`${source.id}_detail_invalid`);
  return parseWordpressPostJson(post, source.id, board.boardId, base, board.displayName);
}
