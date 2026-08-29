/**
 * G4 — list / by-id sellable gift certificate products in the Gift Mall window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GiftScope } from "@/lib/gift-certificate/gift-certificate-domain-contract";
import {
  evaluateGiftProductCustomerPurchaseEligibility,
  isGiftProductCustomerCatalogEligible,
  type GiftCustomerPurchaseIneligibilityReason,
  type GiftProductCustomerPurchaseRow,
} from "@/lib/gift-certificate/gift-product-customer-catalog";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export type GiftMallProduct = {
  id: string;
  giftScope: GiftScope;
  storeId: string | null;
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

export type GiftMallProductLoadResult =
  | { ok: true; product: GiftMallProduct }
  | {
      ok: false;
      error: "not_found" | "not_purchasable";
      reason: GiftCustomerPurchaseIneligibilityReason | "not_found";
    };

const PRODUCT_SELECT =
  "id, store_id, gift_scope, title, face_value, purchase_price, transferable, image_url, sales_starts_at, sales_ends_at, active, archived_at, mall_visible, max_issuance, issued_count, stores(store_name, profile_image_url)";

function purchaseRowFromDb(row: Record<string, unknown>): GiftProductCustomerPurchaseRow {
  return {
    active: row.active === true,
    mall_visible: row.mall_visible !== false,
    archived_at: row.archived_at == null ? null : String(row.archived_at),
    sales_starts_at: row.sales_starts_at == null ? null : String(row.sales_starts_at),
    sales_ends_at: row.sales_ends_at == null ? null : String(row.sales_ends_at),
    max_issuance: row.max_issuance == null ? null : Math.trunc(Number(row.max_issuance)),
    issued_count: Math.trunc(Number(row.issued_count) || 0),
  };
}

function mapMallProduct(row: Record<string, unknown>): GiftMallProduct {
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
  return {
    id: String(row.id),
    giftScope,
    storeId: giftScope === "PLATFORM" ? null : sid || null,
    storeName: giftScope === "PLATFORM" ? "DIBAY" : storeName,
    storeLogoUrl: giftScope === "PLATFORM" ? null : storeLogoUrl,
    title: String(row.title ?? ""),
    faceValue: Math.trunc(Number(row.face_value) || 0),
    purchasePrice: Math.trunc(Number(row.purchase_price) || 0),
    transferable: row.transferable !== false,
    imageUrl: row.image_url == null ? null : String(row.image_url),
    salesStartsAt: String(row.sales_starts_at ?? ""),
    salesEndsAt: row.sales_ends_at == null ? null : String(row.sales_ends_at),
  };
}

export async function loadGiftMallProducts(
  sb: SupabaseClient,
  opts?: { storeId?: string; limit?: number }
): Promise<{ ok: true; products: GiftMallProduct[] } | { ok: false; error: string }> {
  const nowIso = new Date().toISOString();
  const limit = Math.min(100, Math.max(1, Math.floor(opts?.limit ?? 50)));

  // SQL prefilter mirrors purchase contract; JS eligibility is authoritative for cap + mall_visible.
  let q = sb
    .from(GIFT_TABLES.products)
    .select(PRODUCT_SELECT)
    .eq("active", true)
    .eq("mall_visible", true)
    .is("archived_at", null)
    .lte("sales_starts_at", nowIso)
    .or(`sales_ends_at.is.null,sales_ends_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(Math.min(200, limit * 3));

  const storeId = opts?.storeId?.trim();
  if (storeId) {
    q = q.or(`and(gift_scope.eq.STORE,store_id.eq.${storeId}),gift_scope.eq.PLATFORM`);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const products: GiftMallProduct[] = [];
  const nowMs = Date.parse(nowIso);
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    if (!isGiftProductCustomerCatalogEligible(purchaseRowFromDb(row), nowMs)) continue;
    products.push(mapMallProduct(row));
    if (products.length >= limit) break;
  }

  return { ok: true, products };
}

/**
 * Canonical by-id customer product loader — same eligibility as Mall list / purchase.
 */
export async function loadGiftMallProductById(
  sb: SupabaseClient,
  productId: string,
  opts?: { storeId?: string }
): Promise<GiftMallProductLoadResult | { ok: false; error: string }> {
  const id = productId.trim();
  if (!id) {
    return { ok: false, error: "not_found", reason: "not_found" };
  }

  const { data, error } = await sb
    .from(GIFT_TABLES.products)
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found", reason: "not_found" };

  const row = data as Record<string, unknown>;
  const storeFilter = opts?.storeId?.trim();
  if (storeFilter) {
    const scopeRaw = String(row.gift_scope ?? "STORE").trim();
    const giftScope: GiftScope = scopeRaw === "PLATFORM" ? "PLATFORM" : "STORE";
    const sid = row.store_id == null ? "" : String(row.store_id).trim();
    if (giftScope === "STORE" && sid !== storeFilter) {
      return { ok: false, error: "not_found", reason: "not_found" };
    }
  }

  const evaled = evaluateGiftProductCustomerPurchaseEligibility(purchaseRowFromDb(row));
  if (!evaled.eligible) {
    return {
      ok: false,
      error: "not_purchasable",
      reason: evaled.reason ?? "paused",
    };
  }

  return { ok: true, product: mapMallProduct(row) };
}
