/**
 * NCCA Talapamana — announcements/articles (not cultural-property DB rows).
 */
import * as cheerio from "cheerio";
import type { ExternalBoardAdapter, ExternalBoardAdapterContext } from "@/lib/external-board-import/adapters/types";
import {
  normalizeDiscoverOpts,
  withinDateRange,
  type ExternalBoardDiscoverOpts,
} from "@/lib/external-board-import/extraction/discover-opts";
import { buildDocumentFromHtml } from "@/lib/external-board-import/extraction/ordered-from-html";
import { parseExternalBoardSourceDate } from "@/lib/external-board-import/extraction/parse-source-date";
import type { ExternalBoardDiscoverItem, ExternalBoardDocument } from "@/lib/external-board-import/types";

const LIST_URL = "https://www.talapamana.ncca.gov.ph/index.php/announcements/articles";
const HOST = "talapamana.ncca.gov.ph";

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function listArticles(html: string, baseUrl: string): Array<{ href: string; title: string }> {
  const $ = cheerio.load(html);
  const out: Array<{ href: string; title: string }> = [];
  const seen = new Set<string>();
  $('a[href*="/announcements/articles/"]').each((_, a) => {
    const hrefRaw = String($(a).attr("href") || "").trim();
    if (!hrefRaw) return;
    const href = new URL(hrefRaw, baseUrl).toString();
    if (href.endsWith("/articles") || href.endsWith("/articles/")) return;
    const title = $(a).text().replace(/\s+/g, " ").trim();
    if (!title || /^read$/i.test(title)) return;
    if (seen.has(href)) return;
    seen.add(href);
    out.push({ href, title });
  });
  return out;
}

async function fetchDetail(url: string, titleHint: string): Promise<{
  title: string;
  sourcePublishedAt: string | null;
  document: ExternalBoardDocument | null;
}> {
  const html = await fetchHtml(url);
  if (!html) return { title: titleHint, sourcePublishedAt: null, document: null };
  const $ = cheerio.load(html);
  const title =
    $("h1, .page-header h2, .article-title").first().text().replace(/\s+/g, " ").trim() || titleHint;
  const dateRaw =
    $("time").attr("datetime") ||
    $("time").first().text() ||
    $(".published, .create").first().text();
  const sourcePublishedAt = parseExternalBoardSourceDate(dateRaw || null);
  const doc = buildDocumentFromHtml({
    title,
    canonicalUrl: url,
    html,
    baseUrl: url,
    rootSelector: "article, .item-page, .article-fulltext, .entry-content, main",
  });
  const og = $('meta[property="og:image"]').attr("content");
  if (og) doc.feedThumbnailSrc = String(og).trim();
  return { title, sourcePublishedAt, document: doc.nodes.length ? doc : null };
}

export const nccaTalapamanaArticlesAdapter: ExternalBoardAdapter = {
  id: "ncca-talapamana-articles",
  matches: (ctx: ExternalBoardAdapterContext) =>
    ctx.siteKey.includes(HOST) || ctx.sourceUrl.includes(HOST),
  async verifyBoard(ctx) {
    const samples = await this.discoverArticles(ctx, { limit: 3, pageFrom: 1, pageTo: 1 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 2) return { status: "READY", reasons: ["ncca_talapamana_ready"], samples: withDocs };
    if (withDocs.length > 0) return { status: "PARTIAL", reasons: ["ncca_talapamana_partial"], samples: withDocs };
    return { status: "UNSUPPORTED", reasons: ["ncca_talapamana_no_samples"], samples: [] };
  },
  async discoverArticles(_ctx, opts?: ExternalBoardDiscoverOpts) {
    const n = normalizeDiscoverOpts(opts);
    const collected: ExternalBoardDiscoverItem[] = [];
    const pageSize = 10;
    for (let page = n.pageFrom; page <= n.pageTo && collected.length < n.limit; page += 1) {
      const start = Math.max(0, (page - 1) * pageSize);
      const listUrl = start > 0 ? `${LIST_URL}?start=${start}` : LIST_URL;
      const html = await fetchHtml(listUrl);
      if (!html) break;
      const listed = listArticles(html, listUrl);
      if (!listed.length) break;
      for (const item of listed) {
        if (collected.length >= n.limit) break;
        const detail = await fetchDetail(item.href, item.title);
        if (!withinDateRange(detail.sourcePublishedAt, n.dateFrom, n.dateTo)) continue;
        collected.push({
          stableArticleIdentity: `stable:ncca-talapamana:${item.href}`,
          identityKind: "stable_id",
          canonicalUrl: item.href,
          title: detail.title,
          sourceAuthor: "NCCA Talapamana",
          sourcePublishedAt: detail.sourcePublishedAt,
          sampleDocument: detail.document,
          sourcePage: page,
          sourceSequence: collected.length,
          visitedListUrl: listUrl,
        });
      }
    }
    return collected;
  },
  async fetchArticleDocument(_ctx, item) {
    const detail = await fetchDetail(item.canonicalUrl, item.title);
    if (detail.document) return detail.document;
    if (item.sampleDocument) return item.sampleDocument;
    throw Object.assign(new Error("ncca_fetch_empty"), {
      failureStage: "fetch",
      failureCode: "empty_document",
    });
  },
};
