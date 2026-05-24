import { createHash } from "node:crypto";

export type AuthCookiePair = { name: string; value: string };

function fingerprintFromPairs(cookies: AuthCookiePair[]): string {
  const parts: string[] = [];
  for (const { name, value } of cookies) {
    if (
      name.startsWith("sb-") &&
      (name.includes("auth-token") || name.includes("code-verifier"))
    ) {
      parts.push(`${name}=${value}`);
    }
    if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) {
      parts.push(`${name}=${value}`);
    }
  }
  if (!parts.length) return "∅";
  parts.sort();
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}

/** `cookies().getAll()` — proxy `request.cookies.getAll()` 와 동일 (청크 `auth-token.0` 포함). */
export function apiRouteAuthCookieFingerprintFromPairs(cookies: AuthCookiePair[]): string {
  return fingerprintFromPairs(cookies);
}

/**
 * Route Handler `Cookie` 헤더 fallback — `cookies().getAll()` 우선.
 * proxy `proxyAuthCookieFingerprint` 와 동일 정책.
 */
export function apiRouteAuthCookieFingerprint(cookieHeader: string): string {
  const raw = cookieHeader.trim();
  if (!raw) return "∅";
  const pairs: AuthCookiePair[] = [];
  for (const segment of raw.split(";")) {
    const eq = segment.indexOf("=");
    if (eq <= 0) continue;
    pairs.push({ name: segment.slice(0, eq).trim(), value: segment.slice(eq + 1).trim() });
  }
  return fingerprintFromPairs(pairs);
}
