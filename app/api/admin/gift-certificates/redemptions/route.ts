import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import {
  isRedemptionRecognizedFromLedger,
  resolveGiftRedemptionRecognitionState,
} from "@/lib/gift-certificate/gift-revenue-recognition";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

async function loadLedgerMap(
  sb: SupabaseClient,
  redemptionIds: string[]
): Promise<Map<string, Array<{ entry_type: string; amount: number; created_at: string }>>> {
  const map = new Map<string, Array<{ entry_type: string; amount: number; created_at: string }>>();
  if (!redemptionIds.length) return map;
  const { data } = await sb
    .from(GIFT_TABLES.revenueLedger)
    .select("redemption_id, entry_type, amount, created_at")
    .in("redemption_id", redemptionIds)
    .limit(20000);
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const rid = s(row.redemption_id);
    if (!rid) continue;
    const list = map.get(rid) ?? [];
    list.push({
      entry_type: s(row.entry_type),
      amount: n(row.amount),
      created_at: s(row.created_at),
    });
    map.set(rid, list);
  }
  return map;
}

/** GET /api/admin/gift-certificates/redemptions — global usage list (read-only). */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const url = new URL(req.url);
  const filter = s(url.searchParams.get("filter")).toLowerCase() || "all";
  const q = s(url.searchParams.get("q")).toUpperCase();

  const { data, error } = await sb
    .from(GIFT_TABLES.redemptions)
    .select(
      "id, order_id, instance_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, reversed, created_at, reversed_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const instanceIds = [...new Set(rows.map((r) => s(r.instance_id)).filter(Boolean))];
  const orderIds = [...new Set(rows.map((r) => s(r.order_id)).filter(Boolean))];
  const storeIds = [...new Set(rows.map((r) => s(r.store_id)).filter(Boolean))];
  const redemptionIds = rows.map((r) => s(r.id)).filter(Boolean);

  const [{ data: instances }, { data: orders }, { data: stores }, ledgerMap] = await Promise.all([
    instanceIds.length
      ? sb
          .from(GIFT_TABLES.instances)
          .select("id, public_gift_number, product_id, current_owner_user_id")
          .in("id", instanceIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? sb.from("store_orders").select("id, order_no, order_status, user_id").in("id", orderIds)
      : Promise.resolve({ data: [] }),
    storeIds.length
      ? sb.from("stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] }),
    loadLedgerMap(sb, redemptionIds),
  ]);

  const instById = new Map(
    ((instances ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), r])
  );
  const productIds = [
    ...new Set(
      ((instances ?? []) as Record<string, unknown>[])
        .map((r) => s(r.product_id))
        .filter(Boolean)
    ),
  ];
  const { data: products } = productIds.length
    ? await sb.from(GIFT_TABLES.products).select("id, title").in("id", productIds)
    : { data: [] };
  const titleByProduct = new Map(
    ((products ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), s(r.title)])
  );
  const storeNameById = new Map(
    ((stores ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), s(r.store_name)])
  );
  const orderById = new Map(
    ((orders ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), r])
  );

  const buyerIds = [
    ...new Set(
      ((orders ?? []) as Record<string, unknown>[])
        .map((r) => s(r.user_id))
        .filter(Boolean)
    ),
  ];
  const profileMap = await loadAdminGiftProfileMap(sb, buyerIds);

  let list = rows.map((row) => {
    const id = s(row.id);
    const instanceId = s(row.instance_id);
    const orderId = s(row.order_id);
    const storeId = s(row.store_id);
    const inst = instById.get(instanceId);
    const order = orderById.get(orderId);
    const ledger = ledgerMap.get(id) ?? [];
    const recognized = isRedemptionRecognizedFromLedger(ledger);
    const reversed = row.reversed === true;
    const recognitionState = resolveGiftRedemptionRecognitionState({ reversed, recognized });
    const recognizedAt =
      recognitionState === "recognized"
        ? ledger.find((e) => e.entry_type === "REVENUE_AVAILABLE")?.created_at ?? null
        : null;
    const buyerId = s(order?.user_id);
    return {
      id,
      usedAt: s(row.created_at),
      customerLabel: adminGiftProfileLabel(profileMap.get(buyerId)),
      customerUserId: buyerId || null,
      storeId,
      storeName: storeNameById.get(storeId) ?? "",
      publicGiftNumber: s(inst?.public_gift_number),
      instanceId,
      productTitle: titleByProduct.get(s(inst?.product_id)) ?? "",
      orderId,
      orderNo: s(order?.order_no) || null,
      orderStatus: s(order?.order_status) || null,
      gross: n(row.redeemed_amount),
      feeRate: n(row.platform_fee_rate_snapshot),
      platformFee: n(row.platform_fee_amount),
      merchantNet: n(row.merchant_net_amount),
      reversed,
      recognitionState,
      recognizedAt,
    };
  });

  if (q) {
    list = list.filter((row) => {
      const hay = [
        row.publicGiftNumber,
        row.storeName,
        row.customerLabel,
        row.orderNo ?? "",
        row.orderId,
        row.productTitle,
      ]
        .join(" ")
        .toUpperCase();
      return hay.includes(q);
    });
  }

  if (filter === "pending") {
    list = list.filter((r) => r.recognitionState === "pending");
  } else if (filter === "recognized") {
    list = list.filter((r) => r.recognitionState === "recognized");
  } else if (filter === "reversed") {
    list = list.filter((r) => r.recognitionState === "reversed");
  }

  return NextResponse.json({ ok: true, redemptions: list });
}
