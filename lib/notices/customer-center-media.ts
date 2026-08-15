/**
 * Customer Center content media authority.
 * Physical field: `app_notices.hero_image_url` + body markdown `![alt](url)`.
 * Product-thumbnail fallback SVG is NOT a real content image.
 */

const MAX_URL_LEN = 2048;

/** Known non-content placeholders accidentally stored as hero/body media. */
const NON_CONTENT_MEDIA_PATH_MARKERS = [
  "/images/common/store-product-fallback.svg",
  "/images/common/store-product-fallback",
  "store-product-fallback.svg",
] as const;

function isNonContentPlaceholderUrl(href: string): boolean {
  const lower = href.toLowerCase();
  return NON_CONTENT_MEDIA_PATH_MARKERS.some((m) => lower.includes(m));
}

/**
 * True only when URL may be rendered as Customer Center content media.
 * Empty / whitespace / javascript / data / product-fallback → false.
 */
export function isCustomerCenterRenderableMediaUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const href = raw.trim();
  if (!href || href.length > MAX_URL_LEN) return false;
  if (/^javascript:/i.test(href) || /^data:/i.test(href) || /^vbscript:/i.test(href)) {
    return false;
  }
  if (isNonContentPlaceholderUrl(href)) return false;
  if (href.startsWith("/")) {
    // Relative app assets — allow only non-placeholder paths.
    return true;
  }
  try {
    const u = new URL(href);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (isNonContentPlaceholderUrl(u.pathname) || isNonContentPlaceholderUrl(href)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Normalize DB/API hero field — placeholder/invalid → null. */
export function normalizeCustomerCenterHeroImageUrl(raw: unknown): string | null {
  if (!isCustomerCenterRenderableMediaUrl(raw)) return null;
  return String(raw).trim();
}
