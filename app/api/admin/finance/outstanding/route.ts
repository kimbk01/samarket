import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/outstanding */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const storeId = new URL(req.url).searchParams.get("storeId")?.trim() ?? "";
  let q = gate.sb
    .from("store_sale_fee_obligations")
    .select(
      "id, store_id, order_id, fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (storeId) q = q.eq("store_id", storeId);
  else q = q.eq("status", "open");

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}
