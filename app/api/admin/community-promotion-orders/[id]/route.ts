import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { parseCommunityPromotionFault } from "@/lib/admin/community-admin/community-promotion-admin";
import { notifyCommunityPromotionEnded } from "@/lib/notifications/notify-community-moderation";
import { applyBoostLifecycle } from "@/lib/promotion/admin-boost-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER_AUDIT_SELECT =
  "id, domain, user_id, target_id, order_status, point_cost, duration_days, start_at, end_at, review_reason, " +
  "paused_at, paused_seconds_total, ended_by, ended_at, end_reason_code, fault, refund_points, refund_ledger_id";

/**
 * PATCH /api/admin/community-promotion-orders/[id]
 * body:
 *   { action: 'pause', reason }                         — 노출 중지 (L2, 사유 필수)
 *   { action: 'resume', reason? }                       — 노출 재개 (L1) · 종료일을 중지 시간만큼 연장
 *   { action: 'end', fault: 'operator'|'member', reason, reasonCode?, preview?: boolean }
 *       — 홍보 종료 (L3). 운영 귀책이면 남은 노출 비례 포인트 환급 (원장 refund). preview=true 는 계산만.
 * → pause/resume: { ok, orderStatus, endAt, extendedSeconds? }
 * → end preview:  { ok, preview: true, refundPoints, paidPoints, remainingSeconds, hasPaymentRecord }
 * → end:          { ok, orderStatus:'ended', endAt, refundPoints, refundLedgerId }
 * 레거시 「신청→승인」(approve/reject) 은 410 legacy_flow_disabled (C-47).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireCommunityAdmin("promotion");
  if (!admin.ok) return admin.response;
  const { sb } = admin;

  const { id } = await ctx.params;
  const orderId = (id ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
    fault?: string;
    reasonCode?: string;
    preview?: boolean;
  };
  const action = (body.action ?? "").trim();

  if (action === "approve" || action === "reject") {
    return NextResponse.json({ ok: false, error: "legacy_flow_disabled" }, { status: 410 });
  }
  if (action !== "pause" && action !== "resume" && action !== "end") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const preview = action === "end" && body.preview === true;
  // 환급 미리보기는 아무것도 바꾸지 않으므로 사유 없이 계산만 한다 (RPC 사유 검사용 고정 문구).
  const reason = normalizeCommunityAdminReason(body.reason) ?? (preview ? "환급 미리보기" : null);
  if ((action === "pause" || action === "end") && !reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  const fault = parseCommunityPromotionFault(body.fault);
  if (action === "end" && !fault) {
    return NextResponse.json({ ok: false, error: "fault_required" }, { status: 400 });
  }
  const { data: before } = await sb
    .from("point_promotion_orders")
    .select(ORDER_AUDIT_SELECT)
    .eq("id", orderId)
    .eq("domain", "community")
    .maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const res = await applyBoostLifecycle(sb, {
    orderId,
    domain: "community",
    action,
    adminUserId: admin.userId,
    reason,
    fault,
    reasonCode: typeof body.reasonCode === "string" ? body.reasonCode.trim().slice(0, 64) : null,
    preview,
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus });
  }

  if (res.preview) {
    return NextResponse.json({ ok: true, preview: true, ...res.preview });
  }

  const { data: after } = await sb.from("point_promotion_orders").select(ORDER_AUDIT_SELECT).eq("id", orderId).maybeSingle();

  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "community_promotion_order",
    targetId: orderId,
    action: `community_promotion_order.${action}`,
    reason,
    before: before as unknown as Record<string, unknown>,
    after: {
      ...((after ?? {}) as unknown as Record<string, unknown>),
      action,
      ...(action === "end" ? { fault, refund_points: res.refundPoints ?? 0 } : {}),
      ...(action === "resume" ? { extended_seconds: res.extendedSeconds ?? 0 } : {}),
    },
  });

  if (action === "end") {
    try {
      await notifyCommunityPromotionEnded(sb, {
        userId: res.buyerUserId ?? String((before as unknown as { user_id?: string }).user_id ?? ""),
        orderId,
        refundPoints: res.refundPoints ?? 0,
        reason,
      });
    } catch (e) {
      console.error("[community-promotion-orders] end notify", e);
    }
  }

  return NextResponse.json({
    ok: true,
    orderStatus: res.orderStatus,
    endAt: (after as { end_at?: string } | null)?.end_at ?? res.endAt,
    ...(action === "resume" ? { extendedSeconds: res.extendedSeconds ?? 0 } : {}),
    ...(action === "end" ? { refundPoints: res.refundPoints ?? 0, refundLedgerId: res.refundLedgerId ?? null } : {}),
    auditOk: audit.ok,
  });
}
