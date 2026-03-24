import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePostImagePublicUrl } from "@/lib/posts/resolve-post-image-public-url";

type ImgRow = {
  post_id: string;
  url: string | null;
  storage_path: string | null;
  sort_order: number | null;
};

/**
 * posts.images / thumbnail_url가 비었을 때 post_images.sort_order 기준 첫 장 → 공개 URL
 */
export async function fetchFirstThumbnailByPostIds(
  sbAny: SupabaseClient,
  postIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(postIds.filter(Boolean))];
  if (!ids.length) return map;

  const { data: imgRows, error: imgErr } = await sbAny
    .from("post_images")
    .select("post_id, url, storage_path, sort_order")
    .in("post_id", ids);

  if (imgErr || !Array.isArray(imgRows)) return map;

  const byPost = new Map<string, ImgRow[]>();
  for (const r of imgRows as ImgRow[]) {
    const pid = String(r.post_id ?? "");
    if (!pid) continue;
    const list = byPost.get(pid) ?? [];
    list.push(r);
    byPost.set(pid, list);
  }
  for (const [pid, list] of byPost) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const row0 = list[0];
    const fullUrl = row0.url?.trim();
    const raw =
      fullUrl && /^https?:\/\//i.test(fullUrl)
        ? fullUrl
        : row0.storage_path?.trim() || fullUrl || "";
    if (raw) map.set(pid, resolvePostImagePublicUrl(raw));
  }
  return map;
}
