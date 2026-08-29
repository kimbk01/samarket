/**
 * G4 — batch read projection for messenger gift transfer cards (no per-card N+1).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export type GiftTransferPresentation = {
  transferId: string;
  instanceId: string | null;
  giftScope: "STORE" | "PLATFORM";
  title: string;
  storeName: string;
  storeLogoUrl: string | null;
  imageUrl: string | null;
  faceValue: number | null;
  purchasePrice: number | null;
  remainingBalance: number | null;
  validUntil: string | null;
  publicGiftNumber: string | null;
  senderDisplayName: string | null;
};

export async function loadGiftTransferPresentations(
  sb: SupabaseClient,
  participantUserId: string,
  transferIds: string[]
): Promise<{ ok: true; items: GiftTransferPresentation[] } | { ok: false; error: string }> {
  const userId = participantUserId.trim();
  if (!userId) return { ok: false, error: "missing_participant" };
  const ids = [...new Set(transferIds.map((id) => id.trim()).filter(Boolean))].slice(0, 50);
  if (!ids.length) return { ok: true, items: [] };

  const { data: transferRows, error } = await sb
    .from(GIFT_TABLES.transfers)
    .select("id, instance_id, sender_user_id, recipient_user_id, gift_certificate_instances(gift_scope, face_value, purchase_price, remaining_balance, valid_until, public_gift_number, gift_certificate_products(title, image_url, gift_scope, stores(store_name, profile_image_url)))")
    .in("id", ids)
    .or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`);

  if (error) return { ok: false, error: error.message };

  const senderIds = [
    ...new Set(
      ((transferRows ?? []) as Record<string, unknown>[])
        .map((r) => String(r.sender_user_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const { data: profileRows } = senderIds.length
    ? await sb.from("profiles").select("id, nickname, dibay_id").in("id", senderIds)
    : { data: [] as Record<string, unknown>[] };

  const nickById = new Map<string, string>();
  for (const raw of profileRows ?? []) {
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "");
    const nick = String(row.nickname ?? row.dibay_id ?? "").trim();
    if (id && nick) nickById.set(id, nick);
  }

  const items: GiftTransferPresentation[] = [];
  for (const raw of transferRows ?? []) {
    const row = raw as Record<string, unknown>;
    const transferId = String(row.id ?? "");
    const instanceRaw = row.gift_certificate_instances;
    const instObj = Array.isArray(instanceRaw) ? instanceRaw[0] : instanceRaw;
    const inst =
      instObj && typeof instObj === "object" ? (instObj as Record<string, unknown>) : null;
    const productRaw = inst?.gift_certificate_products;
    const productObj = Array.isArray(productRaw) ? productRaw[0] : productRaw;
    const product =
      productObj && typeof productObj === "object" ? (productObj as Record<string, unknown>) : null;
    const storesRaw = product?.stores;
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
    const scopeRaw = String(inst?.gift_scope ?? product?.gift_scope ?? "STORE").trim();
    const giftScope = scopeRaw === "PLATFORM" ? "PLATFORM" : "STORE";
    const senderUserId = String(row.sender_user_id ?? "").trim();

    items.push({
      transferId,
      instanceId: inst ? String(inst.id ?? row.instance_id ?? "") : String(row.instance_id ?? "") || null,
      giftScope,
      title: product?.title != null ? String(product.title) : "",
      storeName: giftScope === "PLATFORM" ? "DIBAY" : storeName,
      storeLogoUrl: giftScope === "PLATFORM" ? null : storeLogoUrl,
      imageUrl: product?.image_url == null ? null : String(product.image_url),
      faceValue: inst && Number.isFinite(Number(inst.face_value)) ? Math.trunc(Number(inst.face_value)) : null,
      purchasePrice:
        inst && Number.isFinite(Number(inst.purchase_price))
          ? Math.trunc(Number(inst.purchase_price))
          : null,
      remainingBalance:
        inst && Number.isFinite(Number(inst.remaining_balance))
          ? Math.trunc(Number(inst.remaining_balance))
          : null,
      validUntil:
        inst?.valid_until == null || String(inst.valid_until).trim() === ""
          ? null
          : String(inst.valid_until).slice(0, 10),
      publicGiftNumber:
        inst?.public_gift_number == null || String(inst.public_gift_number).trim() === ""
          ? null
          : String(inst.public_gift_number).trim(),
      senderDisplayName: nickById.get(senderUserId) ?? null,
    });
  }

  return { ok: true, items };
}
