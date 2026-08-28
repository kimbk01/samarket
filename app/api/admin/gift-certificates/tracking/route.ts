import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function n(value: unknown): number {
  return Math.trunc(Number(value) || 0);
}

function firstObject(value: unknown): Record<string, unknown> | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

function profileLabel(row: Record<string, unknown> | undefined): string {
  if (!row) return "";
  return s(row.display_name) || s(row.nickname) || s(row.email) || s(row.id);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadProfileMap(
  sb: SupabaseClient,
  ids: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.map(s).filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await sb.from("profiles").select("id, display_name, nickname, email").in("id", unique);
  return new Map((data ?? []).map((row: Record<string, unknown>) => [s(row.id), row]));
}

const INSTANCE_SELECT_CORE =
  "id, public_gift_number, product_id, store_id, gift_scope, purchaser_user_id, current_owner_user_id, face_value, purchase_price, purchase_discount_amount, discount_funding_party_snapshot, platform_fee_rate_snapshot, remaining_balance, status, purchased_at, created_at, gift_certificate_products(title, image_url), stores(store_name)";

const INSTANCE_SELECT_WITH_VALIDITY =
  "id, public_gift_number, product_id, store_id, gift_scope, purchaser_user_id, current_owner_user_id, face_value, purchase_price, purchase_discount_amount, discount_funding_party_snapshot, platform_fee_rate_snapshot, remaining_balance, status, purchased_at, created_at, valid_from, valid_until, gift_certificate_products(title, image_url), stores(store_name)";

/** null = unknown; true/false cached after first successful/failed validity select. */
let instanceValidityColumns: boolean | null = null;

function isMissingValidityColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("valid_from") ||
    m.includes("valid_until") ||
    (m.includes("column") && m.includes("does not exist"))
  );
}

function instanceSelect(): string {
  return instanceValidityColumns === false ? INSTANCE_SELECT_CORE : INSTANCE_SELECT_WITH_VALIDITY;
}

