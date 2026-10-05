/**
 * Generic Gnuboard adapter — any site, any skin. Site differences live in `adapter_config`.
 * List: board.php HTML, falling back to the built-in `bbs/rss.php` when the skin renders lists by JS.
 * Detail: body selectors (skin list + config) + attachment images (`view-img` / `bo_v_img`).
 */
import * as cheerio from "cheerio";
import { fetchImportText } from "../http";
import {
  BODY_SELECTOR_CHANGED,
  configuredBodySelectorMissed,
  absUrl,
  cleanText,
  GENERIC_BODY_SELECTORS,
  htmlToBlocks,
  imageUrlOf,
  isNonContentImageUrl,
  readPageMeta,
  selectBody,
  unthumbnailUrl,
} from "../normalize";
import type { OperatorContentBlock, OperatorListRow, OperatorNormalizedArticle, RuntimeBoard } from "../types";
import {
  type AdapterContext,
  classifyBoardKind,
  type DetailTarget,
  type DiscoveredBoard,
  feedItemsToRows,
  parseFeed,
  parseSourceDate,
  sourceBase,
} from "./common";

const SKIN_BODY_SELECTORS = ["div.view-content", "#bo_v_con", ".view-content", "#view-content", ".bo_v_con"];
const SKIN_ATTACHMENT_SELECTORS = ["div.view-img", "#bo_v_img", ".view-img", ".bo_v_img"];
const SKIN_REMOVE = ["#bo_v_share", "#bo_v_sns", "#bo_v_file", "#bo_v_link", ".bo_v_nb", ".view-share", ".print-hide"];

function bbsUrl(ctx: AdapterContext, path: string): string {
  return new URL(`bbs/${path}`, sourceBase(ctx.source)).toString();
}

export async function discoverGnuboardBoards(ctx: AdapterContext, homeHtml?: string): Promise<DiscoveredBoard[]> {
  const html = homeHtml ?? (await fetchImportText(sourceBase(ctx.source))).text;
  const $ = cheerio.load(html);
  const found = new Map<string, DiscoveredBoard>();
  $("a[href*='bo_table=']").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (/wr_id=/.test(href)) return;
    const key = href.match(/bo_table=([\w-]+)/)?.[1];
    const label = cleanText($(a).text()).replace(/\s*\(\d+\)\s*$/, "");
    if (!key || !label || label.length > 40) return;
    if (found.has(key)) return;
    found.set(key, { boardId: key, displayName: label, engineKey: key, boardKind: classifyBoardKind(`${label} ${key}`) });
  });
  return [...found.values()].slice(0, 80);
}

