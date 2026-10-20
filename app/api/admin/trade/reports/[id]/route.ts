import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { readJsonBody, tradeAuditMetaArgs } from "@/lib/admin/trade-admin/trade-admin-rpc";
import {
  decideTradeReport,
  notifyAfterTradeReportDecision,
  parseTradeRestrictionDays,
  TRADE_REPORT_DECISIONS,
  TRADE_RESTRICTION_SCOPES,
  type TradeReportDecision,
  type TradeRestrictionScope,
} from "@/lib/admin/trade-admin/trade-report-decision";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/trade/reports/[id] — 신고 상세: 대상 글·대상 회원·같은 대상 다른 신고·처리 기록 (한 화면) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const id = communityAdminUuidOrNull((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

  const { data: rep, error } = await sb.from("reports").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!rep) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const r = rep as Record<string, unknown>;
  const postId =
    r.target_type === "product" || r.target_type === "post" ? String(r.product_id ?? r.target_id ?? "") : "";

  const [post, siblings, actions] = await Promise.all([
    postId
      ? sb
          .from("posts")
          .select(
            "id, title, user_id, price, thumbnail_url, images, status, seller_listing_state, moderation_state, owner_state, created_at"
          )
          .eq("id", postId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    postId
      ? sb
          .from("reports")
          .select("id, reporter_id, reason_code, reason_text, status, created_at")
          .neq("id", id)
          .or(`product_id.eq.${postId},target_id.eq.${postId}`)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    sb
      .from("report_actions")
      .select("id, action_type, action_note, created_by, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const p = (post.data ?? null) as Record<string, unknown> | null;
  const targetUserId = p ? String(p.user_id ?? "") : r.target_type === "user" ? String(r.target_id ?? "") : "";
  const [sanctions, identities] = await Promise.all([
    targetUserId
      ? sb
          .from("sanctions")
          .select("id, scope, sanction_type, restriction, start_at, end_at, revoked_at, reason, created_at")
          .eq("user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    loadAdminMemberIdentityMap(sb, [
      String(r.reporter_id ?? ""),
      String(r.resolved_by ?? ""),
      targetUserId,
      ...((siblings.data ?? []) as Record<string, unknown>[]).map((s) => String(s.reporter_id ?? "")),
      ...((actions.data ?? []) as Record<string, unknown>[]).map((a) => String(a.created_by ?? "")),
    ]),
  ]);
  const label = (uid: unknown) => (uid ? formatAdminMemberLabel(identities.get(String(uid))) : null);

  return NextResponse.json({
    ok: true,
    report: { ...r, reporter_label: label(r.reporter_id), resolved_by_label: label(r.resolved_by) },
    post: p,
    targetUser: targetUserId ? { id: targetUserId, label: label(targetUserId) } : null,
    siblings: ((siblings.data ?? []) as Record<string, unknown>[]).map((s) => ({ ...s, reporter_label: label(s.reporter_id) })),
    actions: ((actions.data ?? []) as Record<string, unknown>[]).map((a) => ({ ...a, actor_label: label(a.created_by) })),
    sanctions: sanctions.data ?? [],
  });
}

/**
 * POST /api/admin/trade/reports/[id] — 신고 처리 (한 트랜잭션)
 * body: { decision: reject|hide|warn|restrict, reason, hidePost?, restriction?: post|chat|all, days?: n|null, targetUserId? }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const id = communityAdminUuidOrNull((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const decision = String(body.decision ?? "") as TradeReportDecision;
  if (!(TRADE_REPORT_DECISIONS as readonly string[]).includes(decision)) {
    return NextResponse.json({ ok: false, error: "invalid_decision" }, { status: 400 });
  }
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  let restriction: TradeRestrictionScope | null = null;
  let days: number | null = null;
  if (decision === "restrict") {
    const rs = String(body.restriction ?? "all");
    if (!(TRADE_RESTRICTION_SCOPES as readonly string[]).includes(rs)) {
      return NextResponse.json({ ok: false, error: "invalid_restriction" }, { status: 400 });
    }
    restriction = rs as TradeRestrictionScope;
    const d = parseTradeRestrictionDays(body.days);
    if (d === "invalid") return NextResponse.json({ ok: false, error: "invalid_days" }, { status: 400 });
    days = d;
  }

  const meta = tradeAuditMetaArgs(req);
  const res = await decideTradeReport(admin.sb, {
    reportId: id,
    actorId: admin.userId,
    decision,
    reason,
    hidePost: body.hidePost === true,
    restriction,
    days,
    targetUserId: communityAdminUuidOrNull(body.targetUserId as string | null),
    ip: meta.p_ip,
    userAgent: meta.p_user_agent,
  });
  if (!res.ok) return res.response;
  const notified = await notifyAfterTradeReportDecision(admin.sb, { reportId: id, reason, data: res.data });
  return NextResponse.json({
    ...(notified.notifyWarning ? { sideEffectWarning: true } : {}),
    ok: true,
    status: res.data.status ?? null,
    postHidden: res.data.post_hidden === true,
    closedSiblings: res.data.closed_siblings ?? 0,
  });
}
