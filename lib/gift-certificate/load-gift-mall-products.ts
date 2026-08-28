/**
 * G4 — list sellable gift certificate products in the Gift Mall window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import type { GiftScope } from "@/lib/gift-certificate/gift-certificate-domain-contract";
import {
  isCustomerOpaqueGiftProductTitle,
  resolveCustomerGiftProductTitle,
} from "@/lib/gift-certificate/gift-product-customer-view";

export type GiftMallProduct = {
  id: string;
  giftScope: GiftScope;
  storeId: string | null;
  storeName: string;
  storeLogoUrl: string | null;
  title: string;
  /** Customer-safe display title — opaque QA/internal names replaced. */
  customerTitle: string;
  titleIsCustomerOpaque: boolean;
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
      "id, store_id, gift_scope, title, face_value, purchase_price, transferable, image_url, sales_starts_at, sales_ends_at, active, archived_at, stores(store_name, profile_image_url)"
    )
    .eq("active", true)
    .is("archived_at", null)
    .lte("sales_starts_at", nowIso)
    .or(`sales_ends_at.is.null,sales_ends_at.gte.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  const storeId = opts?.storeId?.trim();
  if (storeId) {
    // Store mall: that store's STORE gifts + all PLATFORM gifts
    q = q.or(`and(gift_scope.eq.STORE,store_id.eq.${storeId}),gift_scope.eq.PLATFORM`);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const products: GiftMallProduct[] = [];
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const scopeRaw = String(row.gift_scope ?? "STORE").trim();
    const giftScope: GiftScope = scopeRaw === "PLATFORM" ? "PLATFORM" : "STORE";
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
    const sid = row.store_id == null ? "" : String(row.store_id).trim();
    const rawTitle = String(row.title ?? "");
    if (isCustomerOpaqueGiftProductTitle(rawTitle)) continue;
    const resolvedStoreName = giftScope === "PLATFORM" ? "DIBAY" : storeName;
    const { customerTitle, titleIsCustomerOpaque } = resolveCustomerGiftProductTitle({
      title: rawTitle,
      storeName: resolvedStoreName,
      giftScope,
    });
    products.push({
      id: String(row.id),
      giftScope,
      storeId: giftScope === "PLATFORM" ? null : sid || null,
      storeName: resolvedStoreName,
      storeLogoUrl: giftScope === "PLATFORM" ? null : storeLogoUrl,
      title: rawTitle,
      customerTitle,
      titleIsCustomerOpaque,
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
