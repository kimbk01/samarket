/**
 * GET /api/admin/store-orders — 관리자 매장 주문 목록 (서비스 롤)
 * Query: order_id, order_no, payment_status, order_status, limit, include_items=1
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  mapStoreOrderToAdminDelivery,
  type StoreOrderItemRow,
  type StoreOrderRow,
} from "@/lib/admin/map-store-order-to-admin-delivery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const orderId = sp.get("order_id")?.trim();
  const orderNo = sp.get("order_no")?.trim();
  const paymentStatus = sp.get("payment_status")?.trim();
  const orderStatus = sp.get("order_status")?.trim();
  const includeItems = sp.get("include_items") === "1";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 500, 1), 2000);

  let q = sb
    .from("store_orders")
    .select(
      "id, order_no, buyer_user_id, store_id, total_amount, discount_amount, payment_amount, delivery_fee_amount, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, created_at, updated_at, auto_complete_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orderId) q = q.eq("id", orderId);
  if (orderNo) q = q.ilike("order_no", `%${orderNo}%`);
  if (paymentStatus) q = q.eq("payment_status", paymentStatus);
  if (orderStatus) q = q.eq("order_status", orderStatus);

  const { data: orderRows, error } = await q;
  if (error) {
    console.error("[admin store-orders GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = orderRows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id as string))];
  const buyerIds = [...new Set(list.map((r) => r.buyer_user_id as string))];

  const storeById: Record<string, { store_name?: string; slug?: string; owner_user_id?: string }> = {};
  if (storeIds.length) {
    const { data: stores } = await sb
      .from("stores")
      .select("id, store_name, slug, owner_user_id")
      .in("id", storeIds);
    for (const s of stores ?? []) {
      storeById[s.id as string] = {
        store_name: s.store_name as string | undefined,
        slug: s.slug as string | undefined,
        owner_user_id: s.owner_user_id as string | undefined,
      };
    }
  }

  const nickByUserId: Record<string, string> = {};
  const mergeNick = (id: string, name: string) => {
    if (!id || !name) return;
    if (!nickByUserId[id]) nickByUserId[id] = name;
  };

  if (buyerIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname, username").in("id", buyerIds);
    for (const p of profiles ?? []) {
      const id = p.id as string;
      const n = (p.nickname ?? p.username ?? id.slice(0, 8)) as string;
      mergeNick(id, n);
    }
    const { data: testUsers } = await sb
      .from("test_users")
      .select("id, display_name, username")
      .in("id", buyerIds);
    for (const t of testUsers ?? []) {
      const id = t.id as string;
      const n = (t.display_name ?? t.username ?? id.slice(0, 8)) as string;
      mergeNick(id, n);
    }
  }

  const ownerIds = [...new Set(Object.values(storeById).map((s) => s.owner_user_id).filter(Boolean))] as string[];
  if (ownerIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname, username").in("id", ownerIds);
    for (const p of profiles ?? []) {
      const id = p.id as string;
      const n = (p.nickname ?? p.username ?? id.slice(0, 8)) as string;
      mergeNick(id, n);
    }
    const { data: testUsers } = await sb
      .from("test_users")
      .select("id, display_name, username")
      .in("id", ownerIds);
    for (const t of testUsers ?? []) {
      const id = t.id as string;
      const n = (t.display_name ?? t.username ?? id.slice(0, 8)) as string;
      mergeNick(id, n);
    }
  }

  const itemsByOrder: Record<string, unknown[]> = {};
  if (includeItems && list.length) {
    const oids = list.map((r) => r.id as string);
    const { data: itemRows, error: iErr } = await sb
      .from("store_order_items")
      .select("id, order_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
      .in("order_id", oids);
    if (iErr) {
      console.error("[admin store-orders items]", iErr);
      return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
    }
    for (const row of itemRows ?? []) {
      const oid = row.order_id as string;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(row);
    }
  }

  const orders = list.map((r) => {
    const sid = r.store_id as string;
    const st = storeById[sid] ?? {};
    const buyerId = r.buyer_user_id as string;
    const ownerId = (st.owner_user_id ?? "") as string;
    const base = {
      id: r.id as string,
      order_no: r.order_no as string,
      store_id: sid,
      store_name: st.store_name ?? "",
      buyer_user_id: buyerId,
      payment_amount: Math.round(Number(r.payment_amount) || 0),
      payment_status: r.payment_status as string,
      order_status: r.order_status as string,
      fulfillment_type: r.fulfillment_type as string,
      created_at: r.created_at as string,
    };
    if (!includeItems) return base;
    const mapped = mapStoreOrderToAdminDelivery({
      order: r as StoreOrderRow,
      items: (itemsByOrder[r.id as string] ?? []) as StoreOrderItemRow[],
      storeName: st.store_name ?? "",
      storeSlug: st.slug ?? "",
      storeOwnerUserId: ownerId,
      storeOwnerName: ownerId ? nickByUserId[ownerId] ?? ownerId.slice(0, 8) : "—",
      buyerDisplayName: nickByUserId[buyerId] ?? buyerId.slice(0, 8),
    });
    return { ...base, admin_delivery: mapped };
  });

  return NextResponse.json({ ok: true, orders });
}
