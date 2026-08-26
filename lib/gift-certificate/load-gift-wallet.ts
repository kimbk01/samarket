/**
 * G4 — buyer gift certificate wallet projection (instances + transfers).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export type GiftWalletInstance = {
  id: string;
  productId: string;
  storeId: string;
  storeName: string;
  title: string;
  imageUrl: string | null;
  transferable: boolean;
  faceValue: number;
  purchasePrice: number;
  remainingBalance: number;
  status: string;
  purchasedAt: string;
  fullyRedeemedAt: string | null;
};

export type GiftWalletTransfer = {
  id: string;
  instanceId: string;
  senderUserId: string;
  recipientUserId: string;
  roomId: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type GiftWalletPayload = {
  available: GiftWalletInstance[];
  locked: GiftWalletInstance[];
  fullyRedeemed: GiftWalletInstance[];
  pendingTransfers: GiftWalletTransfer[];
  sentTransfers: GiftWalletTransfer[];
};

function mapInstance(row: Record<string, unknown>): GiftWalletInstance {
  const productRaw = row.gift_certificate_products;
  const productObj = Array.isArray(productRaw) ? productRaw[0] : productRaw;
  const product =
    productObj && typeof productObj === "object"
      ? (productObj as Record<string, unknown>)
      : null;
  const storesRaw = product?.stores;
  const storeObj = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
  const storeName =
    storeObj && typeof storeObj === "object" && (storeObj as { store_name?: unknown }).store_name != null
      ? String((storeObj as { store_name: unknown }).store_name)
      : "";
  return {
    id: String(row.id),
    productId: String(row.product_id),
    storeId: String(row.store_id),
    storeName,
    title: product?.title != null ? String(product.title) : "",
    imageUrl: product?.image_url == null ? null : String(product.image_url),
    transferable: product?.transferable !== false,
    faceValue: Math.trunc(Number(row.face_value) || 0),
    purchasePrice: Math.trunc(Number(row.purchase_price) || 0),
    remainingBalance: Math.trunc(Number(row.remaining_balance) || 0),
    status: String(row.status ?? ""),
    purchasedAt: String(row.purchased_at ?? row.created_at ?? ""),
    fullyRedeemedAt: row.fully_redeemed_at == null ? null : String(row.fully_redeemed_at),
  };
}

function mapTransfer(row: Record<string, unknown>): GiftWalletTransfer {
  return {
    id: String(row.id),
    instanceId: String(row.instance_id),
    senderUserId: String(row.sender_user_id),
    recipientUserId: String(row.recipient_user_id),
    roomId: row.room_id == null ? null : String(row.room_id),
    status: String(row.status ?? ""),
    createdAt: String(row.created_at ?? ""),
    resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
  };
}

export async function loadGiftWallet(
  sb: SupabaseClient,
  buyerUserId: string
): Promise<{ ok: true; wallet: GiftWalletPayload } | { ok: false; error: string }> {
  const uid = buyerUserId.trim();
  if (!uid) return { ok: false, error: "missing_user" };

  const [instRes, pendingRes, sentRes] = await Promise.all([
    sb
      .from(GIFT_TABLES.instances)
      .select(
        "id, product_id, store_id, face_value, purchase_price, remaining_balance, status, purchased_at, created_at, fully_redeemed_at, gift_certificate_products(title, image_url, transferable, stores(store_name))"
      )
      .eq("current_owner_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from(GIFT_TABLES.transfers)
      .select(
        "id, instance_id, sender_user_id, recipient_user_id, room_id, status, created_at, resolved_at"
      )
      .eq("recipient_user_id", uid)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from(GIFT_TABLES.transfers)
      .select(
        "id, instance_id, sender_user_id, recipient_user_id, room_id, status, created_at, resolved_at"
      )
      .eq("sender_user_id", uid)
      .in("status", ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (instRes.error) return { ok: false, error: instRes.error.message };
  if (pendingRes.error) return { ok: false, error: pendingRes.error.message };
  if (sentRes.error) return { ok: false, error: sentRes.error.message };

  const available: GiftWalletInstance[] = [];
  const locked: GiftWalletInstance[] = [];
  const fullyRedeemed: GiftWalletInstance[] = [];

  for (const raw of instRes.data ?? []) {
    const row = raw as Record<string, unknown>;
    const mapped = mapInstance(row);
    if (mapped.status === "GIFT_LOCKED") locked.push(mapped);
    else if (mapped.status === "FULLY_REDEEMED") fullyRedeemed.push(mapped);
    else if (mapped.status === "ACTIVE" || mapped.status === "PARTIALLY_REDEEMED") {
      available.push(mapped);
    }
  }

  return {
    ok: true,
    wallet: {
      available,
      locked,
      fullyRedeemed,
      pendingTransfers: (pendingRes.data ?? []).map((r) => mapTransfer(r as Record<string, unknown>)),
      sentTransfers: (sentRes.data ?? []).map((r) => mapTransfer(r as Record<string, unknown>)),
    },
  };
}
