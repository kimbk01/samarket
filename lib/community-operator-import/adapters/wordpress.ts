/**
 * Generic WordPress REST adapter. Boards = categories ordered by post count.
 */
import * as cheerio from "cheerio";
import { fetchImportText } from "../http";
import { absUrl, decodeHtmlText, htmlToBlocks } from "../normalize";
import type { OperatorListRow, OperatorNormalizedArticle, RuntimeBoard } from "../types";
import { type AdapterContext, classifyBoardKind, type DetailTarget, type DiscoveredBoard, parseSourceDate, sourceBase } from "./common";

type WpPost = {
  id: number;
  date?: string;
  date_gmt?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  _embedded?: {
    author?: Array<{ name?: string }>;
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
  };
};

type WpCategory = { id: number; name?: string; slug?: string; count?: number };

function apiUrl(ctx: AdapterContext, path: string): string {
  return new URL(`wp-json/wp/v2/${path}`, sourceBase(ctx.source)).toString();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchImportText(url, { accept: "application/json" });
  const t = res.text.trim();
  if (!t.startsWith("[") && !t.startsWith("{")) throw new Error("wordpress_api_not_json");
  return JSON.parse(t) as T;
}

export async function probeWordpressApi(ctx: AdapterContext): Promise<boolean> {
  try {
    const posts = await getJson<unknown>(apiUrl(ctx, "posts?per_page=1"));
    return Array.isArray(posts);
  } catch {
    return false;
  }
}

export async function discoverWordpressBoards(ctx: AdapterContext): Promise<DiscoveredBoard[]> {
  const cats = await getJson<WpCategory[]>(apiUrl(ctx, "categories?orderby=count&order=desc&per_page=40&hide_empty=true"));
  const boards: DiscoveredBoard[] = [{ boardId: "latest", displayName: "최신 전체", engineKey: "all", boardKind: "editorial" }];
  for (const c of Array.isArray(cats) ? cats : []) {
    if (!c?.id || !c.count) continue;
    const name = decodeHtmlText(c.name || c.slug || String(c.id));
    if (String(c.slug).toLowerCase() === "uncategorized" && c.count < 5) continue;
    boards.push({
      boardId: String(c.slug || c.id).slice(0, 60),
      displayName: `${name} (${c.count})`,
      engineKey: String(c.id),
      boardKind: classifyBoardKind(name),
    });
  }
  return boards;
}

function featured(post: WpPost, base: string): string | null {
  return absUrl(base, post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null);
}

function postDate(post: WpPost): string | null {
  if (post.date_gmt) return parseSourceDate(`${post.date_gmt}Z`);
  return parseSourceDate(post.date || null);
}

export async function listWordpress(ctx: AdapterContext, board: RuntimeBoard, page: number): Promise<OperatorListRow[]> {
  const qs = new URLSearchParams({ per_page: "20", page: String(Math.max(1, page)), _embed: "1" });
  const cat = String(board.engineKey || "").trim();
  if (cat && cat !== "all" && cat !== "*") qs.set("categories", cat);
  const posts = await getJson<WpPost[]>(apiUrl(ctx, `posts?${qs.toString()}`));
  const base = sourceBase(ctx.source);
  return (Array.isArray(posts) ? posts : []).map((post, i) => ({
    articleKey: String(post.id),
    title: decodeHtmlText(post.title?.rendered) || `(제목 없음 ${post.id})`,
    detailUrl: String(post.link || `${base}?p=${post.id}`),
    author: post._embedded?.author?.[0]?.name?.trim() || null,
    sourcePublishedDate: postDate(post),
    thumbnailUrl: featured(post, base),
    listOrder: i,
    summary: decodeHtmlText(post.excerpt?.rendered).slice(0, 600) || null,
  }));
}

export async function detailWordpress(
  ctx: AdapterContext,
  board: RuntimeBoard,
  target: DetailTarget,
): Promise<OperatorNormalizedArticle> {
  if (!/^\d+$/.test(target.articleKey)) throw new Error("wordpress_invalid_article_key");
  const post = await getJson<WpPost>(apiUrl(ctx, `posts/${encodeURIComponent(target.articleKey)}?_embed=1`));
  if (!post?.id) throw new Error("wordpress_detail_invalid");
  return wordpressPostToArticle(ctx, board, post);
}

export function wordpressPostToArticle(ctx: AdapterContext, board: RuntimeBoard, post: WpPost): OperatorNormalizedArticle {
  const base = sourceBase(ctx.source);
  const html = String(post.content?.rendered || "");
  const link = String(post.link || `${base}?p=${post.id}`);
  let blocks = htmlToBlocks(html, { baseUrl: link, removeSelectors: ctx.source.adapterConfig.removeSelectors });
  const feat = featured(post, base);
  if (feat && !blocks.some((b) => b.type === "image" && b.url === feat)) {
    blocks = [{ type: "image", url: feat, displaySrc: feat, alt: null, caption: null }, ...blocks];
  }
  const sourceImageCount = cheerio.load(html)("img").length + (feat ? 1 : 0);
  return {
    sourceSite: ctx.source.id,
    sourceBoard: board.boardId,
    sourceBoardLabel: board.displayName,
    canonicalUrl: link,
    sourceArticleKey: String(post.id),
    title: decodeHtmlText(post.title?.rendered),
    author: post._embedded?.author?.[0]?.name?.trim() || null,
    sourcePublishedDate: postDate(post),
    orderedContentBlocks: blocks,
    summary: decodeHtmlText(post.excerpt?.rendered).slice(0, 600) || null,
    extraction: { bodySource: "wp-api", sourceImageCount, ogImage: feat, usedFeedFallback: false, warnings: [] },
  };
}
