import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRedemptionRecognizedFromLedger } from "@/lib/gift-certificate/gift-revenue-recognition";
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
  const publicNumberByInstance = new Map<string, string>();
  const giftScopeByInstance = new Map<string, "STORE" | "PLATFORM">();
  const orderNoById = new Map<string, string | null>();
  const orderStatusById = new Map<string, string>();
  const customerLabelByOrder = new Map<string, string>();

  if (instanceIds.length > 0) {
    const { data: instRows } = await sb
      .from(GIFT_TABLES.instances)
      .select("id, public_gift_number, product_id, gift_scope")
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
      publicNumberByInstance.set(
        id,
        String((inst as { public_gift_number?: string | null }).public_gift_number ?? "")
      );
      giftScopeByInstance.set(
        id,
        String((inst as { gift_scope?: string }).gift_scope ?? "") === "PLATFORM"
          ? "PLATFORM"
          : "STORE"
      );
    }
  }

  if (orderIds.length > 0) {
    const { data: orders } = await sb
      .from("store_orders")
      .select("id, order_no, order_status, user_id")
      .eq("store_id", sid)
      .in("id", orderIds)
      .limit(200);
    const buyerIds = [
      ...new Set(
        (orders ?? [])
          .map((o) => String((o as { user_id?: string | null }).user_id ?? "").trim())
          .filter(Boolean)
      ),
    ];
    const labelByBuyer = new Map<string, string>();
    if (buyerIds.length > 0) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, display_name, nickname, username")
        .in("id", buyerIds)
        .limit(200);
      for (const p of profiles ?? []) {
        const id = String((p as { id: string }).id);
        const display = String((p as { display_name?: string }).display_name ?? "").trim();
        const nick = String((p as { nickname?: string }).nickname ?? "").trim();
        const user = String((p as { username?: string }).username ?? "").trim();
        const raw = display || nick || user || id.slice(0, 8);
        // Mask: keep first char + *** + last digit/char if long enough
        const masked =
          raw.length <= 2
            ? `${raw[0] ?? "?"}***`
            : `${raw.slice(0, 1)}***${raw.slice(-1)}`;
        labelByBuyer.set(id, masked);
      }
    }
    for (const o of orders ?? []) {
      const oid = String((o as { id: string }).id);
      orderNoById.set(
        oid,
        (o as { order_no?: string | null }).order_no != null
          ? String((o as { order_no: string }).order_no)
          : null
      );
      orderStatusById.set(oid, String((o as { order_status?: string | null }).order_status ?? ""));
      const uid = String((o as { user_id?: string | null }).user_id ?? "").trim();
      customerLabelByOrder.set(
        oid,
        uid ? labelByBuyer.get(uid) || `${uid.slice(0, 1)}***${uid.slice(-1)}` : "—"
      );
    }
  }

  const redemptionIds = rows.map((r) => String((r as { id: string }).id));
  const recognizedIds = new Set<string>();
  if (redemptionIds.length > 0) {
    const { data: ledgerRows } = await sb
      .from(GIFT_TABLES.revenueLedger)
      .select("redemption_id, entry_type, amount")
      .in("redemption_id", redemptionIds)
      .in("entry_type", ["REVENUE_AVAILABLE", "RECOGNITION_CORRECTION", "REVERSED"])
      .limit(2000);
    const byRed = new Map<string, Array<{ entry_type: string; amount: number }>>();
    for (const lr of ledgerRows ?? []) {
      const rid = String((lr as { redemption_id: string }).redemption_id);
      const list = byRed.get(rid) ?? [];
      list.push({
        entry_type: String((lr as { entry_type: string }).entry_type),
        amount: Math.trunc(Number((lr as { amount?: number }).amount) || 0),
      });
      byRed.set(rid, list);
    }
    for (const [rid, entries] of byRed) {
      if (isRedemptionRecognizedFromLedger(entries)) recognizedIds.add(rid);
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
      customerLabel: customerLabelByOrder.get(orderId) || "—",
      instanceId,
      publicGiftNumber: publicNumberByInstance.get(instanceId) ?? "",
      giftScope: giftScopeByInstance.get(instanceId) ?? "STORE",
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
