/**
 * Bureau of Immigration — Advisory category only (WP category id=9).
 * Excludes procurement/BAC content by category filter.
 */
import type { ExternalBoardAdapter, ExternalBoardAdapterContext } from "@/lib/external-board-import/adapters/types";
import {
  normalizeDiscoverOpts,
  withinDateRange,
  type ExternalBoardDiscoverOpts,
} from "@/lib/external-board-import/extraction/discover-opts";
import { buildDocumentFromHtml } from "@/lib/external-board-import/extraction/ordered-from-html";
import { parseExternalBoardSourceDate } from "@/lib/external-board-import/extraction/parse-source-date";
import type { ExternalBoardDiscoverItem, ExternalBoardDocument } from "@/lib/external-board-import/types";

const HOST = "immigration.gov.ph";
const ADVISORY_CATEGORY_ID = 9;

type WpPost = {
  id: number;
  date?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  featured_media?: number;
  _embedded?: {
    author?: Array<{ name?: string }>;
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
  };
};

function stripHtml(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function documentFromPost(post: WpPost): ExternalBoardDocument | null {
  const title = stripHtml(post.title?.rendered || `Advisory ${post.id}`);
  const link = String(post.link ?? "").trim();
  if (!link) return null;
  const html = `<div id="bi-advisory-root">${post.content?.rendered || ""}</div>`;
  const doc = buildDocumentFromHtml({
    title,
    canonicalUrl: link,
    html,
    baseUrl: link,
    rootSelector: "#bi-advisory-root",
  });
  if (!doc.nodes.length) {
    const text = stripHtml(post.content?.rendered || "");
    if (!text) return null;
    doc.nodes.push({ type: "paragraph", text });
  }
  const feed =
    String(post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? "").trim() || null;
  return { ...doc, feedThumbnailSrc: feed };
}

export const biAdvisoryAdapter: ExternalBoardAdapter = {
  id: "bi-advisory",
  matches: (ctx: ExternalBoardAdapterContext) => {
    if (!(ctx.siteKey.includes(HOST) || ctx.sourceUrl.includes(HOST))) return false;
    // Accept advisory list URL or category advisory path
    return (
      /advisory/i.test(ctx.sourceUrl) ||
      /categories=9|category\/advisory/i.test(ctx.sourceUrl) ||
      ctx.boardKey.includes("advisory")
    );
  },
  async verifyBoard(ctx) {
    const samples = await this.discoverArticles(ctx, { limit: 3, pageFrom: 1, pageTo: 1 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 2) return { status: "READY", reasons: ["bi_advisory_ready"], samples: withDocs };
    if (withDocs.length > 0) return { status: "PARTIAL", reasons: ["bi_advisory_partial"], samples: withDocs };
    return { status: "UNSUPPORTED", reasons: ["bi_advisory_no_samples"], samples: [] };
  },
  async discoverArticles(_ctx, opts?: ExternalBoardDiscoverOpts) {
    const n = normalizeDiscoverOpts(opts);
    const collected: ExternalBoardDiscoverItem[] = [];
    for (let page = n.pageFrom; page <= n.pageTo && collected.length < n.limit; page += 1) {
      const remaining = n.limit - collected.length;
      const url =
        `https://immigration.gov.ph/wp-json/wp/v2/posts` +
        `?categories=${ADVISORY_CATEGORY_ID}&per_page=${Math.min(20, remaining)}&page=${page}&_embed=1`;
      const posts = (await fetchJson<WpPost[]>(url)) ?? [];
      if (!posts.length) break;
      for (const post of posts) {
        const link = String(post.link ?? "").trim();
        if (!link) continue;
        const title = stripHtml(post.title?.rendered || `Advisory ${post.id}`);
        const sourcePublishedAt = parseExternalBoardSourceDate(post.date || null);
        if (!withinDateRange(sourcePublishedAt, n.dateFrom, n.dateTo)) continue;
        const doc = documentFromPost(post);
        collected.push({
          stableArticleIdentity: `stable:bi-advisory-${post.id}`,
          identityKind: "stable_id",
          canonicalUrl: link,
          title,
          sourceAuthor:
            String(post._embedded?.author?.[0]?.name ?? "").trim() || "Bureau of Immigration",
          sourcePublishedAt,
          sampleDocument: doc,
          sourcePage: page,
          sourceSequence: collected.length,
          visitedListUrl: url,
        });
        if (collected.length >= n.limit) break;
      }
    }
    return collected;
  },
  async fetchArticleDocument(_ctx, item) {
    const m = item.canonicalUrl.match(/immigration\.gov\.ph\/([^/?#]+)/i);
    const slug = m?.[1];
    if (slug) {
      const found = await fetchJson<WpPost[]>(
        `https://immigration.gov.ph/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`
      );
      if (Array.isArray(found) && found[0]) {
        const doc = documentFromPost(found[0]);
        if (doc) return doc;
      }
    }
    if (item.sampleDocument) return item.sampleDocument;
    throw Object.assign(new Error("bi_fetch_empty"), {
      failureStage: "fetch",
      failureCode: "empty_document",
    });
  },
};
