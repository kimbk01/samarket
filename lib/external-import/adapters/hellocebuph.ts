import * as cheerio from "cheerio";
import type { DetailDocument, DocumentNode, ExternalBoardDef, ListArticle, SiteAdapter } from "../types";

const SITE_KEY = "hellocebuph";
const BASE = "https://hellocebuph.com";
const WP_API = `${BASE}/wp-json/wp/v2`;

/** Site-specific only — never reuse as generic fallback for other sites. */
export const HELLO_CEBU_THUMB_RULE =
  "featured_media_else_first_content_img_excluding_logo_avatar_emoji";

export const helloCebuBoards: ExternalBoardDef[] = [
  {
    siteKey: SITE_KEY,
    boardKey: "wp_posts_all",
    name: "전체 게시물",
    listUrl: `${WP_API}/posts?per_page=12&_embed=1`,
    topicHint: "cebu",
    capabilities: {
      supportsRecent: true,
      supportsPageRange: false,
      supportsDateRange: true,
      recentCounts: [10, 20, 50],
    },
  },
];

type WpPost = {
  id: number;
  link: string;
  date?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  featured_media?: number;
  author?: number;
  _embedded?: {
    author?: Array<{ name?: string }>;
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
  };
};

function stripHtml(html: string): string {
  return cheerio.load(html).text().replace(/\s+/g, " ").trim();
}

function abs(url: string): string {
  try {
    return new URL(url, BASE).toString();
  } catch {
    return url;
  }
}

const DECORATIVE = ["logo", "avatar", "emoji", "gravatar", "wp-smiley", "icon"];

function extractContentImages(html: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("img").each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src");
    if (!src) return;
    const u = abs(src);
    const low = u.toLowerCase();
    if (DECORATIVE.some((d) => low.includes(d))) return;
    if (!out.includes(u)) out.push(u);
  });
  return out;
}

function decodeEntities(s: string): string {
  return cheerio.load(`<textarea>${s}</textarea>`)("textarea").text();
}

function resolveThumbnail(p: WpPost, bodyImages: string[]): {
  thumbnailUrl: string | null;
  ruleApplied: "featured_media" | "first_content_img" | "none";
} {
  const featured = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null;
  if (featured) return { thumbnailUrl: abs(featured), ruleApplied: "featured_media" };
  if (bodyImages[0]) return { thumbnailUrl: bodyImages[0], ruleApplied: "first_content_img" };
  return { thumbnailUrl: null, ruleApplied: "none" };
}

function buildNodesFromWpHtml(html: string): DocumentNode[] {
  const $ = cheerio.load(html);
  const nodes: DocumentNode[] = [];
  $("body")
    .children()
    .addBack()
    .find("h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,figure")
    .each((_, el) => {
      const tag = (el as { tagName?: string }).tagName?.toLowerCase?.() || "";
      const $el = $(el);
      if (/^h[1-6]$/.test(tag)) {
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text) nodes.push({ type: "heading", text, level: Number(tag[1]) });
        return;
      }
      if (tag === "p") {
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text) nodes.push({ type: "paragraph", text });
        return;
      }
      if (tag === "ul" || tag === "ol") {
        const items: string[] = [];
        $el.find("> li").each((__, li) => {
          const t = $(li).text().replace(/\s+/g, " ").trim();
          if (t) items.push(t);
        });
        if (items.length) nodes.push({ type: "list", ordered: tag === "ol", items });
        return;
      }
      if (tag === "blockquote") {
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text) nodes.push({ type: "quote", text });
        return;
      }
      if (tag === "figure") {
        const src = $el.find("img").attr("src") || $el.find("img").attr("data-src");
        const caption = $el.find("figcaption").text().replace(/\s+/g, " ").trim();
        if (src) {
          const u = abs(src);
          const low = u.toLowerCase();
          if (!DECORATIVE.some((d) => low.includes(d))) {
            nodes.push({ type: "image", src: u, caption: caption || undefined });
            if (caption) nodes.push({ type: "caption", text: caption });
          }
        }
      }
    });
  return nodes;
}

export function parseHelloCebuWpList(jsonText: string): ListArticle[] {
  const posts = JSON.parse(jsonText) as WpPost[];
  if (!Array.isArray(posts)) return [];
  return posts.map((p) => {
    const bodyImages = extractContentImages(p.content?.rendered ?? "");
    const thumb = resolveThumbnail(p, bodyImages);
    const author = p._embedded?.author?.[0]?.name ?? null;
    return {
      externalArticleKey: String(p.id),
      canonicalUrl: p.link,
      title: decodeEntities(p.title?.rendered ?? "").trim(),
      author,
      sourcePublishedAt: p.date ?? null,
      thumbnailUrl: thumb.thumbnailUrl,
      listPage: 1,
    };
  });
}

export function parseHelloCebuWpDetail(jsonText: string): DetailDocument {
  const p = JSON.parse(jsonText) as WpPost;
  const bodyHtml = p.content?.rendered ?? "";
  const bodyImages = extractContentImages(bodyHtml);
  const thumb = resolveThumbnail(p, bodyImages);
  const author = p._embedded?.author?.[0]?.name ?? null;
  const nodes = buildNodesFromWpHtml(`<body>${bodyHtml}</body>`);

  return {
    externalArticleKey: String(p.id),
    canonicalUrl: p.link,
    title: decodeEntities(p.title?.rendered ?? "").trim(),
    author,
    sourcePublishedAt: p.date ?? null,
    bodyHtml,
    bodyText: stripHtml(bodyHtml),
    thumbnailUrl: thumb.thumbnailUrl,
    bodyImageUrls: bodyImages,
    galleryImageUrls: [],
    nodes,
    mediaMeta: {
      thumbnailAuthority: `${HELLO_CEBU_THUMB_RULE}:${thumb.ruleApplied}`,
      bodyImageSelector: "WP content img excluding decorative",
      gallerySelector: "none_site_specific",
      decorativeExclusions: DECORATIVE,
    },
  };
}

export const helloCebuAdapter: SiteAdapter = {
  site: {
    countryCode: "PH",
    siteKey: SITE_KEY,
    name: "Hello Cebu",
    baseUrl: BASE,
    engine: "cheerio",
    adapterKey: "hellocebuph",
  },

  listBoards() {
    return helloCebuBoards;
  },

  fetchArticleList({ html }) {
    return parseHelloCebuWpList(html);
  },

  fetchArticleDetail({ html }) {
    return parseHelloCebuWpDetail(html);
  },
};

export function helloCebuDetailApiUrl(postId: string): string {
  return `${WP_API}/posts/${encodeURIComponent(postId)}?_embed=1`;
}

export function helloCebuListApiUrl(perPage = 12): string {
  return `${WP_API}/posts?per_page=${perPage}&_embed=1`;
}

/** Probe thumb rule across list posts for CUT evidence. */
export function classifyHelloCebuThumbCases(jsonText: string): {
  featured: string[];
  firstContent: string[];
  none: string[];
} {
  const posts = JSON.parse(jsonText) as WpPost[];
  const featured: string[] = [];
  const firstContent: string[] = [];
  const none: string[] = [];
  for (const p of posts) {
    const bodyImages = extractContentImages(p.content?.rendered ?? "");
    const thumb = resolveThumbnail(p, bodyImages);
    const id = String(p.id);
    if (thumb.ruleApplied === "featured_media") featured.push(id);
    else if (thumb.ruleApplied === "first_content_img") firstContent.push(id);
    else none.push(id);
  }
  return { featured, firstContent, none };
}
