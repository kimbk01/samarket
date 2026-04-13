import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

/** URL 슬러그로 매장 UUID 조회 (`stores.slug`). */
export async function resolveStoreIdBySlug(slug: string): Promise<string | null> {
  const s = typeof slug === "string" ? slug.trim() : "";
  if (!s) return null;
  const sb = tryGetSupabaseForStores();
  if (!sb) return null;
  const { data, error } = await sb.from("stores").select("id").eq("slug", s).maybeSingle();
  if (error || !data?.id) return null;
  return typeof data.id === "string" ? data.id : null;
}
