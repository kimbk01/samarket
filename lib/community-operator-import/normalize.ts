/**
 * Common HTML → ordered content blocks normalizer (B+ NORMALIZATION layer).
 *
 * One implementation for every adapter (gnuboard / WordPress / RSS / HTML):
 * - recursive walk, so images nested at any depth are kept in reading order
 * - lazy image attributes (data-src, data-lazy-src, data-original, srcset)
 * - HTML entities decoded once (cheerio text), no `&nbsp;` leaks
 * - page chrome removed (script/style/nav/header/footer/aside/form/ads)
 *
 * No site-specific selectors live here. Site/skin differences are adapter config.
 */
import * as cheerio from "cheerio";
import type { OperatorContentBlock } from "./types";

type CheerioAPI = ReturnType<typeof cheerio.load>;
type CheerioSel = ReturnType<CheerioAPI>;
type DomNode = { type?: string; name?: string; data?: string };

const CHROME_SELECTORS =
  "script, style, noscript, iframe, form, nav, header, footer, aside, button, input, select, textarea, svg, " +
  "[role='navigation'], [aria-hidden='true'], .another_category, .container_postbtn, .revenue_unit_wrap, " +
  ".adsbygoogle, .sharedaddy, .jp-relatedposts, .wp-block-buttons, .post-navigation, .comments-area, " +
  // news-CMS footers inside the article body: reporter card, tip line, copyright notice
  ".view-copyright, .view-editors, .dn_txt, .profile-images, .article-copyright, .copyright, .reporter-info, .byline";

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "main", "figure", "center", "td", "th", "tr", "tbody", "table", "dl", "dd", "dt",
  "address", "pre", "details", "summary",
]);

export function cleanText(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Decode an HTML/entity-escaped fragment into plain text (e.g. RSS titles). */
export function decodeHtmlText(raw: string | null | undefined): string {
  const s = String(raw ?? "");
  if (!s) return "";
  const $ = cheerio.load(`<div id="d">${s}</div>`);
  // A second pass catches double-escaped feeds ("&amp;nbsp;").
  const once = $("#d").text();
  if (/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(once)) {
    const $2 = cheerio.load(`<div id="d">${once}</div>`);
    return cleanText($2("#d").text());
  }
  return cleanText(once);
}

export function absUrl(base: string, raw: string | null | undefined): string | null {
  const u = String(raw ?? "").trim();
  if (!u || u.startsWith("data:") || u.startsWith("javascript:")) return null;
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

/** Largest candidate from a srcset attribute. */
function bestFromSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = size && /^\d+w$/.test(size) ? Number(size.slice(0, -1)) : 1;
    if (!best || w > best.w) best = { url, w };
  }
  return best?.url ?? null;
}

const NON_CONTENT_IMAGE =
  /(?:\/|_|-)(?:logo|favicon|sprite|emoji|emoticon|icon|avatar|gravatar|badge|button|btn|spacer|blank|pixel|loading|spinner)(?:[._-]|\/|$)|1x1|\/img\/(?:sns|level)\/|member_image|wp-includes\/|\/ads?\/|doubleclick|googlesyndication|\.svg(?:\?|$)/i;

export function isNonContentImageUrl(url: string): boolean {
  return NON_CONTENT_IMAGE.test(url);
}

/** Resolve the real image URL of an <img>, preferring lazy-load attributes over placeholders. */
export function imageUrlOf($img: CheerioSel, base: string): string | null {
  const candidates = [
    $img.attr("data-original"),
    $img.attr("data-lazy-src"),
    $img.attr("data-src"),
    $img.attr("data-url"),
    bestFromSrcset($img.attr("data-srcset")) ?? undefined,
    $img.attr("content"),
    $img.attr("src"),
    bestFromSrcset($img.attr("srcset")) ?? undefined,
  ];
  for (const c of candidates) {
    const u = absUrl(base, c);
    if (!u) continue;
    if (/\/(?:loading|spinner|placeholder|lazy)[^/]*\.(?:gif|png|svg)/i.test(u)) continue;
    return u;
  }
  return null;
}

/** Gnuboard / generic "thumb-xxx_400x300.jpg" → original file when the pattern is unambiguous. */
export function unthumbnailUrl(url: string): string {
  return url.replace(/\/thumb-([^/]+?)_\d+x\d+(\.[a-z0-9]+)(\?.*)?$/i, "/$1$2");
}

export type NormalizeOptions = {
  baseUrl: string;
  /** Extra chrome selectors from adapter config (e.g. a skin's title/meta header inside the body). */
  removeSelectors?: string[];
};

/**
 * Normalize an HTML fragment (or a selected body element's HTML) into ordered blocks.
 */
