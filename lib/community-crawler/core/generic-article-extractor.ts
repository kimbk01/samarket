import * as cheerio from "cheerio";
import type { ParsedDetail, ParsedListItem } from "@/lib/community-crawler/adapters/generic-html";
import { CommunityCrawlError } from "@/lib/community-crawler/core/errors";
import {
  htmlFragmentToCommunityMarkdown,
  normalizeTitleText,
} from "@/lib/community-crawler/core/html-to-community-markdown";
import { resolveCrawlUrl } from "@/lib/community-crawler/core/safe-url";
import { extractCoverCandidateLadder } from "@/lib/community-crawler/media/cover-candidate-ladder";

type CheerioRoot = ReturnType<typeof cheerio.load>;

/**
 * FAIL-CLOSED LOCK:
 * 1. Do NOT permanently reject possible articles only because their URL contains /category/.
 *    URL patterns are signals, not article truth. Article identity is confirmed by fetch -> detail validation.
 * 2. Pagination must NOT invent URLs by blindly incrementing ?page= or ?p=.
 *    Follow only pagination evidence actually supplied by source HTML (rel=next or actual pagination DOM link).
 * 3. JS-rendered source: if usable article content cannot be obtained from server HTML,
 *    classify UNSUPPORTED_JS.
 */

const EXCLUDED_PATH_PREFIXES = [
  "/wp-login",
  "/wp-admin",
  "/login",
  "/logout",
  "/signin",
  "/signout",
  "/signup",
  "/register",
  "/cart",
  "/checkout",
  "/my-account",
  "/account",
  "/search",
  "/feed",
  "/rss",
  "/sitemap",
  "/terms",
  "/privacy",
  "/contact",
  "/about",
];

const STATIC_EXT_REGEX = /\.(css|js|json|xml|pdf|zip|rar|tar|gz|exe|apk|ipa|dmg|iso|mp3|mp4|avi|mov|svg|ico)$/i;

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
  "instagram.com",
  "www.instagram.com",
  "youtube.com",
  "www.youtube.com",
  "linkedin.com",
  "www.linkedin.com",
  "pinterest.com",
  "www.pinterest.com",
  "github.com",
  "www.github.com",
  "t.me",
  "telegram.org",
  "play.google.com",
  "apps.apple.com",
]);

function extractJsonLdBlocks($: CheerioRoot): unknown[] {
  const blocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() ?? "";
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        blocks.push(...parsed);
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray((parsed as Record<string, unknown>)["@graph"])) {
          blocks.push(...((parsed as Record<string, unknown>)["@graph"] as unknown[]));
        } else {
          blocks.push(parsed);
        }
      }
    } catch {
      // ignore invalid json-ld
    }
  });
  return blocks;
}

export function extractIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const m = last.match(/(\d{3,})/);
    if (m) return m[1]!;
    if (last && last.length < 120) return last;
    const queryId = u.searchParams.get("id") || u.searchParams.get("post") || u.searchParams.get("p");
    if (queryId) return queryId;
    return null;
  } catch {
    return null;
  }
}

/**
 * Step A: List Page Discovery
 * JSON-LD ItemList -> Semantic Containers -> URL clustering.
 */
