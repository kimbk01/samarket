import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { readJsonBody } from "@/lib/admin/trade-admin/trade-admin-rpc";
import {
  runTradePromotionAction,
  TRADE_PROMOTION_ACTIONS,
  type TradePromotionAction,
} from "@/lib/admin/trade-admin/trade-promotion-admin";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/trade/promotions/[id] — 승인 · 반려 · 중지 · 재개 · 종료(환급)
 * body: { action, reason, fault?: operator|member|none (종료), preview?: true (종료 환급 미리보기) }
 * 승인 외에는 사유 필수. 조치 1건 = DB 함수 1번 (설계 v2 §G-0).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const id = communityAdminUuidOrNull((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const action = String(body.action ?? "");
  if (!(TRADE_PROMOTION_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  const preview = body.preview === true && action === "end";
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason && action !== "approve" && !preview) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  const fault = body.fault === "operator" || body.fault === "member" || body.fault === "none" ? body.fault : null;
  if (action === "end" && !fault) return NextResponse.json({ ok: false, error: "fault_required" }, { status: 400 });

  const meta = getAuditRequestMeta(req);
  const res = await runTradePromotionAction(admin.sb, {
    orderId: id,
    actorId: admin.userId,
    action: action as TradePromotionAction,
    reason: reason ?? (preview ? "preview" : null),
    fault,
    preview,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus });
  return NextResponse.json({ ok: true, ...res.data, ...(res.notifyWarning ? { sideEffectWarning: true } : {}) });
}
