import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrowseFeaturedItemsBatch } from "@/lib/stores/load-browse-featured-items-batch";

export type StoreCouponVisualContext = {
  storeName: string;
  storeSlug: string | null;
  logoUrl: string | null;
  menuPreviewTitles: string[];
  menuPreviewIsPromotional: true;
};

export async function loadStoreCouponVisualContextBatch(
  sb: SupabaseClient,
  storeIds: string[]
): Promise<Record<string, StoreCouponVisualContext>> {
  const ids = [...new Set(storeIds.map((id) => id.trim()).filter(Boolean))];
  const out: Record<string, StoreCouponVisualContext> = {};
  if (!ids.length) return out;

  const { data: stores } = await sb
    .from("stores")
    .select("id, store_name, slug, profile_image_url")
    .in("id", ids);

  const featured = await loadBrowseFeaturedItemsBatch(sb, ids);

  for (const s of stores ?? []) {
    const id = String((s as { id?: string }).id ?? "");
    if (!id) continue;
    const pack = featured.byStoreId[id];
    const items = pack?.featuredItems ?? [];
    out[id] = {
      storeName: String((s as { store_name?: string }).store_name ?? "").trim() || "",
      storeSlug: String((s as { slug?: string }).slug ?? "").trim() || null,
      logoUrl: String((s as { profile_image_url?: string }).profile_image_url ?? "").trim() || null,
      menuPreviewTitles: items.map((it) => String(it.name ?? "").trim()).filter(Boolean).slice(0, 3),
      menuPreviewIsPromotional: true,
    };
  }
  return out;
}
