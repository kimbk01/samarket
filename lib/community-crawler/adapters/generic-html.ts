import * as cheerio from "cheerio";
import type { GenericHtmlAdapterConfig } from "@/lib/community-crawler/adapters/generic-html-config";
import { CommunityCrawlError } from "@/lib/community-crawler/core/errors";
import {
  htmlFragmentToCommunityMarkdown,
  normalizeTitleText,
} from "@/lib/community-crawler/core/html-to-community-markdown";
import { resolveCrawlUrl } from "@/lib/community-crawler/core/safe-url";
import { extractCoverCandidateLadder } from "@/lib/community-crawler/media/cover-candidate-ladder";

export type ParsedListItem = {
  detailUrl: string;
  sourcePostId: string | null;
};

export type ParsedDetail = {
  title: string;
  contentHtml: string;
  contentMarkdown: string;
  author: string | null;
  dateRaw: string | null;
  viewRaw: string | null;
  bodyImageUrls: string[];
  /** Primary cover candidate (ladder[0]); may be dead. */
  representativeImageUrl: string | null;
  /** Ordered cover ladder (canonical → og → json-ld → body). */
  coverCandidateUrls: string[];
  sourcePostId: string | null;
};

type CheerioRoot = ReturnType<typeof cheerio.load>;

function textOf($: CheerioRoot, scope: ReturnType<CheerioRoot>, selector?: string): string {
  if (!selector) return "";
  const el = scope.find(selector).first();
  if (!el.length) return "";
  return el.text().replace(/\s+/g, " ").trim();
}

function htmlOf($: CheerioRoot, scope: ReturnType<CheerioRoot>, selector: string): string {
  const el = scope.find(selector).first();
  if (!el.length) return "";
  return el.html() ?? "";
}

export function parseListPage(
  html: string,
  pageUrl: string,
  config: GenericHtmlAdapterConfig
): { items: ParsedListItem[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);
  const items: ParsedListItem[] = [];
  const seen = new Set<string>();

  const scopes = config.listItemSelector
    ? $(config.listItemSelector).toArray()
    : [];

  if (!config.listItemSelector) {
    const links = $(config.detailLinkSelector).toArray();
    for (const linkEl of links) {
      const $a = $(linkEl);
      const href = $a.attr("href") ?? $a.attr("data-href") ?? "";
      const abs = resolveCrawlUrl(pageUrl, href);
      if (!abs || !/^https?:\/\//i.test(abs)) continue;
      if (seen.has(abs)) continue;
      seen.add(abs);
      items.push({ detailUrl: abs, sourcePostId: extractIdFromUrl(abs) });
    }
  } else {
    for (const scope of scopes) {
      const $scope = $(scope);
      const links = $scope.find(config.detailLinkSelector).toArray();
      const candidates = links.length
        ? links
        : $scope.is(config.detailLinkSelector)
          ? [scope]
          : [];
      for (const linkEl of candidates) {
        const $a = $(linkEl);
        const href = $a.attr("href") ?? $a.attr("data-href") ?? "";
        const abs = resolveCrawlUrl(pageUrl, href);
        if (!abs || !/^https?:\/\//i.test(abs)) continue;
        if (seen.has(abs)) continue;
        seen.add(abs);

        let sourcePostId: string | null = null;
        if (config.sourcePostIdSelector) {
          const idEl = $scope.find(config.sourcePostIdSelector).first();
          const attr = config.sourcePostIdAttr || "href";
          const raw =
            (attr === "text" ? idEl.text() : idEl.attr(attr) || idEl.attr("href") || idEl.text()) ?? "";
          sourcePostId = String(raw).trim() || null;
        } else {
          sourcePostId = extractIdFromUrl(abs);
        }
        items.push({ detailUrl: abs, sourcePostId });
      }
    }
  }

  if (items.length === 0) {
    throw new CommunityCrawlError("LIST_SELECTOR_EMPTY", "No detail links found with configured selectors");
  }

  let nextPageUrl: string | null = null;
  if (config.nextPageSelector) {
    const nextHref = $(config.nextPageSelector).first().attr("href");
    nextPageUrl = nextHref ? resolveCrawlUrl(pageUrl, nextHref) : null;
  }
  return { items, nextPageUrl };
}

export function parseDetailPage(
  html: string,
  pageUrl: string,
  config: GenericHtmlAdapterConfig
): ParsedDetail {
  const $ = cheerio.load(html);
  const root = $("body").length ? $("body") : $.root();

  const title = normalizeTitleText(textOf($, root, config.titleSelector));
  if (!title) {
    throw new CommunityCrawlError("TITLE_MISSING", `Title missing for selector: ${config.titleSelector}`);
  }

  const contentHtml = htmlOf($, root, config.contentSelector);
  if (!contentHtml.trim()) {
    throw new CommunityCrawlError(
      "CONTENT_MISSING",
      `Content missing for selector: ${config.contentSelector}`
    );
  }

  const { content: contentMarkdown, imageUrls } = htmlFragmentToCommunityMarkdown(contentHtml, pageUrl);
  if (!contentMarkdown.trim()) {
    throw new CommunityCrawlError("CONTENT_MISSING", "Content empty after sanitize/normalize");
  }

  const author = textOf($, root, config.authorSelector) || null;
  const dateRaw = textOf($, root, config.dateSelector) || null;
  const viewRaw = textOf($, root, config.viewSelector) || null;

  let canonicalCover: string | null = null;
  if (config.representativeImageSelector) {
    const img = $(config.representativeImageSelector).first();
    const src =
      img.attr("src") ||
      img.attr("data-src") ||
      img.attr("data-original") ||
      pickSrcset(img.attr("srcset"));
    canonicalCover = src ? resolveCrawlUrl(pageUrl, src) : null;
  }
  if (!canonicalCover && config.imageSelector) {
    const img = $(config.imageSelector).first();
    const src =
      img.attr("src") ||
      img.attr("data-src") ||
      img.attr("data-original") ||
      pickSrcset(img.attr("srcset"));
    canonicalCover = src ? resolveCrawlUrl(pageUrl, src) : null;
  }

  const coverCandidateUrls = extractCoverCandidateLadder({
    pageUrl,
    html,
    canonicalCoverUrl: canonicalCover,
    articleBodyImageUrls: imageUrls,
  });
  const representativeImageUrl = coverCandidateUrls[0] ?? null;

  let sourcePostId: string | null = null;
  if (config.sourcePostIdSelector) {
    const idEl = $(config.sourcePostIdSelector).first();
    const attr = config.sourcePostIdAttr || "href";
    const raw = (attr === "text" ? idEl.text() : idEl.attr(attr) || idEl.text()) ?? "";
    sourcePostId = String(raw).trim() || null;
  } else {
    sourcePostId = extractIdFromUrl(pageUrl);
  }

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

function pickSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  const first = srcset.split(",")[0]?.trim();
  if (!first) return undefined;
  return first.split(/\s+/)[0];
}

function extractIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const m = last.match(/(\d{3,})/);
    if (m) return m[1]!;
    if (last && last.length < 120) return last;
    return null;
  } catch {
    return null;
  }
}
