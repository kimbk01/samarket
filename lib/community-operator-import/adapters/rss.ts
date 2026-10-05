/**
 * RSS/Atom adapter (also Tistory, news feeds, any CMS that publishes a feed).
 * Detail no longer depends on the item still being in the feed: the stored article URL
 * is fetched directly; the feed body is used when the page cannot be read (flagged).
 */
import * as cheerio from "cheerio";
import { describeFetchError, fetchImportText } from "../http";
import { absUrl, blockStats, GENERIC_BODY_SELECTORS, htmlToBlocks, readPageMeta, selectBody } from "../normalize";
import type { OperatorContentBlock, OperatorListRow, OperatorNormalizedArticle, RuntimeBoard } from "../types";
import {
  type AdapterContext,
  articleKeyFromLink,
  boardUrl,
  type DetailTarget,
  type DiscoveredBoard,
  feedItemsToRows,
  type FeedItem,
  parseFeed,
  parseSourceDate,
  slugBoardId,
} from "./common";

/** Tistory/blog chrome that sits inside the article container on some skins. */
const ARTICLE_REMOVE = [
  ".titleWrap",
  ".area_title",
  ".hgroup",
  ".post-header",
  ".entry-header",
  ".article-header",
  ".tt-plugin",
  ".container_postbtn",
  ".another_category",
  ".related-articles",
  ".byline",
  ".share",
];

/** Common feed paths; `rss/allArticle.xml` is the standard path of Korean news CMSs. */
export const FEED_PATH_CANDIDATES = ["rss", "feed", "feed/", "rss.xml", "atom.xml", "index.xml", "feed.xml", "rss/allArticle.xml"];

export async function readFeed(url: string): Promise<FeedItem[]> {
  const res = await fetchImportText(url, { accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*" });
  const parsed = parseFeed(res.text);
  if (!parsed.isFeed) throw new Error("not_a_feed");
  return parsed.items;
}

export async function discoverRssBoards(
  _ctx: AdapterContext,
  feedUrls: Array<{ url: string; title?: string | null }>,
): Promise<DiscoveredBoard[]> {
  return feedUrls.map((f, i) => ({
    boardId: i === 0 && feedUrls.length === 1 ? "feed" : slugBoardId(f.url),
    displayName: f.title?.trim() || (feedUrls.length === 1 ? "전체 피드" : f.url.replace(/^https?:\/\/[^/]+/, "")),
    engineKey: f.url,
    boardKind: /missing|실종/i.test(f.url + (f.title || "")) ? "member_qa" : "editorial",
  }));
}

export async function listRss(ctx: AdapterContext, board: RuntimeBoard, page: number): Promise<OperatorListRow[]> {
  if (page > 1) return []; // feeds carry only their latest window
  const url = boardUrl(ctx.source, board);
  const items = await readFeed(url);
  return feedItemsToRows(items, url);
}

function feedBlocks(item: FeedItem | undefined): OperatorContentBlock[] {
  if (!item?.contentHtml) return [];
  return htmlToBlocks(item.contentHtml, { baseUrl: item.link });
}

export async function detailRss(
  ctx: AdapterContext,
  board: RuntimeBoard,
  target: DetailTarget,
): Promise<OperatorNormalizedArticle> {
  const cfg = ctx.source.adapterConfig;
  const warnings: string[] = [];
  let item: FeedItem | undefined;
  try {
    const items = await readFeed(boardUrl(ctx.source, board));
    item = items.find((it) => articleKeyFromLink(it.link) === target.articleKey);
  } catch (e) {
    warnings.push(`feed_unavailable: ${describeFetchError(e)}`);
  }
  const fromFeed = feedBlocks(item);

  let pageBlocks: OperatorContentBlock[] = [];
  let pageMeta: ReturnType<typeof readPageMeta> | null = null;
  let bodySource = "feed";
  let canonicalUrl = target.detailUrl || item?.link || "";
  let sourceImageCount = item?.contentHtml ? cheerio.load(item.contentHtml)("img").length : 0;
  let usedFeedFallback = false;

  if (cfg.fetchArticle !== false && canonicalUrl) {
    try {
      const res = await fetchImportText(canonicalUrl);
      canonicalUrl = res.finalUrl;
      const $ = cheerio.load(res.text);
      pageMeta = readPageMeta($);
      const body = selectBody($, [...(cfg.bodySelectors ?? []), ...GENERIC_BODY_SELECTORS]);
      if (body) {
        pageBlocks = htmlToBlocks(body.html, {
          baseUrl: canonicalUrl,
          removeSelectors: [...ARTICLE_REMOVE, ...(cfg.removeSelectors ?? [])],
        });
        bodySource = body.selector;
        sourceImageCount = Math.max(sourceImageCount, cheerio.load(body.html)("img").length);
      }
    } catch (e) {
      warnings.push(`article_fetch_failed: ${describeFetchError(e)}`);
    }
  }

  // Prefer the page body unless the feed carries clearly more content.
  const pageStats = blockStats(pageBlocks);
  const feedStats = blockStats(fromFeed);
  let blocks: OperatorContentBlock[];
  if (pageBlocks.length && (pageStats.textChars >= feedStats.textChars * 0.8 || pageStats.imageCount > feedStats.imageCount)) {
    blocks = pageBlocks;
  } else if (fromFeed.length) {
    blocks = fromFeed;
    bodySource = "feed";
    // The feed was all we could read although an article page exists.
    if (!pageBlocks.length && cfg.fetchArticle !== false) usedFeedFallback = true;
  } else {
    blocks = pageBlocks;
  }

  if (!blocks.length && !item) throw new Error("rss_item_unavailable");
  const og = pageMeta?.ogImage ? absUrl(canonicalUrl, pageMeta.ogImage) : item?.mediaImage ?? null;

  return {
    sourceSite: ctx.source.id,
    sourceBoard: board.boardId,
    sourceBoardLabel: board.displayName,
    canonicalUrl,
    sourceArticleKey: target.articleKey,
    title: item?.title || pageMeta?.ogTitle || String(target.title || ""),
    author: item?.author ?? pageMeta?.author ?? null,
    sourcePublishedDate: parseSourceDate(item?.date) || parseSourceDate(pageMeta?.published) || null,
    orderedContentBlocks: blocks,
    summary: target.summary || item?.summary || pageMeta?.description || null,
    extraction: { bodySource, sourceImageCount, ogImage: og, usedFeedFallback, warnings },
  };
}
