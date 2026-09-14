/**
 * PHILSAMO Gnuboard HTML collector — Fresh operator import.
 * Board is selected from bounded registry (boards.ts), not a free crawler.
 */
import * as cheerio from "cheerio";
import { isSupportedPhilsamoBoard, resolvePhilsamoBoard } from "./boards";
import type { OperatorContentBlock, OperatorListRow, OperatorNormalizedArticle } from "./types";
import { PHILSAMO_BASE, PHILSAMO_SOURCE_SITE, PHILSAMO_TRAVEL_BOARD } from "./types";

type CheerioAPI = typeof cheerio.load extends (...args: any[]) => infer R ? R : never;
type CheerioSel = ReturnType<CheerioAPI>;

function absUrl(u: string | undefined | null): string | null {
  if (!u) return null;
  try {
    return new URL(u, PHILSAMO_BASE).toString();
  } catch {
    return null;
  }
}

function normalizeImageUrl(src: string | undefined, contentAttr: string | undefined): string | null {
  const preferred = contentAttr || src;
  const u = absUrl(preferred);
  if (!u) return null;
  return u.replace(/\/thumb-([^/]+?)_\d+x\d+(\.[a-z]+)$/i, "/$1$2");
}

function isNonContentImage(url: string): boolean {
  const u = url.toLowerCase();
  if (/\/logo|logo-philsamo|\/img\/sns\/|\/img\/level\/|member_image|favicon/i.test(u)) return true;
  if (/tracking|pixel|1x1|spacer/i.test(u)) return true;
  return false;
}

export function parsePhilsamoTravelListHtml(html: string, board: string = PHILSAMO_TRAVEL_BOARD): OperatorListRow[] {
  const boardKey = String(board || PHILSAMO_TRAVEL_BOARD).trim();
  const $ = cheerio.load(html);
  const rows: OperatorListRow[] = [];
  const seen = new Set<string>();

  $(`a[href*='bo_table=${boardKey}'][href*='wr_id=']`).each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/wr_id=(\d+)/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    const title = (($(el).attr("title") || $(el).text() || "") as string).trim();
    if (!title || title.length < 2) return;

    let scope = $(el).closest(".img-wrap, .list-row, li, .gall-item, .panel");
    if (!scope.length) scope = $(el).parent().parent().parent();
    const date =
      scope.find(".wr-date").first().text().trim() ||
      $(el).closest("div").parent().find(".wr-date").first().text().trim() ||
      null;
    const thumb =
      absUrl(scope.find("img.wr-img").first().attr("src") || null) ||
      absUrl($(el).closest("div").parent().find("img.wr-img").first().attr("src") || null) ||
      null;
    const authorRaw =
      scope.find(".sv_member").first().text().replace(/\s+/g, " ").trim() ||
      $(el).closest("div").parent().find(".sv_member").first().text().replace(/\s+/g, " ").trim() ||
      "";

    seen.add(id);
    rows.push({
      articleKey: id,
      title: title.replace(/\s+/g, " ").trim(),
      detailUrl: `${PHILSAMO_BASE}/bbs/board.php?bo_table=${boardKey}&wr_id=${id}`,
      author: authorRaw || null,
      sourcePublishedDate: date || null,
      thumbnailUrl: thumb,
      listOrder: rows.length + 1,
    });
  });

  return rows;
}