export function extractArticlesFromListPage(
  html: string,
  pageUrl: string
): { items: ParsedListItem[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);
  const pageObj = new URL(pageUrl);
  const pageOrigin = pageObj.origin;

  const candidateUrls = new Set<string>();

  // 1. JSON-LD ItemList / CollectionPage discovery
  const jsonLdBlocks = extractJsonLdBlocks($);
  for (const block of jsonLdBlocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const type = String(b["@type"] ?? "");
    if (type.toLowerCase().includes("itemlist") || type.toLowerCase().includes("collectionpage")) {
      const list = b.itemListElement;
      if (Array.isArray(list)) {
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const it = item as Record<string, unknown>;
          const directUrl = typeof it.url === "string" ? it.url : null;
          const nestedUrl =
            it.item && typeof it.item === "object" && typeof (it.item as Record<string, unknown>).url === "string"
              ? ((it.item as Record<string, unknown>).url as string)
              : null;
          const found = directUrl || nestedUrl;
          if (found) {
            const abs = resolveCrawlUrl(pageUrl, found);
            if (abs && isValidArticleCandidateUrl(abs, pageOrigin)) {
              candidateUrls.add(abs);
            }
          }
        }
      }
    }
  }

  // 1.5 Server-rendered hydration data (__NEXT_DATA__ / Nuxt / SSR)
  const nextDataMatch = html.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch?.[1]) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      const p = parsed?.props?.pageProps;
      const articles = p?.data?.articles || p?.articles || p?.posts || p?.items;
      if (Array.isArray(articles)) {
        for (const item of articles) {
          const slug = item?.slug || item?.id;
          if (slug) {
            const pathPrefix = pageObj.pathname.includes("/articles") ? "/articles/" : "/";
            const candidateUrl = new URL(`${pathPrefix}${slug}`, pageOrigin).toString();
            candidateUrls.add(candidateUrl);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. DOM anchor discovery: scan semantic content areas first, then page
  const containerSelectors = [
    "main",
    "article",
    '[role="feed"]',
    '[role="main"]',
    ".post-list",
    ".article-list",
    ".board-list",
    ".list-group",
    ".entries",
    ".posts",
    ".articles",
    "#content",
    ".content",
    "table tbody",
  ];

  let foundInContainers = false;
  for (const sel of containerSelectors) {
    const $container = $(sel);
    if ($container.length === 0) continue;
    $container.find("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = resolveCrawlUrl(pageUrl, href);
      if (abs && isValidArticleCandidateUrl(abs, pageOrigin)) {
        candidateUrls.add(abs);
        foundInContainers = true;
      }
    });
  }

  // If containers yielded few or no candidates, scan body anchors
  if (candidateUrls.size < 3) {
    $("body a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = resolveCrawlUrl(pageUrl, href);
      if (abs && isValidArticleCandidateUrl(abs, pageOrigin)) {
        candidateUrls.add(abs);
      }
    });
  }

  // Filter out the current list page itself
  candidateUrls.delete(pageUrl);
  candidateUrls.delete(pageUrl.replace(/\/$/, ""));
  candidateUrls.delete(`${pageUrl}/`);

  // Convert candidates to list items
  const items: ParsedListItem[] = Array.from(candidateUrls).map((detailUrl) => ({
    detailUrl,
    sourcePostId: extractIdFromUrl(detailUrl),
  }));

  if (items.length === 0) {
    // Check if this looks like an empty client-side SPA
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    if (bodyText.length < 50 && ($("#__next").length || $("#root").length || $("#app").length)) {
      throw new CommunityCrawlError("UNSUPPORTED_JS", "Client-side SPA shell without server-rendered list items");
    }
    throw new CommunityCrawlError("LIST_DISCOVERY_EMPTY", "No article links discovered on page");
  }

  // 3. Proven Pagination Link Extraction (FAIL-CLOSED LOCK)
  let nextPageUrl: string | null = null;

  // Look for rel="next" in <link> or <a>
  const relNextHref = $('link[rel="next"], a[rel="next"]').first().attr("href");
  if (relNextHref) {
    nextPageUrl = resolveCrawlUrl(pageUrl, relNextHref);
  }

  // If not found, look for explicit pagination next button in DOM
  if (!nextPageUrl) {
    const nextSelectors = [
      'a[aria-label*="next" i]',
      'a[aria-label*="다음" i]',
      '.pagination .next a',
      '.pagination a.next',
      '.pager .next a',
      '.page-nav .next a',
      'a.page-next',
      'a.btn-next',
    ];
    for (const sel of nextSelectors) {
      const href = $(sel).first().attr("href");
      if (href) {
        nextPageUrl = resolveCrawlUrl(pageUrl, href);
        break;
      }
    }
  }

  // Fallback: search pagination containers for text like "다음", "Next", ">", "»"
  if (!nextPageUrl) {
    $(".pagination, .paging, .page-numbers, nav[aria-label*='pagination' i]")
      .find("a[href]")
      .each((_, el) => {
        if (nextPageUrl) return;
        const text = $(el).text().trim().toLowerCase();
        if (text === "다음" || text === "next" || text === ">" || text === "»" || text === "&gt;") {
          const href = $(el).attr("href");
          if (href) nextPageUrl = resolveCrawlUrl(pageUrl, href);
        }
      });
  }

  return { items, nextPageUrl };
}

