/**
 * DOT (tourism.gov.ph) destination CPT — Central Visayas section first.
 * List = child destinations of Central Visayas via WP REST.
 * Detail text = destination content.rendered (paragraphs).
 * Featured media = Feed thumbnail only (never auto-copied into body).
 * Body/gallery images = HTML `.content-gallery-main__gallery` (proven on Mandaue).
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
import type { ExternalBoardDiscoverItem, ExternalBoardDocument, ExternalBoardNode } from "@/lib/external-board-import/types";

const DOT_HOST = "tourism.gov.ph";
const CENTRAL_VISAYAS_PARENT_ID = 1950;
const CENTRAL_VISAYAS_PATH = "/destination/central-visayas";

type WpDestination = {
  id: number;
  date?: string;
  modified?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  featured_media?: number;
};

type WpMedia = {
  source_url?: string;
  media_details?: { sizes?: Record<string, { source_url?: string }> };
};

function stripHtml(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isDotCentralVisayasSource(ctx: ExternalBoardAdapterContext): boolean {
  if (ctx.siteKey !== DOT_HOST && !ctx.sourceUrl.includes(DOT_HOST)) return false;
  try {
    const path = new URL(ctx.sourceUrl).pathname.replace(/\/$/, "") || "/";
    return path === CENTRAL_VISAYAS_PATH || path.startsWith(`${CENTRAL_VISAYAS_PATH}/`);
  } catch {
    return ctx.boardKey.includes(CENTRAL_VISAYAS_PATH);
  }
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

function normalizeMediaKey(src: string): string {
  return String(src)
    .trim()
    .toLowerCase()
    .replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1")
    .replace(/-scaled(\.[a-z0-9]+)$/i, "$1");
}

/**
 * Proven gallery authority on tourism.gov.ph destination pages:
 * `.content-gallery-main__gallery` / lightbox href + img.
 */
export function extractDotContentGalleryImages(html: string): Array<{ src: string; alt: string }> {
  const $ = cheerio.load(html);
  const out: Array<{ src: string; alt: string }> = [];
  const seen = new Set<string>();
  $(".content-gallery-main__gallery-item").each((_, item) => {
    const $item = $(item);
    const $a = $item.find("a[href], a[data-pswp-src]").first();
    const $img = $item.find("img[src]").first();
    const src = String($a.attr("href") || $a.attr("data-pswp-src") || $img.attr("src") || "").trim();
    if (!src || !/^https?:\/\//i.test(src)) return;
    if (/logo|icon|partner|fluentcom|button/i.test(src)) return;
    const key = normalizeMediaKey(src);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ src, alt: String($img.attr("alt") || "").trim() });
  });
  return out;
}

