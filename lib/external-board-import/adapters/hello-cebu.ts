import * as cheerio from "cheerio";
import type { ExternalBoardAdapter, ExternalBoardAdapterContext } from "@/lib/external-board-import/adapters/types";
import { fetchExternalBoardHtml } from "@/lib/external-board-import/extraction/fetch-html";
import {
  normalizeDiscoverOpts,
  withinDateRange,
  type ExternalBoardDiscoverOpts,
} from "@/lib/external-board-import/extraction/discover-opts";
import { buildDocumentFromHtml, extractMetaAuthor, extractOgTitle } from "@/lib/external-board-import/extraction/ordered-from-html";
import { parseExternalBoardSourceDate } from "@/lib/external-board-import/extraction/parse-source-date";
import type { ExternalBoardDiscoverItem } from "@/lib/external-board-import/types";

type WpPost = {
  id: number;
  date?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  _embedded?: {
    author?: Array<{ name?: string }>;
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
  };
};

function stripHtml(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWpPosts(page: number, perPage: number): Promise<WpPost[]> {
  const url = `https://hellocebuph.com/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_embed=1`;
  const fetched = await fetchExternalBoardHtml(url);
  if (!fetched.ok) return [];
  try {
    const parsed = JSON.parse(fetched.html) as WpPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchHelloCebuArticle(item: ExternalBoardDiscoverItem): Promise<ExternalBoardDiscoverItem> {
  const fetched = await fetchExternalBoardHtml(item.canonicalUrl);
  if (!fetched.ok) return { ...item, sampleDocument: null };
  const $ = cheerio.load(fetched.html);
  const title =
    $("h1.entry-title, h1").first().text().replace(/\s+/g, " ").trim() ||
    extractOgTitle(fetched.html) ||
    item.title;
  const author =
    $(".author-name, .entry-author, a[rel='author']").first().text().replace(/\s+/g, " ").trim() ||
    extractMetaAuthor(fetched.html);
  const dateRaw =
    $("time.entry-date").attr("datetime") ||
    $("time").first().attr("datetime") ||
    $("time").first().text();
  const sourcePublishedAt = parseExternalBoardSourceDate(dateRaw || item.sourcePublishedAt || null);
  const doc = buildDocumentFromHtml({
    title,
    canonicalUrl: item.canonicalUrl,
    html: fetched.html,
    baseUrl: fetched.finalUrl,
    rootSelector: ".entry-content, .post-content, article .content",
  });
  if (!doc.nodes.length) {
    const desc = $('meta[property="og:description"]').attr("content");
    if (desc) doc.nodes.push({ type: "paragraph", text: String(desc).trim() });
  }
  const ogImage = String($('meta[property="og:image"]').attr("content") || "").trim();
  if (ogImage && !doc.feedThumbnailSrc) doc.feedThumbnailSrc = ogImage;
  return {
    ...item,
    title,
    sourceAuthor: author || null,
    sourcePublishedAt,
    sampleDocument: doc.nodes.length ? doc : null,
  };
}

export const helloCebuExternalBoardAdapter: ExternalBoardAdapter = {
  id: "hellocebuph-wordpress",
  matches: (ctx: ExternalBoardAdapterContext) =>
    ctx.siteKey === "hellocebuph.com" || ctx.sourceUrl.includes("hellocebuph.com"),
  async verifyBoard(ctx) {
    const samples = await this.discoverArticles(ctx, { limit: 3, pageFrom: 1, pageTo: 1 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 3) return { status: "READY", reasons: ["hellocebuph_ready"], samples: withDocs };
    if (withDocs.length > 0) return { status: "PARTIAL", reasons: ["hellocebuph_partial"], samples: withDocs };
    return { status: "UNSUPPORTED", reasons: ["hellocebuph_no_samples"], samples: [] };
  },
  async discoverArticles(_ctx, opts?: ExternalBoardDiscoverOpts) {
    const n = normalizeDiscoverOpts(opts);
    const collected: ExternalBoardDiscoverItem[] = [];
    for (let page = n.pageFrom; page <= n.pageTo && collected.length < n.limit; page += 1) {
      const remaining = n.limit - collected.length;
      const apiUrl = `https://hellocebuph.com/wp-json/wp/v2/posts?per_page=${Math.min(10, remaining)}&page=${page}&_embed=1`;
      const posts = await fetchWpPosts(page, Math.min(10, remaining));
      if (!posts.length) break;
      for (const post of posts) {
        const link = String(post.link ?? "").trim();
        if (!link) continue;
        const title = stripHtml(post.title?.rendered || `Post ${post.id}`);
        const sourcePublishedAt = parseExternalBoardSourceDate(post.date || null);
        if (!withinDateRange(sourcePublishedAt, n.dateFrom, n.dateTo)) continue;
        const author = post._embedded?.author?.[0]?.name || null;
        const featured = String(post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? "").trim() || null;
        const base: ExternalBoardDiscoverItem = {
          stableArticleIdentity: `stable:hellocebu-${post.id}`,
          identityKind: "stable_id",
          canonicalUrl: link,
          title,
          sourceAuthor: author,
          sourcePublishedAt,
        };
        // Prefer live HTML ordered document; fall back to WP content HTML.
        let full = await fetchHelloCebuArticle(base);
        full = {
          ...full,
          sourceAuthor: full.sourceAuthor || author,
          sourcePublishedAt: full.sourcePublishedAt || sourcePublishedAt,
        };
        if (!full.sampleDocument && post.content?.rendered) {
          const wrapped = `<div id="wp-content-root">${post.content.rendered}</div>`;
          const doc = buildDocumentFromHtml({
            title,
            canonicalUrl: link,
            html: wrapped,
            baseUrl: link,
            rootSelector: "#wp-content-root",
          });
          full = {
            ...full,
            sampleDocument: doc.nodes.length ? doc : null,
            sourceAuthor: full.sourceAuthor || author,
            sourcePublishedAt: full.sourcePublishedAt || sourcePublishedAt,
          };
        }
        if (full.sampleDocument && featured && !full.sampleDocument.feedThumbnailSrc) {
          full = {
            ...full,
            sampleDocument: { ...full.sampleDocument, feedThumbnailSrc: featured },
          };
        }
        collected.push({
          ...full,
          sourcePage: page,
          sourceSequence: collected.length,
          visitedListUrl: apiUrl,
        });
        if (collected.length >= n.limit) break;
      }
    }
    return collected;
  },
  async fetchArticleDocument(_ctx, item) {
    const full = await fetchHelloCebuArticle(item);
    if (full.sampleDocument) return full.sampleDocument;
    throw Object.assign(new Error("hellocebuph_fetch_empty"), {
      failureStage: "fetch",
      failureCode: "empty_document",
    });
  },
};
