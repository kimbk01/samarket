import { resolveShareSiteOrigin } from "@/lib/share/share-url";

export const COMMUNITY_SHARE_UTM = {
  utm_source: "dibay_share",
  utm_medium: "community",
  utm_campaign: "post_share",
} as const;

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/**
 * 공유용 production absolute origin — 통합 공유 `resolveShareSiteOrigin` 하나로 (S1).
 * 배포마다 바뀌는 `VERCEL_URL` 은 쓰지 않는다(SH-P1-11).
 */
export function resolveCommunityShareSiteOrigin(): string {
  return resolveShareSiteOrigin();
}

export function buildCommunityPostSharePath(postId: string): string {
  const id = postId.trim();
  if (!id) return "/community/posts";
  return `/community/posts/${encodeURIComponent(id)}`;
}

/** canonical 공유 URL — production absolute + UTM (token·session query 금지) */
export function buildCommunityPostCanonicalUrl(postId: string): string {
  const origin = resolveCommunityShareSiteOrigin();
  const path = buildCommunityPostSharePath(postId);
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(COMMUNITY_SHARE_UTM)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export function isSafeCommunityShareUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (LOCALHOST_RE.test(u.hostname)) return false;
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    for (const key of u.searchParams.keys()) {
      const k = key.toLowerCase();
      if (k.includes("token") || k.includes("auth") || k.includes("session") || k.includes("code")) {
        return false;
      }
    }
    return u.pathname.startsWith("/community/posts/");
  } catch {
    return false;
  }
}
