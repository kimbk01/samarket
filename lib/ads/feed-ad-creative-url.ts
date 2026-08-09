/**
 * Feed Banner creative URL — Production reachability SSOT.
 * DO NOT persist QA sample assets or private/dev hosts into feed_ad_creatives.image_url.
 * Approve + eligibility must both call this (defense in depth).
 */

const BLOCKED_SCHEMES = new Set(["file:", "data:", "blob:", "javascript:"]);

/** Relative or absolute path prefixes that are guide/fixture only — never Production campaign creatives. */
const QA_SAMPLE_PATH_MARKERS = [
  "/images/feed-ad-samples/",
  "/images/feed-ad-samples",
] as const;

function isIpv4Private(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "127.0.0.1") return true;
  if (isIpv4Private(h)) return true;
  return false;
}

function pathLooksLikeQaSample(pathOrUrl: string): boolean {
  const lower = pathOrUrl.trim().toLowerCase();
  return QA_SAMPLE_PATH_MARKERS.some((m) => lower.includes(m));
}

/**
 * True when URL may be used as a Production Feed Banner creative.
 * Policy: https absolute public host only (Supabase Storage / CDN).
 * Rejects localhost, private LAN, non-https, opaque schemes, QA sample paths.
 */
export function isProductionReachableFeedAdCreativeUrl(url: string): boolean {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  if (pathLooksLikeQaSample(raw)) return false;

  // Absolute without scheme (//host/...) — treat as invalid for campaign persist
  if (raw.startsWith("//")) return false;

  // Relative paths — never Production campaign creatives (samples / local public)
  if (raw.startsWith("/")) return false;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.has(protocol)) return false;
  if (protocol !== "https:") return false;
  if (isBlockedHostname(parsed.hostname)) return false;
  if (pathLooksLikeQaSample(parsed.pathname)) return false;
  return true;
}

export function filterProductionReachableFeedAdSlides<T extends { imageUrl: string }>(
  slides: T[]
): T[] {
  return slides.filter((s) => isProductionReachableFeedAdCreativeUrl(s.imageUrl));
}

export function feedAdCreativeUrlRejectReason(url: string): string | null {
  if (isProductionReachableFeedAdCreativeUrl(url)) return null;
  const raw = String(url ?? "").trim();
  if (!raw) return "creative_url_empty";
  if (pathLooksLikeQaSample(raw)) return "creative_url_qa_sample";
  if (raw.startsWith("/")) return "creative_url_relative";
  try {
    const u = new URL(raw);
    if (BLOCKED_SCHEMES.has(u.protocol.toLowerCase())) return "creative_url_scheme";
    if (u.protocol.toLowerCase() !== "https:") return "creative_url_https_required";
    if (isBlockedHostname(u.hostname)) return "creative_url_private_host";
  } catch {
    return "creative_url_invalid";
  }
  return "creative_url_invalid";
}
