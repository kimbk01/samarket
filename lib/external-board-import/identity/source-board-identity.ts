/**
 * Normalize absolute http(s) URL for identity (strip hash, trailing slash, lowercase host).
 */
export function normalizeExternalBoardUrl(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
      u.port = "";
    }
    let path = u.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString();
  } catch {
    return null;
  }
}

export function deriveSourceBoardIdentity(sourceUrl: string): {
  siteKey: string;
  boardKey: string;
  siteName: string;
  canonicalUrl: string;
} | null {
  const canonicalUrl = normalizeExternalBoardUrl(sourceUrl);
  if (!canonicalUrl) return null;
  const u = new URL(canonicalUrl);
  const siteKey = u.hostname.replace(/^www\./, "");
  const boardKey = `${u.pathname}${u.search}` || "/";
  return {
    siteKey,
    boardKey,
    siteName: siteKey,
    canonicalUrl,
  };
}
