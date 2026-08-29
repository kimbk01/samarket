/**
 * G4 — buyer gift certificate wallet projection (instances + transfers).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export type GiftWalletRedemptionSummary = {
  storeId: string;
  storeName: string;
  redeemedAmount: number;
  redeemedAt: string;
};

export type GiftWalletInstance = {
  id: string;
  publicGiftNumber?: string;
  productId: string;
  giftScope: "STORE" | "PLATFORM";
  /** Issuer store for STORE gifts; null for PLATFORM (redeem scope is checkout store). */
  storeId: string | null;
  storeName: string;
  storeLogoUrl?: string | null;
  title: string;
  imageUrl: string | null;
  transferable: boolean;
  faceValue: number;
  purchasePrice: number;
  remainingBalance: number;
  status: string;
  purchasedAt: string;
  fullyRedeemedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  /** G6 — latest redemption store name only */
  latestRedemptionStoreName?: string | null;
  latestRedemptionAt?: string | null;
  redemptionHistory?: GiftWalletRedemptionSummary[];
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
  giftScope?: "STORE" | "PLATFORM";
  title?: string;
  storeName?: string;
  storeLogoUrl?: string | null;
  imageUrl?: string | null;
  faceValue?: number;
  remainingBalance?: number;
  senderDisplayName?: string;
  recipientDisplayName?: string;
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
  const storeLogoRaw =
    storeObj && typeof storeObj === "object"
      ? (storeObj as { profile_image_url?: unknown }).profile_image_url
      : null;
  const storeLogoUrl =
    storeLogoRaw == null || String(storeLogoRaw).trim() === "" ? null : String(storeLogoRaw).trim();
  const scopeRaw = String(row.gift_scope ?? product?.gift_scope ?? "STORE").trim();
  const giftScope = scopeRaw === "PLATFORM" ? "PLATFORM" : "STORE";
  const storeIdRaw = row.store_id == null ? "" : String(row.store_id).trim();
  return {
    id: String(row.id),
    publicGiftNumber: String(row.public_gift_number ?? ""),
    productId: String(row.product_id),
    giftScope,
    storeId: giftScope === "PLATFORM" ? null : storeIdRaw || null,
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
    validFrom: row.valid_from == null ? null : String(row.valid_from).slice(0, 10),
    validUntil: row.valid_until == null ? null : String(row.valid_until).slice(0, 10),
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

async function enrichTransferRows(
  sb: SupabaseClient,
  transfers: GiftWalletTransfer[]
): Promise<GiftWalletTransfer[]> {
  if (!transfers.length) return transfers;
  const instanceIds = [...new Set(transfers.map((t) => t.instanceId).filter(Boolean))];
  const userIds = [
    ...new Set(transfers.flatMap((t) => [t.senderUserId, t.recipientUserId]).filter(Boolean)),
  ];

  const [{ data: instRows }, { data: profileRows }] = await Promise.all([
    sb
      .from(GIFT_TABLES.instances)
      .select(
        "id, gift_scope, face_value, remaining_balance, gift_certificate_products(title, image_url, gift_scope, stores(store_name, profile_image_url))"
      )
      .in("id", instanceIds),
    userIds.length
      ? sb.from("profiles").select("id, nickname, dibay_id").in("id", userIds.slice(0, 100))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const instById = new Map<string, Record<string, unknown>>();
  for (const raw of instRows ?? []) {
    instById.set(String((raw as Record<string, unknown>).id), raw as Record<string, unknown>);
  }

  const nickById = new Map<string, string>();
  for (const raw of profileRows ?? []) {
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "");
    const nick = String(row.nickname ?? row.dibay_id ?? "").trim();
    if (id && nick) nickById.set(id, nick);
  }

  return transfers.map((t) => {
    const inst = instById.get(t.instanceId);
    if (!inst) return t;
    const productRaw = inst.gift_certificate_products;
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
    const scopeRaw = String(inst.gift_scope ?? product?.gift_scope ?? "STORE").trim();
    const giftScope = scopeRaw === "PLATFORM" ? "PLATFORM" : "STORE";
    const storeLogoRaw =
      storeObj && typeof storeObj === "object"
        ? (storeObj as { profile_image_url?: unknown }).profile_image_url
        : null;
    const storeLogoUrl =
      storeLogoRaw == null || String(storeLogoRaw).trim() === ""
        ? null
        : String(storeLogoRaw).trim();
    return {
      ...t,
      giftScope,
      title: product?.title != null ? String(product.title) : "",
      storeName: giftScope === "PLATFORM" ? "DIBAY" : storeName,
      storeLogoUrl: giftScope === "PLATFORM" ? null : storeLogoUrl,
      imageUrl: product?.image_url == null ? null : String(product.image_url),
      faceValue: Math.trunc(Number(inst.face_value) || 0),
      remainingBalance: Math.trunc(Number(inst.remaining_balance) || 0),
      senderDisplayName: nickById.get(t.senderUserId),
      recipientDisplayName: nickById.get(t.recipientUserId),
    };
  });
}

async function attachRedemptionSummaries(
  sb: SupabaseClient,
  instances: GiftWalletInstance[]
): Promise<GiftWalletInstance[]> {
  const redeemedIds = instances.filter((i) => i.status === "FULLY_REDEEMED").map((i) => i.id);
  if (!redeemedIds.length) return instances;

  const { data: redRows } = await sb
    .from(GIFT_TABLES.redemptions)
    .select("instance_id, store_id, redeemed_amount, created_at, reversed")
    .in("instance_id", redeemedIds)
    .eq("reversed", false)
    .order("created_at", { ascending: false })
    .limit(300);

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

  const byInstance = new Map<string, GiftWalletRedemptionSummary[]>();
  for (const raw of (redRows ?? []) as Record<string, unknown>[]) {
    const instanceId = String(raw.instance_id ?? "");
    const storeId = String(raw.store_id ?? "").trim();
    if (!instanceId || !storeId) continue;
    const list = byInstance.get(instanceId) ?? [];
    list.push({
      storeId,
      storeName: storeNameById.get(storeId) ?? storeId,
      redeemedAmount: Math.trunc(Number(raw.redeemed_amount) || 0),
      redeemedAt: String(raw.created_at ?? ""),
    });
    byInstance.set(instanceId, list);
  }

  return instances.map((inst) => {
    const history = byInstance.get(inst.id) ?? [];
    if (!history.length) return inst;
    const latest = history[0];
    return {
      ...inst,
      latestRedemptionStoreName: latest.storeName,
      latestRedemptionAt: latest.redeemedAt,
      redemptionHistory: history,
    };
  });
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
        "id, public_gift_number, product_id, store_id, gift_scope, face_value, purchase_price, remaining_balance, status, purchased_at, created_at, fully_redeemed_at, valid_from, valid_until, gift_certificate_products(title, image_url, transferable, gift_scope, stores(store_name, profile_image_url))"
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

  const fullyRedeemedEnriched = await attachRedemptionSummaries(sb, fullyRedeemed);

  const pendingTransfers = await enrichTransferRows(
    sb,
    (pendingRes.data ?? []).map((r) => mapTransfer(r as Record<string, unknown>))
  );
  const sentTransfers = await enrichTransferRows(
    sb,
    (sentRes.data ?? []).map((r) => mapTransfer(r as Record<string, unknown>))
  );

  return {
    ok: true,
    wallet: {
      available,
      locked,
      fullyRedeemed: fullyRedeemedEnriched,
      pendingTransfers,
      sentTransfers,
    },
  };
}

export type GiftWalletOverviewSummary = {
  owned: number;
  receivedPending: number;
};

/** Lightweight overview counts — no product joins or transfer enrichment. */
export async function loadGiftWalletOverviewSummary(
  sb: SupabaseClient,
  buyerUserId: string
): Promise<{ ok: true; summary: GiftWalletOverviewSummary } | { ok: false; error: string }> {
  const uid = buyerUserId.trim();
  if (!uid) return { ok: false, error: "missing_user" };

  const [instRes, pendingRes] = await Promise.all([
    sb
      .from(GIFT_TABLES.instances)
      .select("status")
      .eq("current_owner_user_id", uid)
      .limit(300),
    sb
      .from(GIFT_TABLES.transfers)
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", uid)
      .eq("status", "PENDING"),
  ]);

  if (instRes.error) return { ok: false, error: instRes.error.message };
  if (pendingRes.error) return { ok: false, error: pendingRes.error.message };

  let owned = 0;
  for (const raw of instRes.data ?? []) {
    const status = String((raw as { status?: string }).status ?? "");
    if (status === "ACTIVE" || status === "PARTIALLY_REDEEMED" || status === "GIFT_LOCKED") {
      owned += 1;
    }
  }

  return {
    ok: true,
    summary: {
      owned,
      receivedPending: pendingRes.count ?? 0,
    },
  };
}
