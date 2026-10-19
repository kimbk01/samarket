import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  communitySanctionRpcErrorStatus,
  parseCommunitySanctionInput,
} from "@/lib/admin/community-admin/community-sanction-input";
import {
  adminMemberHref,
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { notifyCommunitySanction } from "@/lib/notifications/notify-community-moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT =
  "id, user_id, sanction_type, restriction, start_at, end_at, reason, created_by, created_at, revoked_at, revoked_by, revoke_reason, source_report_id, source_report_kind";

type SanctionDbRow = {
  id: string;
  user_id: string;
  sanction_type: string;
  restriction: string | null;
  start_at: string | null;
  end_at: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  source_report_id: string | null;
  source_report_kind: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rowStatus(r: SanctionDbRow, nowMs: number): "active" | "expired" | "revoked" {
  if (r.revoked_at) return "revoked";
  if (r.end_at && new Date(r.end_at).getTime() <= nowMs) return "expired";
  return "active";
}

function sourceReportHref(r: SanctionDbRow): string | null {
  if (!r.source_report_id) return null;
  if (r.source_report_kind === "meeting_report") return "/admin/philife/meeting-reports";
  return `/admin/reports/${encodeURIComponent(r.source_report_id)}`;
}

/**
 * GET /api/admin/community/restrictions — 커뮤니티 경고·활동 제한 목록 (설계 §C-11)
 * query: status=active|expired|revoked|all (기본 active) · kind=warning|community_restriction · userId · q(닉네임) · limit · offset
 */
export async function GET(req: NextRequest) {
  const admin = await requireCommunityAdmin("read");
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;

  const status = (sp.get("status") ?? "active").trim();
  if (!["active", "expired", "revoked", "all"].includes(status)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const kind = (sp.get("kind") ?? "").trim();
  if (kind && kind !== "warning" && kind !== "community_restriction") {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const userId = (sp.get("userId") ?? "").trim();
  if (userId && !UUID_RE.test(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }
  const q = (sp.get("q") ?? "").trim().slice(0, 50);

  let userFilter: string[] | null = userId ? [userId] : null;
  if (q) {
    const safeQ = q.replace(/[%_,()]/g, " ").trim();
    const { data: profs, error: pErr } = await sb
      .from("profiles")
      .select("id")
      .ilike("nickname", `%${safeQ}%`)
      .limit(200);
    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    const ids = ((profs ?? []) as Array<{ id: string }>).map((p) => p.id);
    userFilter = userFilter ? userFilter.filter((x) => ids.includes(x)) : ids;
    if (userFilter.length === 0) {
      return NextResponse.json({ ok: true, rows: [], total: 0, limit, offset });
    }
  }

  const nowIso = new Date().toISOString();
  let query = sb.from("sanctions").select(SELECT, { count: "exact" }).eq("scope", "community");
  if (kind) query = query.eq("sanction_type", kind);
  if (userFilter) query = query.in("user_id", userFilter);
  if (status === "active") query = query.is("revoked_at", null).or(`end_at.is.null,end_at.gt.${nowIso}`);
  else if (status === "expired") query = query.is("revoked_at", null).lte("end_at", nowIso);
  else if (status === "revoked") query = query.not("revoked_at", "is", null);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as SanctionDbRow[];
  const identities = await loadAdminMemberIdentityMap(
    sb,
    rows.flatMap((r) => [r.user_id, r.created_by ?? "", r.revoked_by ?? ""])
  );
  const nowMs = Date.now();
  return NextResponse.json({
    ok: true,
    total: count ?? rows.length,
    limit,
    offset,
    rows: rows.map((r) => {
      const member = identities.get(r.user_id) ?? null;
      return {
        id: r.id,
        user_id: r.user_id,
        user_nickname: member?.nickname ?? null,
        user_dibay_id: member?.username ?? null,
        user_label: formatAdminMemberLabel(member),
        user_href: adminMemberHref(r.user_id),
        kind: r.sanction_type,
        restriction: r.restriction,
        status: rowStatus(r, nowMs),
        start_at: r.start_at,
        end_at: r.end_at,
        reason: r.reason,
        created_at: r.created_at,
        created_by: r.created_by,
        created_by_label: r.created_by ? formatAdminMemberLabel(identities.get(r.created_by)) : null,
        revoked_at: r.revoked_at,
        revoked_by: r.revoked_by,
        revoked_by_label: r.revoked_by ? formatAdminMemberLabel(identities.get(r.revoked_by)) : null,
        revoke_reason: r.revoke_reason,
        source_report_id: r.source_report_id,
        source_report_kind: r.source_report_kind,
        source_report_href: sourceReportHref(r),
      };
    }),
  });
}

/**
 * POST /api/admin/community/restrictions — 경고·활동 제한 직접 적용
 * body: { userId, kind: 'warning'|'community_restriction', restriction?: 'post'|'comment'|'all', days?: 1|3|7|30|null, reason }
 */
export async function POST(req: NextRequest) {
  const admin = await requireCommunityAdmin("moderation");
  if (!admin.ok) return admin.response;
  const sb = admin.sb;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const userId = String(body.userId ?? "").trim();
  if (!UUID_RE.test(userId)) return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  const parsed = parseCommunitySanctionInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  const s = parsed.value;

  const { data, error } = await sb.rpc("admin_apply_community_sanction", {
    p_user_id: userId,
    p_kind: s.kind,
    p_restriction: s.restriction,
    p_days: s.days,
    p_reason: reason,
    p_actor_id: admin.userId,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const r = (data ?? {}) as { ok?: boolean; error?: string; id?: string; duplicate?: boolean; end_at?: string | null };
  if (r.ok !== true || !r.id) {
    const err = String(r.error ?? "apply_failed");
    return NextResponse.json({ ok: false, error: err }, { status: communitySanctionRpcErrorStatus(err) });
  }
  const sanctionId = String(r.id);
  const duplicate = r.duplicate === true;
  let endAt = r.end_at ?? null;
  if (duplicate) {
    const { data: ex } = await sb.from("sanctions").select("end_at").eq("id", sanctionId).maybeSingle();
    endAt = (ex as { end_at?: string | null } | null)?.end_at ?? null;
  }

  let notifyWarning = false;
  if (!duplicate) {
    try {
      await notifyCommunitySanction(sb, {
        userId,
        sanctionId,
        kind: s.kind === "warning" ? "warning" : "restriction",
        restriction: s.restriction,
        endAt,
        reason,
      });
    } catch (e) {
      notifyWarning = true;
      console.error("[community-restrictions] notify", e instanceof Error ? e.message : e);
    }
  }
  const audit = duplicate
    ? { ok: true as const }
    : await appendCommunityAdminAudit(sb, req, {
        actorId: admin.userId,
        targetType: "community_sanction",
        targetId: sanctionId,
        action: `community_sanction.apply_${s.kind}`,
        reason,
        after: { user_id: userId, kind: s.kind, restriction: s.restriction, days: s.days, end_at: endAt },
      });

  return NextResponse.json({
    ok: true,
    id: sanctionId,
    duplicate,
    end_at: endAt,
    ...(audit.ok ? {} : { auditWarning: true }),
    ...(notifyWarning ? { sideEffectWarning: true } : {}),
  });
}
