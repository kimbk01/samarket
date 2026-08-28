/**
 * G3 — customer-owned gift instance detail (minimum read projection).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import type { GiftWalletRedemptionSummary } from "@/lib/gift-certificate/load-gift-wallet";

export type GiftInstanceDetail = {
  id: string;
  publicGiftNumber: string;
  productId: string;
  giftScope: "STORE" | "PLATFORM";
  storeId: string | null;
  storeSlug: string | null;
  storeName: string;
  storeLogoUrl: string | null;
  title: string;
  imageUrl: string | null;
  transferable: boolean;
  faceValue: number;
  purchasePrice: number;
  remainingBalance: number;
  status: string;
  purchasedAt: string;
  fullyRedeemedAt: string | null;
  redemptionHistory: GiftWalletRedemptionSummary[];
};

export async function loadGiftInstanceDetail(
  sb: SupabaseClient,
  userId: string,
  instanceId: string
): Promise<
  | { ok: true; instance: GiftInstanceDetail }
  | { ok: false; error: string; status: 403 | 404 | 500 }
> {
  const uid = userId.trim();
  const iid = instanceId.trim();
  if (!uid || !iid) return { ok: false, error: "missing_params", status: 404 };

  const { data: raw, error } = await sb
    .from(GIFT_TABLES.instances)
    .select(
      "id, public_gift_number, product_id, store_id, gift_scope, face_value, purchase_price, remaining_balance, status, purchased_at, created_at, fully_redeemed_at, current_owner_user_id, gift_certificate_products(title, image_url, transferable, gift_scope, stores(store_name, profile_image_url, slug))"
    )
    .eq("id", iid)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!raw) return { ok: false, error: "not_found", status: 404 };

  const row = raw as Record<string, unknown>;
  const ownerId = String(row.current_owner_user_id ?? "").trim();
  if (ownerId !== uid) return { ok: false, error: "forbidden", status: 403 };

  const productRaw = row.gift_certificate_products;
  const productObj = Array.isArray(productRaw) ? productRaw[0] : productRaw;
  const product =
    productObj && typeof productObj === "object" ? (productObj as Record<string, unknown>) : null;
  const storesRaw = product?.stores;
  const storeObj = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
  const storeName =
    storeObj && typeof storeObj === "object" && (storeObj as { store_name?: unknown }).store_name != null
      ? String((storeObj as { store_name: unknown }).store_name)
      : "";
  const storeSlug =
    storeObj && typeof storeObj === "object" && (storeObj as { slug?: unknown }).slug != null
      ? String((storeObj as { slug: unknown }).slug)
      : null;
  const storeLogoRaw =
    storeObj && typeof storeObj === "object"
      ? (storeObj as { profile_image_url?: unknown }).profile_image_url
      : null;
  const storeLogoUrl =
    storeLogoRaw == null || String(storeLogoRaw).trim() === "" ? null : String(storeLogoRaw).trim();
  const scopeRaw = String(row.gift_scope ?? product?.gift_scope ?? "STORE").trim();
  const giftScope = scopeRaw === "PLATFORM" ? "PLATFORM" : "STORE";
  const storeIdRaw = row.store_id == null ? "" : String(row.store_id).trim();

  const { data: redRows } = await sb
    .from(GIFT_TABLES.redemptions)
    .select("store_id, redeemed_amount, created_at, reversed")
    .eq("instance_id", iid)
    .eq("reversed", false)
    .order("created_at", { ascending: false })
    .limit(50);

  const storeIds = [
    ...new Set(
      ((redRows ?? []) as Record<string, unknown>[])
        .map((r) => String(r.store_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const { data: storeRows } = storeIds.length
    ? await sb.from("stores").select("id, store_name").in("id", storeIds)
    : { data: [] as Record<string, unknown>[] };
  const storeNameById = new Map(
    ((storeRows ?? []) as Record<string, unknown>[]).map((r) => [
      String(r.id),
      String(r.store_name ?? ""),
    ])
  );

  const redemptionHistory: GiftWalletRedemptionSummary[] = [];
  for (const r of (redRows ?? []) as Record<string, unknown>[]) {
    const storeId = String(r.store_id ?? "").trim();
    if (!storeId) continue;
    redemptionHistory.push({
      storeId,
      storeName: storeNameById.get(storeId) ?? storeId,
      redeemedAmount: Math.trunc(Number(r.redeemed_amount) || 0),
      redeemedAt: String(r.created_at ?? ""),
    });
  }

  return {
    ok: true,
    instance: {
      id: iid,
      publicGiftNumber: String(row.public_gift_number ?? ""),
      productId: String(row.product_id),
      giftScope,
      storeId: giftScope === "PLATFORM" ? null : storeIdRaw || null,
      storeSlug: giftScope === "PLATFORM" ? null : storeSlug,
      storeName: giftScope === "PLATFORM" ? "DIBAY" : storeName,
      storeLogoUrl: giftScope === "PLATFORM" ? null : storeLogoUrl,
      title: product?.title != null ? String(product.title) : "",
      imageUrl: product?.image_url == null ? null : String(product.image_url),
      transferable: product?.transferable !== false,
      faceValue: Math.trunc(Number(row.face_value) || 0),
      purchasePrice: Math.trunc(Number(row.purchase_price) || 0),
      remainingBalance: Math.trunc(Number(row.remaining_balance) || 0),
      status: String(row.status ?? ""),
      purchasedAt: String(row.purchased_at ?? row.created_at ?? ""),
      fullyRedeemedAt: row.fully_redeemed_at == null ? null : String(row.fully_redeemed_at),
      redemptionHistory,
    },
  };
}