/** YouTube / Vimeo embed src → canonical watch URL + thumbnail (null when not a known video host). */
export function videoFromEmbed(src: string | null | undefined): { url: string; thumb: string | null; label: string } | null {
  const s = String(src || "").trim();
  const yt = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed|shorts|v)\/|youtu\.be\/|youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i);
  if (yt) {
    return { url: `https://www.youtube.com/watch?v=${yt[1]}`, thumb: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`, label: "▶ YouTube 영상 보기" };
  }
  const vm = s.match(/player\.vimeo\.com\/video\/(\d+)/i);
  if (vm) return { url: `https://vimeo.com/${vm[1]}`, thumb: null, label: "▶ Vimeo 영상 보기" };
  return null;
}

/**
 * Video posts (common on community "news" boards) are an iframe plus a title line.
 * Keep the video as a thumbnail + link instead of silently dropping it with the iframe.
 */
function preserveVideoEmbeds($: CheerioAPI, root: CheerioSel): void {
  root.find("iframe[src], iframe[data-src], embed[src]").each((_, el) => {
    const $el = $(el);
    const v = videoFromEmbed($el.attr("src") || $el.attr("data-src"));
    if (!v) return;
    const img = v.thumb ? `<img src="${v.thumb}" alt="video">` : "";
    $el.replaceWith(`<p>${img}<a data-nrm-video="1" href="${v.url}">${v.label}</a></p>`);
  });
}

export function htmlToBlocks(html: string, opts: NormalizeOptions): OperatorContentBlock[] {
  const $ = cheerio.load(`<div id="__nrm_root">${html}</div>`);
  const root = $("#__nrm_root");
  preserveVideoEmbeds($, root as CheerioSel);
  root.find(CHROME_SELECTORS).remove();
  for (const s of opts.removeSelectors ?? []) {
    try {
      root.find(s).remove();
    } catch {
      /* invalid selector in config is ignored here; config validation reports it */
    }
  }
  return walkBlocks($, root as CheerioSel, opts.baseUrl);
}

function walkBlocks($: CheerioAPI, root: CheerioSel, base: string): OperatorContentBlock[] {
  const blocks: OperatorContentBlock[] = [];
  const seenImages = new Set<string>();
  let buf: string[] = [];

  const flush = () => {
    const t = cleanText(buf.join(""));
    buf = [];
    if (t) blocks.push({ type: "paragraph", text: t });
  };

  const pushImage = ($img: CheerioSel) => {
    const raw = imageUrlOf($img, base);
    if (!raw || isNonContentImageUrl(raw)) return;
    const url = unthumbnailUrl(raw);
    if (seenImages.has(url)) return;
    seenImages.add(url);
    flush();
    const alt = cleanText($img.attr("alt")) || null;
    blocks.push({ type: "image", url, displaySrc: raw, alt, caption: null });
  };

  const visit = (node: DomNode) => {
    if (node.type === "text") {
      buf.push(String(node.data ?? ""));
      return;
    }
    if (node.type !== "tag" && node.type !== "script" && node.type !== "style") return;
    const tag = String(node.name ?? "").toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $el = $(node as any) as CheerioSel;

    if (tag === "br") {
      flush();
      return;
    }
    if (tag === "img") {
      pushImage($el);
      return;
    }
    if (tag === "picture") {
      const $img = $el.find("img").first() as CheerioSel;
      if ($img.length) pushImage($img);
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      flush();
      const t = cleanText($el.text());
      if (t) blocks.push({ type: "heading", level: Number(tag[1]), text: t });
      $el.find("img").each((_, img) => pushImage($(img) as CheerioSel));
      return;
    }
    if (tag === "blockquote") {
      flush();
      const t = cleanText($el.text());
      if (t) blocks.push({ type: "quote", text: t });
      $el.find("img").each((_, img) => pushImage($(img) as CheerioSel));
      return;
    }
    if (tag === "ul" || tag === "ol") {
      flush();
      const items: string[] = [];
      $el.children("li").each((_, li) => {
        const t = cleanText($(li).text());
        if (t) items.push(t);
      });
      if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
      $el.find("img").each((_, img) => pushImage($(img) as CheerioSel));
      return;
    }
    if (tag === "figcaption") {
      flush();
      const t = cleanText($el.text());
      if (t) blocks.push({ type: "paragraph", text: t });
      return;
    }
    if (tag === "a" && $el.attr("data-nrm-video")) {
      flush();
      blocks.push({ type: "link", href: $el.attr("href") || null, text: cleanText($el.text()) || null });
      return;
    }
    if (tag === "a") {
      const imgs = $el.find("img");
      if (imgs.length) {
        imgs.each((_, img) => pushImage($(img) as CheerioSel));
        const rest = cleanText($el.clone().find("img").remove().end().text());
        if (rest) buf.push(` ${rest} `);
        return;
      }
      buf.push($el.text());
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag) || tag === "li";
    if (isBlock) flush();
    $el.contents().each((_, child) => visit(child as unknown as DomNode));
    if (isBlock) flush();
  };

  root.contents().each((_, child) => visit(child as unknown as DomNode));
  flush();
  return mergeTinyParagraphs(blocks);
}

/** Collapse runs of empty-ish paragraphs created by deeply nested inline markup. */
function mergeTinyParagraphs(blocks: OperatorContentBlock[]): OperatorContentBlock[] {
  const out: OperatorContentBlock[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph" && /^[\s.·•|,-]*$/.test(b.text)) continue;
    out.push(b);
  }
  return out;
}

export type BlockStats = {
  textChars: number;
  imageCount: number;
  paragraphCount: number;
  entityLeak: boolean;
};

export function blockStats(blocks: OperatorContentBlock[]): BlockStats {
  let textChars = 0;
  let imageCount = 0;
  let paragraphCount = 0;
  let entityLeak = false;
  for (const b of blocks) {
    if (b.type === "image") {
      imageCount += 1;
      continue;
    }
    const text =
      b.type === "list" ? b.items.join(" ") : b.type === "link" ? String(b.text ?? "") : String(b.text ?? "");
    textChars += text.length;
    if (b.type === "paragraph") paragraphCount += 1;
    if (/&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i.test(text)) entityLeak = true;
  }
  return { textChars, imageCount, paragraphCount, entityLeak };
}

/** Read common article metadata from a full HTML page. */
export function readPageMeta(
  $: CheerioAPI,
): { ogImage: string | null; ogTitle: string | null; published: string | null; description: string | null; author: string | null } {
  const meta = (sel: string) => cleanText($(sel).attr("content")) || null;
  let published =
    meta('meta[property="article:published_time"]') ||
    meta('meta[name="article:published_time"]') ||
    meta('meta[itemprop="datePublished"]') ||
    cleanText($("[itemprop='datePublished']").first().attr("content")) ||
    cleanText($("time[datetime]").first().attr("datetime")) ||
    null;
  if (!published) {
    $('script[type="application/ld+json"]').each((_, s) => {
      if (published) return;
      const m = $(s).text().match(/"datePublished"\s*:\s*"([^"]+)"/);
      if (m?.[1]) published = m[1];
    });
  }
  return {
    ogImage: meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'),
    ogTitle: meta('meta[property="og:title"]'),
    published,
    description: meta('meta[property="og:description"]') || meta('meta[name="description"]'),
    author:
      [meta('meta[name="author"]'), meta('meta[property="dable:author"]'), meta('meta[property="article:author"]')].find(
        (v) => v && !/^https?:/i.test(v),
      ) ||
      cleanText($("[itemprop='author'] [itemprop='name'], [rel='author']").first().text()) ||
      null,
  };
}

