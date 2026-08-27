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

export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const url = new URL(req.url);
  const q = s(url.searchParams.get("q")).toUpperCase();
  const status = s(url.searchParams.get("status")).toUpperCase();
  const selected = s(url.searchParams.get("id") || url.searchParams.get("number"));

  let query = sb
    .from(GIFT_TABLES.instances)
    .select(
      "id, public_gift_number, product_id, store_id, purchaser_user_id, current_owner_user_id, face_value, purchase_price, remaining_balance, status, purchased_at, created_at, gift_certificate_products(title), stores(store_name)"
    )
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
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const profileMap = await loadProfileMap(
    sb,
    rows.flatMap((row) => [s(row.purchaser_user_id), s(row.current_owner_user_id)])
  );
  const instances = rows.map((row) => {
    const product = firstObject(row.gift_certificate_products);
    const store = firstObject(row.stores);
    const purchaserId = s(row.purchaser_user_id);
    const ownerId = s(row.current_owner_user_id);
    return {
      id: s(row.id),
      publicGiftNumber: s(row.public_gift_number),
      storeId: s(row.store_id),
      storeName: s(store?.store_name),
      productId: s(row.product_id),
      productTitle: s(product?.title),
      originalBuyerUserId: purchaserId,
      originalBuyerLabel: profileLabel(profileMap.get(purchaserId)),
      currentOwnerUserId: ownerId,
      currentOwnerLabel: profileLabel(profileMap.get(ownerId)),
      faceValue: n(row.face_value),
      purchasePrice: n(row.purchase_price),
      remainingBalance: n(row.remaining_balance),
      status: s(row.status),
      purchasedAt: s(row.purchased_at),
      createdAt: s(row.created_at),
    };
  });

  const selectedRow =
    selected.length > 0
      ? instances.find((row) => row.id === selected || row.publicGiftNumber === selected.toUpperCase())
      : null;
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
      .select("id, order_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, reversed, created_at, reversed_at")
      .eq("instance_id", instanceId)
      .order("created_at", { ascending: true }),
  ]);

  const redemptions = (redemptionRows ?? []) as Record<string, unknown>[];
  const redemptionIds = redemptions.map((row) => s(row.id)).filter(Boolean);
  const orderIds = redemptions.map((row) => s(row.order_id)).filter(Boolean);
  const [{ data: orders }, { data: revenueRows }] = await Promise.all([
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
  ]);
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
    },
  });
}
