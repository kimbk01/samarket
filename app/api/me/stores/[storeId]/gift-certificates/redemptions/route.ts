import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/stores/[storeId]/gift-certificates/redemptions
 * Owner same-store redemption list with fee snapshot (server authority).
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data, error } = await sb
    .from(GIFT_TABLES.redemptions)
    .select(
      "id, order_id, instance_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, reversed, created_at, reversed_at"
    )
    .eq("store_id", sid)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const instanceIds = [...new Set(rows.map((r) => String(r.instance_id)))];
  const orderIds = [...new Set(rows.map((r) => String(r.order_id)))];

  const titleByInstance = new Map<string, string>();
  const orderNoById = new Map<string, string | null>();
  const orderStatusById = new Map<string, string>();

  if (instanceIds.length > 0) {
    const { data: instRows } = await sb
      .from(GIFT_TABLES.instances)
      .select("id, product_id")
      .in("id", instanceIds)
      .limit(200);
    const productIds = [
      ...new Set((instRows ?? []).map((r) => String((r as { product_id?: string }).product_id ?? "")).filter(Boolean)),
    ];
    const titleByProduct = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: products } = await sb
        .from(GIFT_TABLES.products)
        .select("id, title")
        .in("id", productIds)
        .limit(200);
      for (const p of products ?? []) {
        titleByProduct.set(String((p as { id: string }).id), String((p as { title?: string }).title ?? ""));
      }
    }
    for (const inst of instRows ?? []) {
      const id = String((inst as { id: string }).id);
      const pid = String((inst as { product_id?: string }).product_id ?? "");
      titleByInstance.set(id, titleByProduct.get(pid) ?? "");
    }
  }

  if (orderIds.length > 0) {
    const { data: orders } = await sb
      .from("store_orders")
      .select("id, order_no, order_status")
      .eq("store_id", sid)
      .in("id", orderIds)
      .limit(200);
    for (const o of orders ?? []) {
      orderNoById.set(
        String((o as { id: string }).id),
        (o as { order_no?: string | null }).order_no != null
          ? String((o as { order_no: string }).order_no)
          : null
      );
      orderStatusById.set(
        String((o as { id: string }).id),
        String((o as { order_status?: string | null }).order_status ?? "")
      );
    }
  }

  const redemptionIds = rows.map((r) => String((r as { id: string }).id));
  const recognizedIds = new Set<string>();
  if (redemptionIds.length > 0) {
    const { data: ledgerRows } = await sb
      .from(GIFT_TABLES.revenueLedger)
      .select("redemption_id")
      .in("redemption_id", redemptionIds)
      .eq("entry_type", "REVENUE_AVAILABLE")
      .limit(500);
    for (const lr of ledgerRows ?? []) {
      recognizedIds.add(String((lr as { redemption_id: string }).redemption_id));
    }
  }

  const redemptions = rows.map((row) => {
    const r = row as Record<string, unknown>;
    const instanceId = String(r.instance_id);
    const orderId = String(r.order_id);
    return {
      id: String(r.id),
      orderId,
      orderNo: orderNoById.get(orderId) ?? null,
      orderStatus: orderStatusById.get(orderId) || null,
      instanceId,
      giftTitle: titleByInstance.get(instanceId) ?? "",
      redeemedAmount: Math.trunc(Number(r.redeemed_amount) || 0),
      platformFeeAmount: Math.trunc(Number(r.platform_fee_amount) || 0),
      merchantNetAmount: Math.trunc(Number(r.merchant_net_amount) || 0),
      platformFeeRateSnapshot: Math.trunc(Number(r.platform_fee_rate_snapshot) || 0),
      recognized: recognizedIds.has(String(r.id)),
      reversed: r.reversed === true,
      createdAt: String(r.created_at ?? ""),
      reversedAt: r.reversed_at == null ? null : String(r.reversed_at),
    };
  });

  return NextResponse.json({ ok: true, redemptions });
}