function walkContent($: CheerioAPI, root: CheerioSel): OperatorContentBlock[] {
  const blocks: OperatorContentBlock[] = [];

  function pushParagraph(text: string) {
    const t = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return;
    blocks.push({ type: "paragraph", text: t });
  }

  function pushImage($img: CheerioSel) {
    const src = $img.attr("src");
    const content = $img.attr("content");
    const url = normalizeImageUrl(src, content);
    if (!url) return;
    if (isNonContentImage(url)) return;

    let canonical = url;
    const parentA = $img.closest("a.view_image");
    const fn = parentA.attr("href");
    if (fn && /view_image\.php\?fn=/.test(fn)) {
      try {
        const q = new URL(fn, PHILSAMO_BASE).searchParams.get("fn");
        if (q) canonical = absUrl(decodeURIComponent(q)) || url;
      } catch {
        /* keep */
      }
    }
    blocks.push({
      type: "image",
      url: canonical,
      displaySrc: absUrl(src || null),
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

    if (tag === "script" || tag === "style") return;

    if (tag === "img") {
      pushImage($el);
      return;
    }

    if (tag === "a") {
      const $img = $el.find("img").first() as CheerioSel;
      if ($img.length) {
        pushImage($img);
        return;
      }
      const href = absUrl($el.attr("href") || null);
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (href || text) blocks.push({ type: "link", href, text: text || null });
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

    if (tag === "p" || tag === "div" || tag === "span" || tag === "br") {
      const childBlocks: OperatorContentBlock[] = [];
      const buf: string[] = [];
      const flush = () => {
        const t = buf.join("").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        if (t) childBlocks.push({ type: "paragraph", text: t });
        buf.length = 0;
      };
      $el.contents().each((__: number, child: any) => {
        if (child.type === "text") {
          buf.push($(child).text());
          return;
        }
        if (child.type !== "tag") return;
        const ctag = String(child.name || "").toLowerCase();
        const $c = $(child) as CheerioSel;
        if (ctag === "br") {
          flush();
          return;
        }
        if (ctag === "img") {
          flush();
          pushImage($c);
          const img = blocks.pop();
          if (img) childBlocks.push(img);
          return;
        }
        if (ctag === "a") {
          const $img = $c.find("img").first() as CheerioSel;
          if ($img.length) {
            flush();
            pushImage($img);
            const img = blocks.pop();
            if (img) childBlocks.push(img);
            return;
          }
          buf.push($c.text());
          return;
        }
        buf.push($c.text());
      });
      flush();
      for (const b of childBlocks) blocks.push(b);
      return;
    }

    walkContent($, $el);
  });

  return blocks;
}

export function parsePhilsamoTravelDetailHtml(
  html: string,
  articleKey: string,
  board: string = PHILSAMO_TRAVEL_BOARD,
): OperatorNormalizedArticle {
  const boardDef = resolvePhilsamoBoard(board);
  if (!boardDef) throw new Error("philsamo_board_unsupported");
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("h2[itemprop='headline']").attr("content") ||
    $("h2[itemprop='headline']").clone().children().remove().end().text().trim() ||
    "";
  const author =
    $("span[itemprop='publisher']").attr("content") ||
    $("span[itemprop='publisher'] .sv_member").text().replace(/\s+/g, " ").trim() ||
    null;
  const dateEl = $("span[itemprop='datePublished']");
  const sourceDate = dateEl.attr("content") || dateEl.text().replace(/\s+/g, " ").trim() || null;

  const $content = $("div.view-content").first();
  if (!$content.length) {
    throw new Error("philsamo_view_content_missing");
  }

  const orderedContentBlocks = walkContent($, $content as CheerioSel);

  return {
    sourceSite: PHILSAMO_SOURCE_SITE,
    sourceBoard: boardDef.board,
    sourceBoardLabel: boardDef.labelKo,
    canonicalUrl: `${PHILSAMO_BASE}/bbs/board.php?bo_table=${boardDef.board}&wr_id=${articleKey}`,
    sourceArticleKey: articleKey,
    title: title.trim(),
    author,
    sourcePublishedDate: sourceDate,
    orderedContentBlocks,
  };
}

export async function fetchPhilsamoTravelList(
  page = 1,
  board: string = PHILSAMO_TRAVEL_BOARD,
): Promise<OperatorListRow[]> {
  if (!isSupportedPhilsamoBoard(board)) throw new Error("philsamo_board_unsupported");
  const boardKey = String(board).trim();
  const url =
    page <= 1
      ? `${PHILSAMO_BASE}/bbs/board.php?bo_table=${boardKey}`
      : `${PHILSAMO_BASE}/bbs/board.php?bo_table=${boardKey}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "DIBAY-Community-OperatorImport/1.0 (+admin)",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`philsamo_list_http_${res.status}`);
  const html = await res.text();
  return parsePhilsamoTravelListHtml(html, boardKey);
}

export async function fetchPhilsamoTravelDetail(
  articleKey: string,
  board: string = PHILSAMO_TRAVEL_BOARD,
): Promise<OperatorNormalizedArticle> {
  if (!isSupportedPhilsamoBoard(board)) throw new Error("philsamo_board_unsupported");
  const boardKey = String(board).trim();
  const key = String(articleKey || "").trim();
  if (!/^\d+$/.test(key)) throw new Error("philsamo_invalid_article_key");
  const url = `${PHILSAMO_BASE}/bbs/board.php?bo_table=${boardKey}&wr_id=${key}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "DIBAY-Community-OperatorImport/1.0 (+admin)",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`philsamo_detail_http_${res.status}`);
  const html = await res.text();
  return parsePhilsamoTravelDetailHtml(html, key, boardKey);
}