/** Score-based main content fallback when no configured selector matches. */
export function findDensestContent($: CheerioAPI): CheerioSel | null {
  const scope = ($("body").length ? $("body") : $.root()) as unknown as CheerioSel;
  const clone = scope.clone();
  clone.find(CHROME_SELECTORS).remove();
  let best: CheerioSel | null = null;
  let bestScore = 0;
  clone.find("article, main, section, div, td").each((_, el) => {
    const $el = $(el) as CheerioSel;
    const text = cleanText($el.text()).length;
    if (text < 80) return;
    const linkText = cleanText($el.find("a").text()).length;
    const childDivs = $el.find("div").length;
    const paras = $el.find("p, br").length;
    const score = text - 3 * linkText - 25 * childDivs + 15 * paras + 40 * Math.min(10, $el.find("img").length);
    if (score > bestScore) {
      bestScore = score;
      best = $el;
    }
  });
  return best;
}

/**
 * Pick the article body: first configured/known selector with real text or media,
 * else the densest block. Returns the html plus the selector actually used.
 */
export function selectBody(
  $: CheerioAPI,
  selectors: string[],
): { html: string; selector: string } | null {
  for (const sel of selectors) {
    let el: CheerioSel;
    try {
      el = $(sel).first() as CheerioSel;
    } catch {
      continue;
    }
    if (!el.length) continue;
    const textLen = cleanText(el.text()).length;
    const imgs = el.find("img").length;
    if (textLen >= 20 || imgs > 0) return { html: el.html() ?? "", selector: sel };
  }
  const dense = findDensestContent($);
  if (dense) return { html: dense.html() ?? "", selector: "auto:density" };
  return null;
}

/** Generic article-body selectors tried after an adapter's own list (ordered, no site names). */
export const GENERIC_BODY_SELECTORS = [
  "[itemprop='articleBody']",
  ".tt_article_useless_p_margin",
  ".contents_style",
  "article .entry-content",
  ".entry-content",
  ".article_view",
  ".post-content",
  ".article-body",
  ".article_body",
  "#article-view-content-div",
  "#news_body_area",
  "#articleBody",
  ".news_body",
  ".view_con",
  "article",
];
