/**
 * GET /api/admin/community/audit — 커뮤니티 운영 기록 (설계 §C-20 · §E-7). 읽기 전용.
 * query: actor(관리자 UUID) · targetType(정확히, 커뮤니티 대상 유형만) · targetId · action(접두 일치) ·
 *        period=today|7d|30d|custom|all (+from,to, 마닐라) · limit(≤100) · offset
 * → { ok, total, limit, offset, period, rows: [{ id, createdAt, actorId, actorNickname, targetType, targetId,
 *      action, actionLabelKey, reason, before, after }] }
 * actionLabelKey = `admin_community_audit_action.<action>` (화면 i18n 키, 없으면 action 원문 대신 「기타 조치」).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import {
  communityAdminUuidOrNull,
  parseCommunityAdminPage,
  parseCommunityAdminPeriodFromSearch,
} from "@/lib/admin/community-admin/community-admin-period";
import {
  communityAuditActionLabelKey,
  communityAuditTargetOrFilter,
  isCommunityAuditTargetType,
} from "@/lib/admin/community-admin/community-admin-read-contract";
import {
  communityPeriodError,
  communityReadError,
  loadCommunityProfileBriefs,
} from "@/lib/admin/community-admin/community-admin-read-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  actor_type: string | null;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  action: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const gate = await requireCommunityAdmin("read");
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "7d" });
  if (!period.ok) return communityPeriodError(period.error);
  const { limit, offset } = parseCommunityAdminPage(sp);

  const actorRaw = sp.get("actor");
  const actor = actorRaw ? communityAdminUuidOrNull(actorRaw) : null;
  if (actorRaw && !actor) return communityReadError("invalid_actor", 400);
  const targetType = String(sp.get("targetType") ?? "").trim() || null;
  if (targetType && !isCommunityAuditTargetType(targetType)) return communityReadError("invalid_target_type", 400);
  const targetId = String(sp.get("targetId") ?? "").trim().slice(0, 120) || null;
  const actionPrefix = String(sp.get("action") ?? "").trim().replace(/[^a-z0-9_.]/gi, "").slice(0, 80) || null;

  let q = gate.sb
    .from("audit_logs")
    .select("id, actor_type, actor_id, target_type, target_id, action, before_json, after_json, created_at", {
      count: "exact",
    })
    .eq("actor_type", "admin")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  q = targetType ? q.eq("target_type", targetType) : q.or(communityAuditTargetOrFilter());
  if (targetId) q = q.eq("target_id", targetId);
  if (actor) q = q.eq("actor_id", actor);
  if (actionPrefix) q = q.like("action", `${actionPrefix}%`);
  if (period.fromIso) q = q.gte("created_at", period.fromIso);
  if (period.toIso) q = q.lt("created_at", period.toIso);

  const { data, error, count } = await q;
  if (error) return communityReadError(error.message, 500);
  const rows = (data ?? []) as AuditRow[];
  const actors = await loadCommunityProfileBriefs(
    gate.sb,
    rows.map((r) => r.actor_id)
  );

  return NextResponse.json({
    ok: true,
    total: count ?? null,
    limit,
    offset,
    period: { period: period.period, from: period.fromDate, to: period.toDate, fromIso: period.fromIso, toIso: period.toIso },
    rows: rows.map((r) => {
      const a = r.actor_id ? actors.get(r.actor_id) : undefined;
      const reason = r.after_json && typeof r.after_json.reason === "string" ? r.after_json.reason : null;
      return {
        id: r.id,
        createdAt: r.created_at,
        actorId: r.actor_id,
        actorNickname: a?.nickname ?? a?.username ?? null,
        targetType: r.target_type,
        targetId: r.target_id,
        action: r.action,
        actionLabelKey: communityAuditActionLabelKey(r.action),
        reason,
        before: r.before_json,
        after: r.after_json,
      };
    }),
  });
}
