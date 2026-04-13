/**
 * GET /api/admin/store-orders/export — CSV (UTF-8 BOM)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

function csvEscape(s: string) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

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
  const storeIdFilter = sp.get("store_id")?.trim();
  const buyerUserIdFilter = sp.get("buyer_user_id")?.trim();
  const paymentStatus = sp.get("payment_status")?.trim();
  const orderStatus = sp.get("order_status")?.trim();
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 500, 1), 2000);

  let q = sb
    .from("store_orders")
    .select(
      "id, order_no, buyer_user_id, store_id, payment_amount, payment_status, order_status, fulfillment_type, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orderId) q = q.eq("id", orderId);
  if (orderNo) q = q.ilike("order_no", `%${orderNo}%`);
  if (storeIdFilter) q = q.eq("store_id", storeIdFilter);
  if (buyerUserIdFilter) q = q.eq("buyer_user_id", buyerUserIdFilter);
  if (paymentStatus) q = q.eq("payment_status", paymentStatus);
  if (orderStatus) q = q.eq("order_status", orderStatus);

  const { data: list, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = list ?? [];
  const storeIds = [...new Set(rows.map((r) => r.store_id as string))];
  const names: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) names[s.id as string] = (s.store_name as string) ?? "";
  }

  const header = ["id", "order_no", "store_id", "store_name", "buyer_user_id", "payment_amount", "payment_status", "order_status", "fulfillment_type", "created_at"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvEscape(r.id as string),
        csvEscape(r.order_no as string),
        csvEscape(r.store_id as string),
        csvEscape(names[r.store_id as string] ?? ""),
        csvEscape(r.buyer_user_id as string),
        csvEscape(String(r.payment_amount ?? "")),
        csvEscape(r.payment_status as string),
        csvEscape(r.order_status as string),
        csvEscape(r.fulfillment_type as string),
        csvEscape(r.created_at as string),
      ].join(",")
    ),
  ];
  const body = "\uFEFF" + lines.join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="store-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
