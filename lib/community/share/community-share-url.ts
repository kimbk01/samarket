import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";

export const COMMUNITY_SHARE_UTM = {
  utm_source: "dibay_share",
  utm_medium: "community",
  utm_campaign: "post_share",
} as const;

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/** 공유용 production absolute origin — localhost·relative 금지 */
export function resolveCommunityShareSiteOrigin(): string {
  if (typeof process !== "undefined") {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
    if (explicit && !LOCALHOST_RE.test(new URL(explicit).hostname)) return explicit;
    const vercel = process.env.VERCEL_URL?.trim();
    if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
    const vercelEnv = (
      process.env.VERCEL_ENV ??
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      ""
    ).toLowerCase();
    if (vercelEnv === "production") return DIBAY_PRODUCTION_SITE_ORIGIN;
  }
  return DIBAY_PRODUCTION_SITE_ORIGIN;
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
