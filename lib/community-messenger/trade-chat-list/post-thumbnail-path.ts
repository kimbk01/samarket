/**
 * `posts` 행 → 서버 `contextMeta.thumbnailUrl` / 클라 img src 공통으로 쓰는 **원본 경로·URL** 1개.
 * (Supabase `normalizePostImages` 문자열만 처리하지 못하는 객체 배열 대비)
 */
import { normalizePostImages } from "@/lib/posts/post-normalize";

function imageUrlFromItem(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return x.trim();
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    const u = o.url ?? o.image_url ?? o.src;
    if (typeof u === "string" && u.trim()) return u.trim();
    const sp = o.storage_path;
    if (typeof sp === "string" && sp.trim()) return sp.trim();
  }
  return null;
}

function imagesArrayToPaths(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const urls: string[] = [];
    for (const x of raw) {
      const u = imageUrlFromItem(x);
      if (u) urls.push(u);
    }
    if (urls.length > 0) return urls;
    const strOnly = raw.filter((x): x is string => typeof x === "string");
    return strOnly.length > 0 ? strOnly : null;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        const urls: string[] = [];
        for (const x of parsed) {
          const u = imageUrlFromItem(x);
          if (u) urls.push(u);
        }
        if (urls.length > 0) return urls;
        const arr = parsed.filter((x): x is string => typeof x === "string");
        return arr.length > 0 ? arr : null;
      }
    } catch {
      const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
      return parts.length > 0 ? parts : null;
    }
  }
  return null;
}

export function extractPostThumbnailPathFromPostRow(post: Record<string, unknown> | null | undefined): string | null {
  if (!post) return null;
  const thumb = post.thumbnail_url;
  if (typeof thumb === "string" && thumb.trim()) return thumb.trim();
  const normalized = normalizePostImages(post.images);
  if (normalized?.[0]) return normalized[0].trim();
  const imgs = imagesArrayToPaths(post.images);
  if (imgs?.[0]) return imgs[0].trim();
  return null;
}