async function resolveFeaturedMediaUrl(featuredMediaId: number | undefined): Promise<string | null> {
  const id = Number(featuredMediaId ?? 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  const media = await fetchJson<WpMedia>(`https://www.tourism.gov.ph/wp-json/wp/v2/media/${id}`);
  const src =
    String(media?.source_url ?? "").trim() ||
    String(media?.media_details?.sizes?.large?.source_url ?? "").trim() ||
    String(media?.media_details?.sizes?.medium_large?.source_url ?? "").trim() ||
    String(media?.media_details?.sizes?.medium?.source_url ?? "").trim();
  return src || null;
}

async function documentFromDestination(post: WpDestination): Promise<ExternalBoardDocument | null> {
  const title = stripHtml(post.title?.rendered || `Destination ${post.id}`);
  const link = String(post.link ?? "").trim();
  if (!link) return null;
  const html = `<div id="dot-destination-root">${post.content?.rendered || ""}</div>`;
  const doc = buildDocumentFromHtml({
    title,
    canonicalUrl: link,
    html,
    baseUrl: link,
    rootSelector: "#dot-destination-root",
  });
  if (!doc.nodes.length) {
    const text = stripHtml(post.content?.rendered || "");
    if (!text) return null;
    doc.nodes.push({ type: "paragraph", text });
  }

  const feedThumbnailSrc = await resolveFeaturedMediaUrl(post.featured_media);

  // Gallery from live HTML — separate from feedThumbnailSrc (LOCK 5).
  const pageHtml = await fetchHtml(link);
  if (pageHtml) {
    const gallery = extractDotContentGalleryImages(pageHtml);
    const galleryNodes: ExternalBoardNode[] =
      gallery.length === 1
        ? [{ type: "image", src: gallery[0]!.src, alt: gallery[0]!.alt || undefined, role: "gallery" }]
        : gallery.length > 1
          ? [
              {
                type: "gallery",
                images: gallery.map((g) => ({
                  src: g.src,
                  alt: g.alt || undefined,
                  role: "gallery" as const,
                })),
              },
            ]
          : [];
    doc.nodes.push(...galleryNodes);
  }

  return { ...doc, feedThumbnailSrc };
}

async function listCentralVisayasChildren(page: number, perPage: number): Promise<WpDestination[]> {
  const url =
    `https://www.tourism.gov.ph/wp-json/wp/v2/destination` +
    `?parent=${CENTRAL_VISAYAS_PARENT_ID}&per_page=${perPage}&page=${page}&orderby=title&order=asc`;
  const data = await fetchJson<WpDestination[]>(url);
  return Array.isArray(data) ? data : [];
}

export const dotTourismDestinationAdapter: ExternalBoardAdapter = {
  id: "dot-tourism-destination",
  matches: isDotCentralVisayasSource,
  async verifyBoard(ctx) {
    if (!isDotCentralVisayasSource(ctx)) {
      return { status: "UNSUPPORTED", reasons: ["dot_section_not_central_visayas"], samples: [] };
    }
    const samples = await this.discoverArticles(ctx, { limit: 3, pageFrom: 1, pageTo: 1 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 3) return { status: "READY", reasons: ["dot_central_visayas_ready"], samples: withDocs };
    if (withDocs.length > 0) return { status: "PARTIAL", reasons: ["dot_central_visayas_partial"], samples: withDocs };
    return { status: "UNSUPPORTED", reasons: ["dot_central_visayas_no_samples"], samples: [] };
  },
  async discoverArticles(ctx, opts?: ExternalBoardDiscoverOpts) {
    if (!isDotCentralVisayasSource(ctx)) return [];
    const n = normalizeDiscoverOpts(opts);
    const collected: ExternalBoardDiscoverItem[] = [];
    for (let page = n.pageFrom; page <= n.pageTo && collected.length < n.limit; page += 1) {
      const remaining = n.limit - collected.length;
      const posts = await listCentralVisayasChildren(page, Math.min(20, remaining));
      if (!posts.length) break;
      for (const post of posts) {
        const link = String(post.link ?? "").trim();
        if (!link) continue;
        const title = stripHtml(post.title?.rendered || `Destination ${post.id}`);
        const sourcePublishedAt = parseExternalBoardSourceDate(post.date || post.modified || null);
        if (!withinDateRange(sourcePublishedAt, n.dateFrom, n.dateTo)) continue;
        const doc = await documentFromDestination(post);
        collected.push({
          stableArticleIdentity: `stable:dot-destination-${post.id}`,
          identityKind: "stable_id",
          canonicalUrl: link,
          title,
          sourceAuthor: "Department of Tourism",
          sourcePublishedAt,
          sampleDocument: doc,
          sourcePage: page,
          sourceSequence: collected.length,
          visitedListUrl: `https://www.tourism.gov.ph/wp-json/wp/v2/destination?parent=${CENTRAL_VISAYAS_PARENT_ID}&page=${page}`,
        });
        if (collected.length >= n.limit) break;
      }
    }
    return collected;
  },
  async fetchArticleDocument(_ctx, item) {
    const m = item.canonicalUrl.match(/\/destination\/(?:[^/]+\/)*([^/]+)\/?$/);
    const slugHint = m?.[1];
    const searchUrl =
      `https://www.tourism.gov.ph/wp-json/wp/v2/destination?slug=${encodeURIComponent(slugHint || "")}&per_page=1`;
    const found = slugHint ? await fetchJson<WpDestination[]>(searchUrl) : null;
    const post = Array.isArray(found) && found[0] ? found[0] : null;
    if (post) {
      const doc = await documentFromDestination(post);
      if (doc) return doc;
    }
    if (item.sampleDocument?.nodes?.length) return item.sampleDocument;
    throw Object.assign(new Error("dot_fetch_empty"), {
      failureStage: "fetch",
      failureCode: "empty_document",
    });
  },
};
