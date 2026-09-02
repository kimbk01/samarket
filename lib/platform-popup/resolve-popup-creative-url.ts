/**
 * CUT 3 — Platform Popup creative public URL (canonical upload path only).
 * No Supabase runtime image transforms.
 */

const BUCKET = "platform-popup-creatives";

const BLOCKED_SCHEMES = /^(javascript|data|file|blob):/i;

export function resolvePlatformPopupCreativePublicUrl(input: {
  assetUrl?: string | null;
  assetPath?: string | null;
}): string {
  const url = String(input.assetUrl ?? "").trim();
  if (url && /^https:\/\//i.test(url) && !BLOCKED_SCHEMES.test(url)) {
    return url;
  }

  const path = String(input.assetPath ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..")) return "";

  if (/^https?:\/\//i.test(path)) return path;

  const base =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")) ||
    "";
  if (!base) return "";

  const normalized = path.startsWith(`${BUCKET}/`) ? path : `${BUCKET}/${path}`;
  return `${base}/storage/v1/object/public/${normalized}`;
}