function isValidArticleCandidateUrl(urlStr: string, allowedOrigin: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    // Reject external social media or foreign hosts
    if (SOCIAL_HOSTS.has(u.hostname.toLowerCase())) return false;
    if (u.origin !== allowedOrigin && !u.hostname.endsWith(new URL(allowedOrigin).hostname)) {
      return false;
    }

    const path = u.pathname.toLowerCase();
    // Exclude static extensions
    if (STATIC_EXT_REGEX.test(path)) return false;

    // Exclude obvious administrative / auth / feed paths
    for (const prefix of EXCLUDED_PATH_PREFIXES) {
      if (path.startsWith(prefix)) return false;
    }

    // Must have a path or query that identifies a post
    if (path === "/" || path === "") {
      if (!u.searchParams.get("id") && !u.searchParams.get("post") && !u.searchParams.get("p")) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Step B: Detail Page Semantic Extractor
 * Title -> Body -> Images -> Date -> Author
 */
export function extractArticleDetailFromHtml(
  html: string,
  pageUrl: string
): ParsedDetail {
  const $ = cheerio.load(html);
  const pageBodyText = ($("body").length ? $("body") : $("html")).text();

  // 1. JSON-LD extraction
  const jsonLdBlocks = extractJsonLdBlocks($);
  let jsonLdArticle: Record<string, unknown> | null = null;
  for (const block of jsonLdBlocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const type = String(b["@type"] ?? "").toLowerCase();
    if (type.includes("article") || type.includes("posting") || type.includes("newsarticle")) {
      jsonLdArticle = b;
      break;
    }
  }

  // 1.5 Server-rendered hydration data (__NEXT_DATA__ / Nuxt / SSR)
  let nextDataArticle: Record<string, unknown> | null = null;
  const nextDataMatch = html.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch?.[1]) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      const p = parsed?.props?.pageProps;
      const art = p?.data?.article || p?.article || p?.post || p?.data?.post;
      if (art && typeof art === "object") {
        nextDataArticle = art as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  // 2. Extract Title
  let title = "";
  if (jsonLdArticle) {
    const rawHeadline = jsonLdArticle.headline || jsonLdArticle.name;
    if (typeof rawHeadline === "string" && rawHeadline.trim()) {
      title = normalizeTitleText(rawHeadline);
    }
  }
  if (!title && nextDataArticle && typeof nextDataArticle.title === "string") {
    title = normalizeTitleText(nextDataArticle.title);
  }
  if (!title) {
    const ogTitle = $('meta[property="og:title"]').attr("content") || $('meta[name="twitter:title"]').attr("content");
    if (ogTitle?.trim()) {
      title = normalizeTitleText(ogTitle);
    }
  }
  if (!title) {
    const h1 = $("article h1, main h1, h1").first().text();
    if (h1?.trim()) {
      title = normalizeTitleText(h1);
    }
  }
  if (!title) {
    const pageTitle = $("title").first().text();
    if (pageTitle?.trim()) {
      // Strip common website suffixes: "Article Title - MySite" -> "Article Title"
      const cleaned = pageTitle.split(/\s+[-|–—]\s+/)[0] ?? pageTitle;
      title = normalizeTitleText(cleaned);
    }
  }

  if (!title) {
    throw new CommunityCrawlError("TITLE_MISSING", "Unable to extract article title");
  }

  // 3. Extract Body Content HTML
  let contentHtml = "";

  // Priority 1: Semantic article container
  const candidateSelectors = [
    "article",
    '[role="article"]',
    ".entry-content",
    ".post-content",
    ".article-content",
    ".article-body",
    ".post-body",
    ".board-content",
    ".view-content",
    ".bbs-view-content",
    "#article-body",
    "#post-content",
    "#content-body",
    "main .content",
  ];

  for (const sel of candidateSelectors) {
    const el = $(sel).first();
    if (el.length && (el.html() ?? "").trim().length > 50) {
      // Clone element to safely remove non-content sub-elements
      const clone = el.clone();
      clone.find("script, style, noscript, nav, header, footer, form, .share-buttons, .social-share, .comments, .related-posts").remove();
      const h = clone.html() ?? "";
      if (h.trim().length > 50) {
        contentHtml = h;
        break;
      }
    }
  }

  // Priority 2: JSON-LD articleBody or NextData content
  if (!contentHtml && jsonLdArticle && typeof jsonLdArticle.articleBody === "string") {
    contentHtml = `<p>${jsonLdArticle.articleBody}</p>`;
  }
  if (!contentHtml && nextDataArticle) {
    const rawContent = nextDataArticle.content || nextDataArticle.body || nextDataArticle.richTextContent;
    if (typeof rawContent === "string" && rawContent.trim()) {
      contentHtml = `<p>${rawContent.trim()}</p>`;
    }
  }

  // Priority 3: Fallback container scoring
  if (!contentHtml) {
    let bestScore = 0;
    let bestHtml = "";

    $("div, section, main").each((_, el) => {
      const $el = $(el);
      // Skip top-level body or root containers
      if ($el.is("body") || $el.is("#__next") || $el.is("#root")) return;

      const pCount = $el.find("p").length;
      const textLen = $el.text().replace(/\s+/g, " ").trim().length;
      if (textLen < 80) return;

      // Calculate link density (avoid navigation menus / link lists)
      const linkTextLen = $el.find("a").text().replace(/\s+/g, " ").trim().length;
      const linkDensity = linkTextLen / (textLen || 1);
      if (linkDensity > 0.4) return;

      const score = pCount * 100 + textLen;
      if (score > bestScore) {
        bestScore = score;
        const clone = $el.clone();
        clone.find("script, style, noscript, nav, header, footer, form").remove();
        bestHtml = clone.html() ?? "";
      }
    });

    if (bestHtml) contentHtml = bestHtml;
  }

  if (!contentHtml.trim()) {
    // Check if this is an unsupported JS rendered source
    const bodyText = pageBodyText.replace(/\s+/g, " ").trim();
    if (bodyText.length < 50 && ($("#__next").length || $("#root").length || $("#app").length)) {
      throw new CommunityCrawlError("UNSUPPORTED_JS", "Client-side SPA with no article body in server HTML");
    }
    throw new CommunityCrawlError("CONTENT_MISSING", "Unable to extract article content");
  }

  // Convert HTML to Markdown & extract body images
  const { content: contentMarkdown, imageUrls } = htmlFragmentToCommunityMarkdown(contentHtml, pageUrl);
  if (!contentMarkdown.trim() || contentMarkdown.trim().length < 20) {
    throw new CommunityCrawlError("CONTENT_MISSING", "Extracted content is too short");
  }

  // 4. Extract Author
  let author: string | null = null;
  if (jsonLdArticle) {
    const a = jsonLdArticle.author;
    if (typeof a === "string") author = a.trim();
    else if (a && typeof a === "object") {
      const name = (a as Record<string, unknown>).name;
      if (typeof name === "string") author = name.trim();
    }
  }
  if (!author && nextDataArticle) {
    const a = nextDataArticle.author;
    if (typeof a === "string") author = a.trim();
    else if (a && typeof a === "object") {
      const name = (a as Record<string, unknown>).name;
      if (typeof name === "string") author = name.trim();
    }
  }
  if (!author) {
    const metaAuthor = $('meta[name="author"]').attr("content") || $('meta[property="article:author"]').attr("content");
    if (metaAuthor?.trim()) author = metaAuthor.trim();
  }
  if (!author) {
    const byline = $(".author, .byline, [rel='author'], .writer").first().text().replace(/\s+/g, " ").trim();
    if (byline) author = byline;
  }

  // 5. Extract Date
  let dateRaw: string | null = null;
  if (jsonLdArticle) {
    const d = jsonLdArticle.datePublished || jsonLdArticle.dateCreated;
    if (typeof d === "string") dateRaw = d.trim();
  }
  if (!dateRaw && nextDataArticle) {
    const d = nextDataArticle.publishedAt || nextDataArticle.createdAt || nextDataArticle._createdAt;
    if (typeof d === "string") dateRaw = d.trim();
  }
  if (!dateRaw) {
    const metaDate = $('meta[property="article:published_time"]').attr("content") || $('meta[name="date"]').attr("content");
    if (metaDate?.trim()) dateRaw = metaDate.trim();
  }
  if (!dateRaw) {
    const timeEl = $("time").first();
    const dt = timeEl.attr("datetime") || timeEl.text();
    if (dt?.trim()) dateRaw = dt.trim();
  }

  // 6. Extract Views
  let viewRaw: string | null = null;
  const viewEl = $(".views, .hit, .read-count, .view-count").first().text().trim();
  if (viewEl) {
    viewRaw = viewEl;
  } else {
    const m = pageBodyText.match(/조회\s*([0-9,]+)/i);
    if (m?.[1]) viewRaw = m[1].replace(/,/g, "");
  }

  // 7. Extract Cover Candidate Ladder
  let canonicalCover: string | null = null;
  const ogImg = $('meta[property="og:image"]').attr("content") || $('meta[name="twitter:image"]').attr("content");
  if (ogImg) canonicalCover = resolveCrawlUrl(pageUrl, ogImg);

  if (!canonicalCover && jsonLdArticle) {
    const img = jsonLdArticle.image;
    if (typeof img === "string") canonicalCover = resolveCrawlUrl(pageUrl, img);
    else if (Array.isArray(img) && typeof img[0] === "string") {
      canonicalCover = resolveCrawlUrl(pageUrl, img[0]);
    } else if (img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string") {
      canonicalCover = resolveCrawlUrl(pageUrl, (img as Record<string, unknown>).url as string);
    }
  }
  if (!canonicalCover && nextDataArticle) {
    const coverObj = nextDataArticle.coverImage || nextDataArticle.cover;
    if (typeof coverObj === "string") canonicalCover = resolveCrawlUrl(pageUrl, coverObj);
    else if (coverObj && typeof coverObj === "object" && typeof (coverObj as Record<string, unknown>).url === "string") {
      canonicalCover = resolveCrawlUrl(pageUrl, (coverObj as Record<string, unknown>).url as string);
    }
  }

  const coverCandidateUrls = extractCoverCandidateLadder({
    pageUrl,
    html,
    canonicalCoverUrl: canonicalCover,
    articleBodyImageUrls: imageUrls,
  });
  const representativeImageUrl = coverCandidateUrls[0] ?? null;

  const sourcePostId = extractIdFromUrl(pageUrl);

  return {
    title,
    contentHtml,
    contentMarkdown,
    author,
    dateRaw,
    viewRaw,
    bodyImageUrls: imageUrls,
    representativeImageUrl,
    coverCandidateUrls,
    sourcePostId,
  };
}
