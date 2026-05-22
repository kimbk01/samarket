import {
  getApprovedStoreBySlug,
  STORE_SELECT_SEO,
} from "@/lib/stores/get-approved-store-by-slug";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export type StoreSeoMetadata = {
  title: string;
  description: string;
  canonicalSlug: string;
  ogImageUrl: string | null;
};

/**
 * `generateMetadata` 전용 — HTTP `/api/stores/:slug`·메뉴·meta 집계 없이 DB 1회.
 */
export async function loadStoreSeoMetadataBySlug(slug: string): Promise<StoreSeoMetadata | null> {
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) return null;

  const sb = tryGetSupabaseForStores();
  if (!sb) return null;

  const storeRes = await getApprovedStoreBySlug(sb, decoded, STORE_SELECT_SEO);
  if (storeRes.ok === false) return null;

  const s = storeRes.store;
  const title = String(s.store_name ?? "매장");
  const descRaw = typeof s.description === "string" ? s.description.trim() : "";
  const region = formatStoreLocationLine(s) ?? "";
  const description = (descRaw || (region ? `${region} · 동네 매장` : "동네 매장")).slice(0, 160);
  const ogImageUrl =
    typeof s.profile_image_url === "string" && s.profile_image_url.trim()
      ? s.profile_image_url.trim()
      : null;
  const canonicalSlug = String(s.slug ?? decoded);

  return { title, description, canonicalSlug, ogImageUrl };
}
