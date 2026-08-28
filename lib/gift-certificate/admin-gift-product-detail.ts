import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import { loadAdminGiftLedgerRedemptions } from "@/lib/gift-certificate/admin-gift-ledger-loaders";
import {
  aggregateGiftRevenuePendingRecognized,
} from "@/lib/gift-certificate/gift-revenue-recognition";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import type { GiftScope } from "@/lib/gift-certificate/gift-certificate-domain-contract";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

function firstObject(value: unknown): Record<string, unknown> | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

export type AdminGiftProductDetailPayload = {
  product: Record<string, unknown>;
  stats: {
    issued: number;
    active: number;
    giftLocked: number;
    partiallyRedeemed: number;
    fullyRedeemed: number;
    outstanding: number;
    redeemedGross: number;
    pendingGross: number;
    recognizedGross: number;
    platformFee: number;
    merchantNet: number;
  };
  instances: Array<Record<string, unknown>>;
  transfers: Array<Record<string, unknown>>;
  redemptions: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
};

export async function loadAdminGiftProductDetail(
  sb: SupabaseClient,
  productId: string
): Promise<AdminGiftProductDetailPayload | null> {
  const { data: row, error } = await sb
    .from(GIFT_TABLES.products)
    .select(
      "*, stores(store_name, owner_user_id, approval_status, business_type)"
    )
    .eq("id", productId)
    .maybeSingle();
  if (error || !row) return null;

  const productRaw = row as Record<string, unknown>;
  const giftScope: GiftScope = s(productRaw.gift_scope) === "PLATFORM" ? "PLATFORM" : "STORE";
  const storeObj = firstObject(productRaw.stores);
  const storeName = storeObj ? s(storeObj.store_name) : "";
  const ownerUserId = storeObj ? s(storeObj.owner_user_id) : "";

  const { data: instancesRaw } = await sb
    .from(GIFT_TABLES.instances)
    .select(
      "id, public_gift_number, gift_scope, store_id, purchaser_user_id, current_owner_user_id, face_value, purchase_price, remaining_balance, status, purchased_at, created_at, updated_at"
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(100);

  const instances = (instancesRaw ?? []) as Record<string, unknown>[];
  const instanceIds = instances.map((r) => s(r.id)).filter(Boolean);

  const stats = {
    issued: n(productRaw.issued_count),
    active: 0,
    giftLocked: 0,
    partiallyRedeemed: 0,
    fullyRedeemed: 0,
    outstanding: 0,
    redeemedGross: 0,
    pendingGross: 0,
    recognizedGross: 0,
    platformFee: 0,
    merchantNet: 0,
  };

  for (const inst of instances) {
    const st = s(inst.status);
    if (st === "ACTIVE") stats.active += 1;
    if (st === "GIFT_LOCKED") stats.giftLocked += 1;
    if (st === "PARTIALLY_REDEEMED") stats.partiallyRedeemed += 1;
    if (st === "FULLY_REDEEMED") stats.fullyRedeemed += 1;
    if (st === "ACTIVE" || st === "PARTIALLY_REDEEMED" || st === "GIFT_LOCKED") {
      stats.outstanding += Math.max(0, n(inst.remaining_balance));
    }
  }

  const profileIds = instances.flatMap((r) => [s(r.purchaser_user_id), s(r.current_owner_user_id)]);
  if (ownerUserId) profileIds.push(ownerUserId);
  const profiles = await loadAdminGiftProfileMap(sb, profileIds);

  let transfers: Record<string, unknown>[] = [];
  const redemptions: Record<string, unknown>[] = [];
  const redemptionByStore = new Map<string, { store_id: string; store_name: string; gross: number; fee: number; net: number }>();

  if (instanceIds.length) {
    const [{ data: transfersRaw }, ledgerResult] = await Promise.all([
      sb
        .from(GIFT_TABLES.transfers)
        .select("id, instance_id, sender_user_id, recipient_user_id, status, created_at, resolved_at, room_id")
        .in("instance_id", instanceIds)
        .order("created_at", { ascending: false })
        .limit(100),
      loadAdminGiftLedgerRedemptions(sb, { productId, limit: 100 }),
    ]);

    const instById = new Map(instances.map((r) => [s(r.id), r]));
    transfers = ((transfersRaw ?? []) as Record<string, unknown>[]).map((t) => {
      const inst = instById.get(s(t.instance_id));
      return {
        id: s(t.id),
        instanceId: s(t.instance_id),
        publicGiftNumber: inst ? s(inst.public_gift_number) : "",
        senderUserId: s(t.sender_user_id),
        senderLabel: adminGiftProfileLabel(profiles.get(s(t.sender_user_id))),
        recipientUserId: s(t.recipient_user_id),
        recipientLabel: adminGiftProfileLabel(profiles.get(s(t.recipient_user_id))),
        status: s(t.status),
        offeredAt: s(t.created_at),
        resolvedAt: t.resolved_at == null ? null : s(t.resolved_at),
        roomId: t.room_id == null ? null : s(t.room_id),
      };
    });

    const ledgerRows = ledgerResult.ok ? ledgerResult.redemptions : [];
    for (const r of ledgerRows) {
      const reversed = r.reversed;
      const gross = Math.max(0, r.gross);
      if (!reversed) {
        stats.redeemedGross += gross;
        const totals = aggregateGiftRevenuePendingRecognized([
          {
            reversed: false,
            recognized: r.recognitionState === "recognized",
            redeemedAmount: gross,
            platformFeeAmount: r.platformFee,
            merchantNetAmount: r.merchantNet,
          },
        ]);
        stats.pendingGross += totals.pendingGross;
        stats.recognizedGross += totals.recognizedGross;
        stats.platformFee += totals.recognizedPlatformFee;
        stats.merchantNet += totals.recognizedMerchantNet;

        const sid = r.storeId;
        if (sid) {
          const prev = redemptionByStore.get(sid) ?? {
            store_id: sid,
            store_name: r.storeName || "",
            gross: 0,
            fee: 0,
            net: 0,
          };
          prev.gross += gross;
          prev.fee += Math.max(0, r.platformFee);
          prev.net += Math.max(0, r.merchantNet);
          redemptionByStore.set(sid, prev);
        }
      }
      redemptions.push({
        id: r.id,
        instanceId: r.instanceId,
        publicGiftNumber: r.publicGiftNumber,
        giftScope: r.giftScope || giftScope,
        redeemedStoreId: r.storeId || null,
        redeemedStoreName: r.storeName || "",
        orderId: r.orderId || null,
        orderNo: r.orderNo,
        orderStatus: r.orderStatus,
        usedAmount: gross,
        platformFee: r.platformFee,
        merchantNet: r.merchantNet,
        reversed,
        createdAt: r.usedAt,
        recognitionState:
          r.recognitionState === "reversed"
            ? "REVERSED"
            : r.recognitionState === "recognized"
              ? "RECOGNIZED"
              : "PENDING",
      });
    }
  }

  const instanceRows = instances.map((r) => ({
    id: s(r.id),
    publicGiftNumber: s(r.public_gift_number),
    giftScope: s(r.gift_scope) || giftScope,
    originalBuyerUserId: s(r.purchaser_user_id),
    originalBuyerLabel: adminGiftProfileLabel(profiles.get(s(r.purchaser_user_id))),
    currentOwnerUserId: s(r.current_owner_user_id),
    currentOwnerLabel: adminGiftProfileLabel(profiles.get(s(r.current_owner_user_id))),
    faceValue: n(r.face_value),
    remainingBalance: n(r.remaining_balance),
    status: s(r.status),
    purchasedAt: s(r.purchased_at) || s(r.created_at),
    lastActivityAt: s(r.updated_at) || s(r.purchased_at) || s(r.created_at),
  }));

  const updatedAt = s(productRaw.updated_at);
  const createdAt = s(productRaw.created_at);
  const auditEvents: Array<Record<string, unknown>> = [];
  const { data: adminEventRows } = await sb
    .from(GIFT_TABLES.adminEvents)
    .select("id, event_type, reason, created_at, reference")
    .eq("entity_type", "product")
    .eq("entity_id", productId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (adminEventRows && adminEventRows.length > 0) {
    for (const raw of adminEventRows as Record<string, unknown>[]) {
      auditEvents.push({
        id: s(raw.id),
        eventType: s(raw.event_type),
        at: s(raw.created_at),
        summary: s(raw.reason) || s(raw.reference) || s(productRaw.title),
      });
    }
  } else {
    auditEvents.push({
      id: `product-create:${productId}`,
      eventType: "PRODUCT_CREATED",
      at: createdAt,
      summary: s(productRaw.title),
    });
    if (updatedAt && updatedAt !== createdAt) {
      auditEvents.push({
        id: `product-update:${productId}:${updatedAt}`,
        eventType: productRaw.archived_at
          ? "PRODUCT_ARCHIVED"
          : productRaw.active
            ? "PRODUCT_UPDATED"
            : "PRODUCT_PAUSED",
        at: updatedAt,
        summary: s(productRaw.title),
      });
    }
  }

  const product = {
    id: productId,
    gift_scope: giftScope,
    creation_source: productRaw.creation_source == null ? null : s(productRaw.creation_source),
    store_id: giftScope === "PLATFORM" ? null : s(productRaw.store_id) || null,
    store_name: giftScope === "PLATFORM" ? "" : storeName,
    owner_user_id: ownerUserId || null,
    owner_label: ownerUserId ? adminGiftProfileLabel(profiles.get(ownerUserId)) : "",
    application_id: productRaw.application_id == null ? null : s(productRaw.application_id),
    title: s(productRaw.title),
    face_value: n(productRaw.face_value),
    purchase_price: n(productRaw.purchase_price),
    platform_fee_rate: n(productRaw.platform_fee_rate),
    transferable: productRaw.transferable !== false,
    sales_starts_at: productRaw.sales_starts_at == null ? null : s(productRaw.sales_starts_at),
    sales_ends_at: productRaw.sales_ends_at == null ? null : s(productRaw.sales_ends_at),
    active: productRaw.active === true,
    mall_visible: productRaw.mall_visible !== false,
    archived_at: productRaw.archived_at == null ? null : s(productRaw.archived_at),
    image_url: productRaw.image_url == null ? null : s(productRaw.image_url),
    issued_count: n(productRaw.issued_count),
    max_issuance: productRaw.max_issuance == null ? null : n(productRaw.max_issuance),
    expiry_policy: s(productRaw.expiry_policy) || "NO_EXPIRY",
    validity_days: productRaw.validity_days == null ? null : n(productRaw.validity_days),
    fixed_valid_until:
      productRaw.fixed_valid_until == null ? null : s(productRaw.fixed_valid_until).slice(0, 10),
    discount_funding_party: s(productRaw.discount_funding_party) || "NONE",
    platform_funded_units: n(productRaw.platform_funded_units),
    merchant_funded_units: n(productRaw.merchant_funded_units),
    created_at: createdAt,
    updated_at: updatedAt,
    outstanding_balance: stats.outstanding,
    redeemed_gross: stats.redeemedGross,
    redemption_by_store: [...redemptionByStore.values()],
    money_locked: false,
  };

  return {
    product,
    stats,
    instances: instanceRows,
    transfers,
    redemptions,
    auditEvents: auditEvents.sort((a, b) => String(b.at).localeCompare(String(a.at))),
  };
}
