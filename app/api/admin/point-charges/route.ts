import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { POINT_CHARGE_REQUEST_ROW_SELECT } from "@/lib/points/point-query-select";
import {
  isMissingPointsTable,
  normalizeChargeRequest,
} from "@/lib/points/admin-user-points-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/point-charges */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { sb } = gate;
  const { data: rows, error } = await sb
    .from("point_charge_requests")
    .select(POINT_CHARGE_REQUEST_ROW_SELECT)
    .order("requested_at", { ascending: false })
    .limit(300);

  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_charge_requests")) {
      return NextResponse.json({ ok: true, requests: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const userIds = [...new Set(list.map((r) => String((r as { user_id?: string }).user_id ?? "")))].filter(
    Boolean
  );

  const nickById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", userIds);
    for (const p of profiles ?? []) {
      nickById[String(p.id)] = String((p as { nickname?: string }).nickname ?? "");
    }
  }

  const requests = list.map((row) => {
    const rec = row as Record<string, unknown>;
    const userId = String(rec.user_id ?? "");
    return normalizeChargeRequest(rec, userId, nickById[userId] ?? "");
  });

  return NextResponse.json({ ok: true, requests });
}
