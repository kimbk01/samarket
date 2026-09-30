/**
 * P0-R3 — Structural coverage helper for proxy.ts matcher vs DENY-classified API routes.
 * Mirrors `export const config.matcher` negative lookahead in proxy.ts.
 */

/** Same exclusion grammar as proxy.ts `config.matcher` (kept in sync by contract test). */
export const PROXY_MATCHER_NEGATIVE_LOOKAHEAD =
  "(?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|icon(?:[/-]|$)|apple-icon(?:[/-]|$)|opengraph-image(?:[/-]|$)|twitter-image(?:[/-]|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|wav|mp3|mp4|ico|webmanifest|json|xml|txt|map|woff|woff2|ttf|otf|eot)$)";

/** Distinctive fragment as written in proxy.ts matcher string literal. */
export const PROXY_MATCHER_SOURCE_FRAGMENT =
  "(?!_next/static|_next/image|favicon\\\\.ico|manifest\\\\.webmanifest";

const PROXY_PATH_RE = new RegExp(`^/${PROXY_MATCHER_NEGATIVE_LOOKAHEAD}.*$`);

/**
 * Whether `pathname` is structurally covered by proxy.ts matcher
 * (and therefore enters `proxy()` where `/api/*` mutation gate runs).
 */
export function isPathCoveredByProxyMatcher(pathname: string): boolean {
  const p = String(pathname ?? "").trim() || "/";
  const normalized = p.startsWith("/") ? p : `/${p}`;
  // Next matcher matches the path without requiring a leading-only group quirk:
  // pattern is "/((?!...).*)" → full path like "/api/foo".
  return PROXY_PATH_RE.test(normalized);
}

export function countDenyRoutesCoveredByProxyMatcher(
  denyPaths: ReadonlyArray<string>
): { covered: number; total: number; uncovered: string[] } {
  const uncovered: string[] = [];
  let covered = 0;
  for (const path of denyPaths) {
    const pathname = path.includes(" ") ? path.split(/\s+/).slice(1).join(" ") : path;
    if (isPathCoveredByProxyMatcher(pathname)) covered += 1;
    else uncovered.push(path);
  }
  return { covered, total: denyPaths.length, uncovered };
}
