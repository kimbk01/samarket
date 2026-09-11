/**
 * Travel Philippines — Department of Tourism adapter.
 * Site-specific __NEXT_DATA__ paths live HERE only — not in generic-html.
 *
 * Proven paths (live):
 *   props.pageProps.data.article.title
 *   props.pageProps.data.article.coverImage.url
 *   props.pageProps.data.article.content (HTML string when present)
 */

import * as cheerio from "cheerio";
import type { ParsedDetail, ParsedListItem } from "@/lib/community-crawler/adapters/generic-html";
import {
  htmlFragmentToCommunityMarkdown,
  normalizeTitleText,
} from "@/lib/community-crawler/core/html-to-community-markdown";
import { CommunityCrawlError } from "@/lib/community-crawler/core/errors";
import { resolveCrawlUrl } from "@/lib/community-crawler/core/safe-url";
import { extractCoverCandidateLadder } from "@/lib/community-crawler/media/cover-candidate-ladder";

export const TRAVEL_PHILIPPINES_ADAPTER_KEY = "travel_philippines" as const;

export const TRAVEL_PH_NEXT_DATA_COVER_PATH =
  "props.pageProps.data.article.coverImage.url" as const;
export const TRAVEL_PH_NEXT_DATA_TITLE_PATH = "props.pageProps.data.article.title" as const;
export const TRAVEL_PH_NEXT_DATA_CONTENT_PATH = "props.pageProps.data.article.content" as const;

const NEXT_DATA_RE = /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

type TravelPhArticle = {
  title?: unknown;
  content?: unknown;
  body?: unknown;
  coverImage?: { url?: unknown };
  author?: { name?: unknown } | null;
  date?: unknown;
  publishedAt?: unknown;
};

function parseNextData(html: string): unknown | null {
  const m = html.match(NEXT_DATA_RE);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function articleFromNextData(data: unknown): TravelPhArticle | null {
  const article = (data as { props?: { pageProps?: { data?: { article?: unknown } } } })?.props
    ?.pageProps?.data?.article;
  if (!article || typeof article !== "object") return null;
  return article as TravelPhArticle;
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}

export function extractTravelPhArticleFromHtml(html: string): TravelPhArticle | null {
  return articleFromNextData(parseNextData(html));
}

export function extractTravelPhCoverUrl(html: string): string | null {
  const url = extractTravelPhArticleFromHtml(html)?.coverImage?.url;
  return isHttpUrl(url) ? url.trim() : null;
}

export function extractTravelPhTitle(html: string): string | null {
  const t = extractTravelPhArticleFromHtml(html)?.title;
  if (typeof t !== "string") return null;
  const n = normalizeTitleText(t);
  return n || null;
}

function extractIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

/** List: prefer path-relative article links; avoid emotion hash as sole authority. */
export function parseTravelPhilippinesListPage(
  html: string,
  pageUrl: string
): { items: ParsedListItem[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);
  const items: ParsedListItem[] = [];
  const seen = new Set<string>();

  $('a[href*="/articles/"]').each((_, el) => {
    let href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("../../")) href = href.replace(/^\.\.\/\.\.\//, "/");
    const abs = resolveCrawlUrl(pageUrl, href);
    if (!abs) return;
    try {
      const u = new URL(abs);
      if (!u.pathname.includes("/articles/")) return;
      if (u.pathname.includes("/category/")) return;
      if (seen.has(abs)) return;
      seen.add(abs);
      items.push({ detailUrl: abs, sourcePostId: extractIdFromUrl(abs) });
    } catch {
      /* skip */
    }
  });

  if (items.length === 0) {
    throw new CommunityCrawlError("LIST_SELECTOR_EMPTY", "No Travel Philippines article links found");
  }
  return { items, nextPageUrl: null };
}

export function parseTravelPhilippinesDetailPage(html: string, pageUrl: string): ParsedDetail {
  const article = extractTravelPhArticleFromHtml(html);
  let title = article?.title && typeof article.title === "string" ? normalizeTitleText(article.title) : "";
  if (!title) {
    const $ = cheerio.load(html);
    title = normalizeTitleText($("h1").first().text() || $("h2").first().text());
  }
  if (!title) {
    throw new CommunityCrawlError("TITLE_MISSING", "Travel PH article title missing");
  }

  let contentHtml = "";
  if (typeof article?.content === "string" && article.content.trim()) {
    contentHtml = article.content;
  } else if (typeof article?.body === "string" && article.body.trim()) {
    contentHtml = article.body;
  } else {
    const $ = cheerio.load(html);
    const el = $("article").first().length ? $("article").first() : $("main").first();
    contentHtml = el.html() ?? "";
  }
  if (!contentHtml.trim()) {
    throw new CommunityCrawlError("CONTENT_MISSING", "Travel PH article content missing");
  }

  const { content: contentMarkdown, imageUrls } = htmlFragmentToCommunityMarkdown(contentHtml, pageUrl);
  if (!contentMarkdown.trim()) {
    throw new CommunityCrawlError("CONTENT_MISSING", "Travel PH content empty after normalize");
  }

  const canonicalCover = isHttpUrl(article?.coverImage?.url)
    ? String(article!.coverImage!.url).trim()
    : null;

  const coverCandidateUrls = extractCoverCandidateLadder({
    pageUrl,
    html,
    canonicalCoverUrl: canonicalCover,
    articleBodyImageUrls: imageUrls,
  });
  const cover = coverCandidateUrls[0] ?? null;

  const authorName =
    article?.author && typeof article.author === "object" && typeof article.author.name === "string"
      ? article.author.name.trim() || null
      : null;

  const dateRaw =
    (typeof article?.publishedAt === "string" && article.publishedAt) ||
    (typeof article?.date === "string" && article.date) ||
    null;

  return {
    title,
    contentHtml,
    contentMarkdown,
    author: authorName,
    dateRaw,
    viewRaw: null,
    bodyImageUrls: imageUrls,
    representativeImageUrl: cover,
    coverCandidateUrls,
    sourcePostId: extractIdFromUrl(pageUrl),
  };
}
