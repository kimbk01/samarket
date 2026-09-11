/**
 * V2-3 cover candidate ladder (same-article only).
 *
 * Order:
 * 1) article canonical cover
 * 2) og:image / twitter:image
 * 3) JSON-LD image
 * 4) first meaningful article body images
 *
 * No site logos / tracking pixels / arbitrary homepage images.
 */

import { parseOgImageFromHtmlString } from "@/lib/philife/og-image-from-html";
import { resolveCrawlUrl } from "@/lib/community-crawler/core/safe-url";

const REJECT_URL =
  /(logo|favicon|sprite|icon[-_]?|avatar|badge|banner[-_]?ad|advert|tracking|pixel|spacer|1x1|blank\.gif|clear\.gif|transparent)/i;

function isHttp(u: string | null | undefined): u is string {
  return Boolean(u && /^https?:\/\//i.test(u.trim()));
}

function normalizeAbs(pageUrl: string, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t || t.startsWith("data:")) return null;
  const abs = resolveCrawlUrl(pageUrl, t) || (isHttp(t) ? t : null);
  if (!abs || !isHttp(abs)) return null;
  if (REJECT_URL.test(abs)) return null;
  return abs;
}

function extractJsonLdImageUrls(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  if (!html) return out;
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[1] || "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      collectJsonLdImages(parsed, pageUrl, out);
    } catch {
      /* ignore invalid json-ld */
    }
  }
  return out;
}

function collectJsonLdImages(node: unknown, pageUrl: string, out: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) collectJsonLdImages(n, pageUrl, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const image = obj.image ?? obj.thumbnailUrl ?? obj.thumbnail;
  if (typeof image === "string") {
    const abs = normalizeAbs(pageUrl, image);
    if (abs) out.push(abs);
  } else if (image && typeof image === "object") {
    const imgObj = image as Record<string, unknown>;
    const url =
      (typeof imgObj.url === "string" && imgObj.url) ||
      (typeof imgObj.contentUrl === "string" && imgObj.contentUrl) ||
      null;
    const abs = normalizeAbs(pageUrl, url);
    if (abs) out.push(abs);
    if (Array.isArray(image)) collectJsonLdImages(image, pageUrl, out);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") collectJsonLdImages(v, pageUrl, out);
  }
}

/**
 * Build ordered unique cover candidates for an article page.
 */
export function extractCoverCandidateLadder(input: {
  pageUrl: string;
  html: string;
  /** Adapter/article payload cover (NEXT_DATA coverImage, selector cover, etc.). */
  canonicalCoverUrl?: string | null;
  /** Images extracted from article body content only. */
  articleBodyImageUrls?: string[];
}): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (u: string | null | undefined) => {
    const abs = normalizeAbs(input.pageUrl, u ?? null);
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    ordered.push(abs);
  };

  push(input.canonicalCoverUrl ?? null);

  const og = parseOgImageFromHtmlString(input.html);
  push(og);

  for (const u of extractJsonLdImageUrls(input.html, input.pageUrl)) {
    push(u);
  }

  const body = Array.isArray(input.articleBodyImageUrls) ? input.articleBodyImageUrls : [];
  for (const u of body) {
    push(u);
    // Cover ladder uses body images as fallbacks; keep full ordered list for later validation.
  }

  return ordered;
}

/** Reconstruct cover try-order from durable item fields (no re-parse). */
export function coverLadderFromItemFields(input: {
  sourceCoverCandidateUrl: string | null;
  sourceCoverUrl: string | null;
  sourceBodyImages: string[];
}): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (u: string | null | undefined) => {
    const t = (u || "").trim();
    if (!t || !/^https?:\/\//i.test(t) || seen.has(t)) return;
    if (REJECT_URL.test(t)) return;
    seen.add(t);
    ordered.push(t);
  };
  push(input.sourceCoverCandidateUrl);
  push(input.sourceCoverUrl);
  for (const u of input.sourceBodyImages || []) push(u);
  return ordered;
}
