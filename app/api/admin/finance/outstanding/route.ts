import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/outstanding — obligations + store_name join (canonical stores) */
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

  const raw = (data ?? []) as Array<{
    id: string;
    store_id: string;
    order_id: string;
    fee_due_minor: number;
    fee_paid_minor: number;
    fee_outstanding_minor: number;
    status: string;
    created_at: string;
  }>;

  const storeIds = Array.from(new Set(raw.map((r) => String(r.store_id ?? "").trim()).filter(Boolean)));
  const nameById = new Map<string, string>();
  if (storeIds.length > 0) {
    const { data: stores } = await gate.sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of (stores ?? []) as Array<{ id: string; store_name?: string }>) {
      nameById.set(String(s.id), String(s.store_name ?? "").trim());
    }
  }

  const rows = raw.map((r) => ({
    ...r,
    store_name: nameById.get(String(r.store_id)) || null,
  }));

  return NextResponse.json({ ok: true, rows });
}
