import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { POINT_LEDGER_ROW_SELECT } from "@/lib/points/point-query-select";
import { isMissingPointsTable, normalizeLedgerRow } from "@/lib/points/admin-user-points-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/points/ledger?userId=&limit= */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 200) || 200));

  const { sb } = gate;
  let query = sb
    .from("point_ledger")
    .select(POINT_LEDGER_ROW_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: rows, error } = await query;
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_ledger")) {
      return NextResponse.json({ ok: true, entries: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const userIds = [...new Set(list.map((r) => String((r as { user_id?: string }).user_id ?? "")))].filter(Boolean);
  const nickById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", userIds);
    for (const p of profiles ?? []) {
      nickById[String(p.id)] = String((p as { nickname?: string }).nickname ?? "");
    }
  }

  const entries = list.map((row) => {
    const rec = row as Record<string, unknown>;
    const uid = String(rec.user_id ?? "");
    return normalizeLedgerRow(rec, uid, nickById[uid] ?? "");
  });

  return NextResponse.json({ ok: true, entries });
}
