import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import {
  communityAdminUuidOrNull,
  parseCommunityAdminPage,
  parseCommunityAdminPeriodFromSearch,
} from "@/lib/admin/community-admin/community-admin-period";
import { TRADE_AUDIT_TARGET_TYPES } from "@/lib/admin/trade-admin/trade-metrics";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/trade/audit — 거래 운영 기록 (설계 v2 §F-4)
 * query: targetType(거래 대상 유형 중 하나) · targetId · actorId · period/from/to · limit · offset
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;
  const targetType = (sp.get("targetType") ?? "").trim();
  if (targetType && !(TRADE_AUDIT_TARGET_TYPES as readonly string[]).includes(targetType)) {
    return NextResponse.json({ ok: false, error: "invalid_target_type" }, { status: 400 });
  }
  const targetId = (sp.get("targetId") ?? "").trim().slice(0, 120);
  const actorId = communityAdminUuidOrNull(sp.get("actorId"));
  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "30d" });
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error }, { status: 400 });
  const { limit, offset } = parseCommunityAdminPage(sp);

  let q = sb
    .from("audit_logs")
    .select("id, actor_type, actor_id, target_type, target_id, action, before_json, after_json, created_at", {
      count: "exact",
    })
    .in("target_type", targetType ? [targetType] : [...TRADE_AUDIT_TARGET_TYPES]);
  if (targetId) q = q.eq("target_id", targetId);
  if (actorId) q = q.eq("actor_id", actorId);
  if (period.fromIso) q = q.gte("created_at", period.fromIso);
  if (period.toIso) q = q.lt("created_at", period.toIso);
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  const identities = await loadAdminMemberIdentityMap(sb, rows.map((r) => String(r.actor_id ?? "")));
  return NextResponse.json({
    ok: true,
    total: count ?? rows.length,
    limit,
    offset,
    rows: rows.map((r) => ({
      ...r,
      actor_label:
        r.actor_type === "system" ? "시스템" : r.actor_id ? formatAdminMemberLabel(identities.get(String(r.actor_id))) : null,
    })),
  });
}
