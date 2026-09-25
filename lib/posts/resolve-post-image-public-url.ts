/**
 * posts.images / post_images.storage_path 등이 상대 경로일 때 Supabase Storage 공개 URL로 변환
 */
import { isPersistableStorageMediaRef } from "@/lib/media/persistable-storage-media-ref";

const BUCKET = "post-images";

export function resolvePostImagePublicUrl(raw: string | null | undefined): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!isPersistableStorageMediaRef(s)) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const base =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")) || "";
  if (!base) return s;
  const path = s.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}
