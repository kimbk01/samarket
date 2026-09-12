import * as cheerio from "cheerio";
import { sanitizeHtmlFragment } from "@/lib/community-crawler/core/sanitize-html";
import { resolveCrawlUrl } from "@/lib/community-crawler/core/safe-url";

const MAX_TITLE = 300;
const MAX_BODY = 50_000;

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

export function normalizeTitleText(raw: string): string {
  const t = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > MAX_TITLE ? t.slice(0, MAX_TITLE).trim() : t;
}

function pickSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  const first = srcset.split(",")[0]?.trim();
  if (!first) return undefined;
  return first.split(/\s+/)[0];
}

/**
 * Extract image URLs from markdown image syntax: ![alt](url)
 */
export function extractMarkdownImages(
  markdown: string,
  baseUrl: string
): { content: string; imageUrls: string[] } {
  const imageUrls: string[] = [];
  const seen = new Set<string>();
  const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  const content = markdown.replace(mdImgRegex, (match, alt, rawUrl) => {
    const cleanUrl = rawUrl.trim().split(/\s+/)[0];
    const abs = resolveCrawlUrl(baseUrl, cleanUrl);
    if (abs && /^https?:\/\//i.test(abs)) {
      if (!seen.has(abs)) {
        seen.add(abs);
        imageUrls.push(abs);
      }
      return `![${alt}](${abs})`;
    }
    return match;
  });

  return { content, imageUrls };
}

/**
 * Normalizes article body whether it is HTML or Markdown.
 * Preserves paragraphs, links, headings, and images with exact ordering.
 */
export function normalizeArticleBodyContent(
  raw: string,
  baseUrl: string
): { content: string; imageUrls: string[] } {
  if (!raw || !raw.trim()) {
    return { content: "", imageUrls: [] };
  }

  const isHtml = /<(?:p|div|br|article|section|h[1-6]|ul|ol|li|img|a)\b[^>]*>/i.test(raw);

  if (isHtml) {
    const htmlResult = htmlFragmentToCommunityMarkdown(raw, baseUrl);
    // Even if HTML, check if raw markdown images were embedded in text
    const mdResult = extractMarkdownImages(htmlResult.content, baseUrl);
    const combinedImages = Array.from(new Set([...htmlResult.imageUrls, ...mdResult.imageUrls]));
    return { content: mdResult.content, imageUrls: combinedImages };
  }

  // Pure Markdown / Plaintext
  const mdResult = extractMarkdownImages(raw, baseUrl);
  let content = decodeHtmlEntities(mdResult.content)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (content.length > MAX_BODY) {
    content = content.slice(0, MAX_BODY).trim();
  }

  return { content, imageUrls: mdResult.imageUrls };
}

/**
 * Convert sanitized HTML fragment to Community-compatible markdown/text.
 * Preserves: paragraphs, breaks, headings, lists, links, image positions.
 */
export function htmlFragmentToCommunityMarkdown(
  html: string,
  baseUrl: string
): { content: string; imageUrls: string[] } {
  const sanitized = sanitizeHtmlFragment(html);
  const $ = cheerio.load(`<div id="__root">${sanitized}</div>`, { xml: false });
  const root = $("#__root");
  const imageUrls: string[] = [];
  const seen = new Set<string>();
  const placeholders: string[] = [];

  const absImg = (raw: string | undefined): string | null => {
    if (!raw) return null;
    const abs = resolveCrawlUrl(baseUrl, raw);
    if (!abs || !/^https?:\/\//i.test(abs)) return null;
    if (!seen.has(abs)) {
      seen.add(abs);
      imageUrls.push(abs);
    }
    return abs;
  };

  // Placeholders avoid cheerio HTML-parsing markdown tokens on replaceWith(string).
  root.find("img").each((_, el) => {
    const $el = $(el);
    const src =
      $el.attr("src") ||
      $el.attr("data-src") ||
      $el.attr("data-original") ||
      pickSrcset($el.attr("srcset"));
    const abs = absImg(src);
    if (abs) {
      const token = `@@DIBAY_IMG_${placeholders.length}@@`;
      placeholders.push(`![image](${abs})`);
      $el.replaceWith(token);
    } else {
      $el.remove();
    }
  });

  root.find("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    const text = $el.text().replace(/\s+/g, " ").trim() || href || "";
    const abs = href ? resolveCrawlUrl(baseUrl, href) : null;
    if (abs && /^https?:\/\//i.test(abs)) {
      const token = `@@DIBAY_LINK_${placeholders.length}@@`;
      placeholders.push(`[${text}](${abs})`);
      $el.replaceWith(token);
    } else {
      $el.replaceWith(text);
    }
  });

  root.find("br").replaceWith("\n");
  root.find("hr").replaceWith("\n\n---\n\n");

  for (let i = 6; i >= 1; i--) {
    root.find(`h${i}`).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      $(el).replaceWith(`\n\n${"#".repeat(i)} ${text}\n\n`);
    });
  }

  root.find("li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    $(el).replaceWith(`- ${text}\n`);
  });
  root.find("ul,ol").each((_, el) => {
    $(el).replaceWith(`\n${$(el).text()}\n`);
  });

  root.find("p,div,section,article").each((_, el) => {
    const $el = $(el);
    if ($el.find("p,div,section,article,ul,ol,h1,h2,h3,h4,h5,h6").length) return;
    const inner = $el.text();
    $el.replaceWith(`\n\n${inner.trim()}\n\n`);
  });

  let content = decodeHtmlEntities(root.text())
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (let i = 0; i < placeholders.length; i++) {
    content = content.replace(`@@DIBAY_IMG_${i}@@`, `\n\n${placeholders[i]}\n\n`);
    content = content.replace(`@@DIBAY_LINK_${i}@@`, placeholders[i]!);
  }

  content = content.replace(/\n{3,}/g, "\n\n").trim();
  if (content.length > MAX_BODY) content = content.slice(0, MAX_BODY).trim();
  return { content, imageUrls };
}
