/**
 * G4 — list sellable gift certificate products in the Gift Mall window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export type GiftMallProduct = {
  id: string;
  storeId: string;
  storeName: string;
  storeLogoUrl: string | null;
  title: string;
  faceValue: number;
  purchasePrice: number;
  transferable: boolean;
  imageUrl: string | null;
  salesStartsAt: string;
  salesEndsAt: string | null;
};

export async function loadGiftMallProducts(
  sb: SupabaseClient,
  opts?: { storeId?: string; limit?: number }
): Promise<{ ok: true; products: GiftMallProduct[] } | { ok: false; error: string }> {
  const nowIso = new Date().toISOString();
  const limit = Math.min(100, Math.max(1, Math.floor(opts?.limit ?? 50)));

  let q = sb
    .from(GIFT_TABLES.products)
    .select(
      "id, store_id, title, face_value, purchase_price, transferable, image_url, sales_starts_at, sales_ends_at, active, stores(store_name, profile_image_url)"
    )
    .eq("active", true)
    .lte("sales_starts_at", nowIso)
    .or(`sales_ends_at.is.null,sales_ends_at.gte.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  const storeId = opts?.storeId?.trim();
  if (storeId) q = q.eq("store_id", storeId);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const products: GiftMallProduct[] = [];
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const storesRaw = row.stores;
    const storeObj = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
    const storeName =
      storeObj && typeof storeObj === "object" && (storeObj as { store_name?: unknown }).store_name != null
        ? String((storeObj as { store_name: unknown }).store_name)
        : "";
    const storeLogoRaw =
      storeObj && typeof storeObj === "object"
        ? (storeObj as { profile_image_url?: unknown }).profile_image_url
        : null;
    const storeLogoUrl =
      storeLogoRaw == null || String(storeLogoRaw).trim() === ""
        ? null
        : String(storeLogoRaw).trim();
    products.push({
      id: String(row.id),
      storeId: String(row.store_id),
      storeName,
      storeLogoUrl,
      title: String(row.title ?? ""),
      faceValue: Math.trunc(Number(row.face_value) || 0),
      purchasePrice: Math.trunc(Number(row.purchase_price) || 0),
      transferable: row.transferable !== false,
      imageUrl: row.image_url == null ? null : String(row.image_url),
      salesStartsAt: String(row.sales_starts_at ?? ""),
      salesEndsAt: row.sales_ends_at == null ? null : String(row.sales_ends_at),
    });
  }

  return { ok: true, products };
}