function mapInstanceRow(
  row: Record<string, unknown>,
  profileMap: Map<string, Record<string, unknown>>
) {
  const product = firstObject(row.gift_certificate_products);
  const store = firstObject(row.stores);
  const purchaserId = s(row.purchaser_user_id);
  const ownerId = s(row.current_owner_user_id);
  const validFromRaw = row.valid_from;
  const validUntilRaw = row.valid_until;
  return {
    id: s(row.id),
    publicGiftNumber: s(row.public_gift_number),
    giftScope: s(row.gift_scope) === "PLATFORM" ? ("PLATFORM" as const) : ("STORE" as const),
    storeId: s(row.store_id) || null,
    storeName: s(row.gift_scope) === "PLATFORM" ? "" : s(store?.store_name),
    productId: s(row.product_id),
    productTitle: s(product?.title),
    productImageUrl: product?.image_url == null ? null : s(product.image_url),
    originalBuyerUserId: purchaserId,
    originalBuyerLabel: profileLabel(profileMap.get(purchaserId)),
    currentOwnerUserId: ownerId,
    currentOwnerLabel: profileLabel(profileMap.get(ownerId)),
    faceValue: n(row.face_value),
    purchasePrice: n(row.purchase_price),
    purchaseDiscountAmount: n(row.purchase_discount_amount),
    discountFundingPartySnapshot: s(row.discount_funding_party_snapshot) || "UNKNOWN_LEGACY",
    platformFeeRateSnapshot: n(row.platform_fee_rate_snapshot),
    remainingBalance: n(row.remaining_balance),
    status: s(row.status),
    purchasedAt: s(row.purchased_at),
    createdAt: s(row.created_at),
    validFrom: validFromRaw == null ? null : s(validFromRaw).slice(0, 10),
    validUntil: validUntilRaw == null ? null : s(validUntilRaw).slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const url = new URL(req.url);
  const q = s(url.searchParams.get("q")).toUpperCase();
  const status = s(url.searchParams.get("status")).toUpperCase();
  const selected = s(url.searchParams.get("id") || url.searchParams.get("number"));

  const runList = async (select: string) => {
    let query = sb
      .from(GIFT_TABLES.instances)
      .select(select)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);
    if (q) {
      const parts = [`public_gift_number.ilike.%${q}%`];
      if (isUuid(q)) {
        parts.push(
          `id.eq.${q}`,
          `store_id.eq.${q}`,
          `product_id.eq.${q}`,
          `purchaser_user_id.eq.${q}`,
          `current_owner_user_id.eq.${q}`
        );
      }
      query = query.or(parts.join(","));
    }
    return query;
  };

  let listResult = await runList(instanceSelect());
  if (
    listResult.error &&
    instanceValidityColumns !== false &&
    isMissingValidityColumnError(listResult.error.message)
  ) {
    instanceValidityColumns = false;
    listResult = await runList(INSTANCE_SELECT_CORE);
  } else if (!listResult.error && instanceValidityColumns !== false) {
    instanceValidityColumns = true;
  }
  const { data, error } = listResult;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data as unknown as Record<string, unknown>[] | null) ?? [];
  const profileMap = await loadProfileMap(
    sb,
    rows.flatMap((row) => [s(row.purchaser_user_id), s(row.current_owner_user_id)])
  );
  const instances = rows.map((row) => mapInstanceRow(row, profileMap));

  let selectedRow =
    selected.length > 0
      ? instances.find((row) => row.id === selected || row.publicGiftNumber === selected.toUpperCase()) ?? null
      : null;

  if (selected.length > 0 && !selectedRow) {
    let directQuery = sb.from(GIFT_TABLES.instances).select(instanceSelect()).limit(1);
    if (isUuid(selected)) {
      directQuery = directQuery.eq("id", selected);
    } else {
      directQuery = directQuery.eq("public_gift_number", selected.toUpperCase());
    }
    const { data: directRows, error: directError } = await directQuery;
    if (!directError && directRows?.[0]) {
      const directRaw = directRows[0] as unknown as Record<string, unknown>;
      const directProfileMap = await loadProfileMap(sb, [
        s(directRaw.purchaser_user_id),
        s(directRaw.current_owner_user_id),
      ]);
      selectedRow = mapInstanceRow(directRaw, directProfileMap);
      if (!instances.some((row) => row.id === selectedRow!.id)) {
        instances.unshift(selectedRow);
      }
    }
  }

  if (!selectedRow) {
    return NextResponse.json({ ok: true, instances, detail: null });
  }

  const instanceId = selectedRow.id;
  const [
    { data: ownershipRows },
    { data: transferRows },
    { data: redemptionRows },
  ] = await Promise.all([
    sb
      .from(GIFT_TABLES.ownershipEvents)
      .select("id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload, created_at")
      .eq("instance_id", instanceId)
      .order("seq", { ascending: true }),
    sb
      .from(GIFT_TABLES.transfers)
      .select("id, sender_user_id, recipient_user_id, status, room_id, messenger_message_id, created_at, resolved_at")
      .eq("instance_id", instanceId)
      .order("created_at", { ascending: true }),
    sb
      .from(GIFT_TABLES.redemptions)
      .select("id, order_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, reversed, created_at, reversed_at")
      .eq("instance_id", instanceId)
      .order("created_at", { ascending: true }),
  ]);

  const redemptions = (redemptionRows ?? []) as Record<string, unknown>[];
  const redemptionIds = redemptions.map((row) => s(row.id)).filter(Boolean);
  const orderIds = redemptions.map((row) => s(row.order_id)).filter(Boolean);
  const redeemStoreIds = [...new Set(redemptions.map((row) => s(row.store_id)).filter(Boolean))];
  const [{ data: orders }, { data: revenueRows }, { data: redeemStores }] = await Promise.all([
    orderIds.length
      ? sb.from("store_orders").select("id, order_no, order_status").in("id", orderIds)
      : Promise.resolve({ data: [] }),
    redemptionIds.length
      ? sb
          .from(GIFT_TABLES.revenueLedger)
          .select("id, redemption_id, entry_type, amount, created_at")
          .in("redemption_id", redemptionIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    redeemStoreIds.length
      ? sb.from("stores").select("id, store_name").in("id", redeemStoreIds)
      : Promise.resolve({ data: [] }),
  ]);
  const redeemStoreNameById = new Map(
    ((redeemStores ?? []) as Record<string, unknown>[]).map((row) => [s(row.id), s(row.store_name)])
  );
  const orderById = new Map(((orders ?? []) as Record<string, unknown>[]).map((row) => [s(row.id), row]));
  const revenueByRedemption = new Map<string, Record<string, unknown>[]>();
  for (const row of (revenueRows ?? []) as Record<string, unknown>[]) {
    const rid = s(row.redemption_id);
    revenueByRedemption.set(rid, [...(revenueByRedemption.get(rid) ?? []), row]);
  }

  const detailProfileMap = await loadProfileMap(
    sb,
    [...((ownershipRows ?? []) as Record<string, unknown>[]), ...((transferRows ?? []) as Record<string, unknown>[])]
      .flatMap((row) => [s(row.from_user_id), s(row.to_user_id), s(row.actor_user_id), s(row.sender_user_id), s(row.recipient_user_id)])
  );

  const storeId =
    selectedRow.storeId ||
    s(((redemptionRows ?? []) as Record<string, unknown>[])[0]?.store_id) ||
    "";
  const [
    { data: avail },
    { data: cashOutRows },
    { data: conversionRows },
    { data: recoveryRows },
    { data: promoObligationRows },
    { data: promoLedgerRows },
  ] = await Promise.all([
    storeId
      ? sb.rpc("gift_certificate_store_revenue_available", { p_store_id: storeId })
      : Promise.resolve({ data: null }),
    storeId
      ? sb
          .from(GIFT_TABLES.cashOutRequests)
          .select("id, amount, status, created_at, paid_at")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    storeId
      ? sb
          .from(GIFT_TABLES.conversionRequests)
          .select("id, amount, status, created_at, approved_at")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    storeId
      ? sb
          .from(GIFT_TABLES.storeCashRecoveryObligations)
          .select("id, redemption_id, amount_original, amount_remaining, status, created_at")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    sb
      .from(GIFT_TABLES.promoObligations)
      .select("id, party, store_id, contracted_amount, recognized_amount, settled_amount, created_at")
      .eq("instance_id", instanceId)
      .order("created_at", { ascending: true }),
    sb
      .from(GIFT_TABLES.promoLedger)
      .select("id, party, entry_type, amount, redemption_id, related_type, related_id, created_at")
      .eq("instance_id", instanceId)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  const redemptionIdSet = new Set(redemptions.map((row) => s(row.id)));
  const recoveryMapped = ((recoveryRows ?? []) as Record<string, unknown>[]).map((row) => {
    const redemptionId = s(row.redemption_id) || null;
    const exact = redemptionId != null && redemptionIdSet.has(redemptionId);
    return {
      id: s(row.id),
      redemptionId,
      amountOriginal: n(row.amount_original),
      amountRemaining: n(row.amount_remaining),
      status: s(row.status),
      createdAt: s(row.created_at),
      linkage: exact ? ("REDEMPTION" as const) : ("POOL_LEVEL" as const),
    };
  });

  return NextResponse.json({
    ok: true,
    instances,
    detail: {
      instance: selectedRow,
      ownership: ((ownershipRows ?? []) as Record<string, unknown>[]).map((row) => ({
        id: s(row.id),
        seq: n(row.seq),
        eventType: s(row.event_type),
        fromUserId: s(row.from_user_id) || null,
        fromLabel: profileLabel(detailProfileMap.get(s(row.from_user_id))),
        toUserId: s(row.to_user_id) || null,
        toLabel: profileLabel(detailProfileMap.get(s(row.to_user_id))),
        actorUserId: s(row.actor_user_id),
        createdAt: s(row.created_at),
      })),
      transfers: ((transferRows ?? []) as Record<string, unknown>[]).map((row) => ({
        id: s(row.id),
        senderUserId: s(row.sender_user_id),
        senderLabel: profileLabel(detailProfileMap.get(s(row.sender_user_id))),
        recipientUserId: s(row.recipient_user_id),
        recipientLabel: profileLabel(detailProfileMap.get(s(row.recipient_user_id))),
        status: s(row.status),
        offeredAt: s(row.created_at),
        resolvedAt: s(row.resolved_at) || null,
        roomId: s(row.room_id) || null,
        messageId: s(row.messenger_message_id) || null,
      })),
      redemptions: redemptions.map((row) => {
        const order = orderById.get(s(row.order_id));
        return {
          id: s(row.id),
          orderId: s(row.order_id),
          orderNo: s(order?.order_no) || null,
          orderStatus: s(order?.order_status) || null,
          redeemedStoreId: s(row.store_id) || null,
          redeemedStoreName: redeemStoreNameById.get(s(row.store_id)) ?? "",
          usedAmount: n(row.redeemed_amount),
          platformFee: n(row.platform_fee_amount),
          merchantNet: n(row.merchant_net_amount),
          feeRate: n(row.platform_fee_rate_snapshot),
          reversed: row.reversed === true,
          createdAt: s(row.created_at),
          reversedAt: s(row.reversed_at) || null,
          revenue: (revenueByRedemption.get(s(row.id)) ?? []).map((entry) => ({
            id: s(entry.id),
            entryType: s(entry.entry_type),
            amount: n(entry.amount),
            createdAt: s(entry.created_at),
          })),
        };
      }),
      settlement: {
        availableRevenue:
          typeof avail === "number" ? Math.trunc(avail) : Math.trunc(Number(avail) || 0),
        note: "Store-scoped Gift Revenue available (same RPC as Owner).",
        cashOuts: ((cashOutRows ?? []) as Record<string, unknown>[]).map((row) => ({
          id: s(row.id),
          amount: n(row.amount),
          status: s(row.status),
          createdAt: s(row.created_at),
          paidAt: s(row.paid_at) || null,
        })),
        conversions: ((conversionRows ?? []) as Record<string, unknown>[]).map((row) => ({
          id: s(row.id),
          amount: n(row.amount),
          status: s(row.status),
          createdAt: s(row.created_at),
          approvedAt: s(row.approved_at) || null,
        })),
      },
      recovery: recoveryMapped,
      promo: {
        obligations: ((promoObligationRows ?? []) as Record<string, unknown>[]).map((row) => ({
          id: s(row.id),
          party: s(row.party),
          storeId: s(row.store_id) || null,
          contractedAmount: n(row.contracted_amount),
          recognizedAmount: n(row.recognized_amount),
          settledAmount: n(row.settled_amount),
          createdAt: s(row.created_at),
        })),
        ledger: ((promoLedgerRows ?? []) as Record<string, unknown>[]).map((row) => ({
          id: s(row.id),
          party: s(row.party),
          entryType: s(row.entry_type),
          amount: n(row.amount),
          redemptionId: s(row.redemption_id) || null,
          relatedType: s(row.related_type),
          relatedId: s(row.related_id),
          createdAt: s(row.created_at),
        })),
      },
    },
  });
}