function parseListHtml(html: string, boardKey: string, pageUrl: string): OperatorListRow[] {
  const $ = cheerio.load(html);
  const rows: OperatorListRow[] = [];
  const seen = new Set<string>();
  $(`a[href*='bo_table=${boardKey}'][href*='wr_id=']`).each((_, a) => {
    const href = $(a).attr("href") || "";
    const id = href.match(/wr_id=(\d+)/)?.[1];
    if (!id || seen.has(id)) return;
    const title = cleanText($(a).attr("title") || $(a).text())
      .replace(/\s*\[\d+\]\s*$/, "")
      .replace(/\s*\+\d+\s*$/, "");
    if (title.length < 2) return;
    const scope = $(a).closest("li, tr, .list-row, .gall-li, .gall-item, .media, .list-item, article");
    let thumb: string | null = null;
    scope.find("img").each((__, img) => {
      if (thumb) return;
      const u = imageUrlOf($(img), pageUrl);
      if (u && !isNonContentImageUrl(u) && !/\/(?:icon|level|sns)\//i.test(u)) thumb = u;
    });
    const date = cleanText(scope.find(".wr-date, .td_datetime, .date, .datetime, time").first().text()) || null;
    const author = cleanText(scope.find(".sv_member, .td_name, .wr-name, .member").first().text()) || null;
    seen.add(id);
    rows.push({
      articleKey: id,
      title,
      detailUrl: absUrl(pageUrl, href) || href,
      author,
      sourcePublishedDate: parseSourceDate(date) || date,
      thumbnailUrl: thumb,
      listOrder: rows.length,
    });
  });
  return rows;
}

export async function listGnuboard(ctx: AdapterContext, board: RuntimeBoard, page: number): Promise<OperatorListRow[]> {
  const key = board.engineKey;
  const url = bbsUrl(ctx, `board.php?bo_table=${encodeURIComponent(key)}${page > 1 ? `&page=${page}` : ""}`);
  const res = await fetchImportText(url);
  const rows = parseListHtml(res.text, key, res.finalUrl);
  if (rows.length >= 3 || page > 1) return rows;
  // Some skins render the list client-side; Gnuboard's built-in feed is the stable fallback.
  try {
    const feed = await fetchImportText(bbsUrl(ctx, `rss.php?bo_table=${encodeURIComponent(key)}`), {
      accept: "application/rss+xml,application/xml,text/xml,*/*",
    });
    const parsed = parseFeed(feed.text);
    if (parsed.items.length > rows.length) {
      return feedItemsToRows(parsed.items, sourceBase(ctx.source)).map((r) => {
        const wr = r.detailUrl.match(/wr_id=(\d+)/)?.[1];
        return wr ? { ...r, articleKey: wr } : r;
      });
    }
  } catch {
    /* board without feed — keep HTML rows */
  }
  return rows;
}

/** `제목 > 게시판 | 사이트` (gnuboard og:title / <title>) → `제목`. */
export function stripSiteSuffix(raw: string | null | undefined): string {
  return cleanText(raw).replace(/\s+>\s+[^>|]{1,40}\s*\|\s*[^|]{1,60}$/, "").trim();
}

function attachmentImages($: ReturnType<typeof cheerio.load>, selectors: string[], pageUrl: string): string[] {
  const urls: string[] = [];
  for (const sel of selectors) {
    $(sel)
      .find("img")
      .each((_, img) => {
        const $img = $(img);
        let u: string | null = null;
        const viewer = $img.closest("a.view_image").attr("href");
        if (viewer && /view_image\.php\?fn=/.test(viewer)) {
          try {
            const fn = new URL(viewer, pageUrl).searchParams.get("fn");
            if (fn) u = absUrl(pageUrl, decodeURIComponent(fn));
          } catch {
            /* keep img src */
          }
        }
        u = u || imageUrlOf($img, pageUrl);
        if (u && !isNonContentImageUrl(u)) urls.push(unthumbnailUrl(u));
      });
  }
  return [...new Set(urls)];
}

export async function detailGnuboard(
  ctx: AdapterContext,
  board: RuntimeBoard,
  target: DetailTarget,
): Promise<OperatorNormalizedArticle> {
  const url =
    target.detailUrl ||
    bbsUrl(ctx, `board.php?bo_table=${encodeURIComponent(board.engineKey)}&wr_id=${encodeURIComponent(target.articleKey)}`);
  const res = await fetchImportText(url);
  const $ = cheerio.load(res.text);
  const meta = readPageMeta($);
  const cfg = ctx.source.adapterConfig;

  const body = selectBody($, [...(cfg.bodySelectors ?? []), ...SKIN_BODY_SELECTORS, ...GENERIC_BODY_SELECTORS]);
  const bodyBlocks = body
    ? htmlToBlocks(body.html, { baseUrl: res.finalUrl, removeSelectors: [...SKIN_REMOVE, ...(cfg.removeSelectors ?? [])] })
    : [];
  const attachments = attachmentImages($, [...(cfg.attachmentSelectors ?? []), ...SKIN_ATTACHMENT_SELECTORS], res.finalUrl);
  const bodyImageUrls = new Set(bodyBlocks.filter((b) => b.type === "image").map((b) => (b as { url: string }).url));
  const attachmentBlocks: OperatorContentBlock[] = attachments
    .filter((u) => !bodyImageUrls.has(u))
    .map((u) => ({ type: "image", url: u, displaySrc: u, alt: null, caption: null }));

  const title =
    cleanText($("#bo_v_title .bo_v_tit").text()) ||
    stripSiteSuffix($("h2[itemprop='headline']").attr("content")) ||
    cleanText($("#bo_v_title").first().text()) ||
    stripSiteSuffix(meta.ogTitle) ||
    cleanText(target.title) ||
    cleanText($("h1").first().text());
  const author =
    cleanText($("span[itemprop='publisher']").attr("content")) ||
    cleanText($("#bo_v_info .sv_member, .view-info .sv_member, span[itemprop='publisher'] .sv_member").first().text()) ||
    null;
  const dateRaw =
    cleanText($("span[itemprop='datePublished']").attr("content")) ||
    (cfg.dateSelector ? cleanText($(cfg.dateSelector).first().text()) : "") ||
    meta.published ||
    cleanText($("#bo_v_info .if_date, .view-info .wr-date, #bo_v_info strong.if_date").first().text()) ||
    null;

  const sourceImageCount = (body ? cheerio.load(body.html)("img").length : 0) + attachments.length;
  return {
    sourceSite: ctx.source.id,
    sourceBoard: board.boardId,
    sourceBoardLabel: board.displayName,
    canonicalUrl: res.finalUrl,
    sourceArticleKey: target.articleKey,
    title,
    author,
    sourcePublishedDate: parseSourceDate(dateRaw) || dateRaw,
    orderedContentBlocks: [...attachmentBlocks, ...bodyBlocks],
    summary: target.summary ?? meta.description,
    extraction: {
      bodySource: body?.selector ?? "none",
      sourceImageCount,
      ogImage: meta.ogImage ? absUrl(res.finalUrl, meta.ogImage) : null,
      usedFeedFallback: false,
      warnings: [...(body ? [] : ["body_selector_not_found"]), ...(configuredBodySelectorMissed(cfg.bodySelectors, body) ? [BODY_SELECTOR_CHANGED] : [])],
    },
  };
}
