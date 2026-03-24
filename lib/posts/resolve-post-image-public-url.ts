/**
 * posts.images / post_images.storage_path 등이 상대 경로일 때 Supabase Storage 공개 URL로 변환
 */
const BUCKET = "post-images";

export function resolvePostImagePublicUrl(raw: string | null | undefined): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  const base =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")) || "";
  if (!base) return s;
  const path = s.replace(/^\/+/, "");
  if (path.includes("..")) return "";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}
