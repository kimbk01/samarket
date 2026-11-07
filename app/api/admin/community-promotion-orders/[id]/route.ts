import { requireAdsWriteAdmin } from "@/lib/admin/access/require-ads-write-admin";
import { NextRequest, NextResponse } from "next/server";
import { runCommunityPromotionOrderAction } from "@/lib/admin/community-admin/community-promotion-order-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/community-promotion-orders/[id]
 * body:
 *   { action: 'pause', reason }                         — 노출 중지 (L2, 사유 필수)
 *   { action: 'resume', reason }                        — 노출 재개 (L2 exposeStart, 사유 필수) · 종료일을 중지 시간만큼 연장
 *   { action: 'end', fault: 'operator'|'member', reason, reasonCode?, preview?: boolean }
 *       — 홍보 종료 (L3). 운영 귀책이면 남은 노출 비례 포인트 환급 (원장 refund). preview=true 는 계산만.
 * → pause/resume: { ok, orderStatus, endAt, extendedSeconds? }
 * → end preview:  { ok, preview: true, refundPoints, paidPoints, remainingSeconds, hasPaymentRecord }
 * → end:          { ok, orderStatus:'ended', endAt, refundPoints, refundLedgerId }
 * 레거시 「신청→승인」(approve/reject) 은 410 legacy_flow_disabled (C-47).
 * 사유 규칙(reason_required)·귀책(fault_required)·감사(before/after)·종료 알림은 광고 허브와 같은
 * 단일 구현 `runCommunityPromotionOrderAction` (H-3).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  // 광고 SSOT §4 (2026-11-07): 상위노출 쓰기 = ads 키 (공통 광고 화면과 같은 키)
  const admin = await requireAdsWriteAdmin();
  if (!admin.ok) return admin.response;
  const { sb } = admin;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
    fault?: string;
    reasonCode?: string;
    preview?: boolean;
    /** D-10: 운영자 내부 메모 (회원 응답·알림에 나가지 않음) */
    internalReason?: string;
  };

  const out = await runCommunityPromotionOrderAction(sb, req, {
    orderId: id ?? "",
    actorId: admin.userId,
    action: body.action ?? "",
    reason: body.reason,
    fault: body.fault,
    reasonCode: body.reasonCode,
    preview: body.preview === true,
    internalReason: body.internalReason,
  });
  if (!out.ok) {
    return NextResponse.json({ ok: false, error: out.error }, { status: out.httpStatus });
  }
  return NextResponse.json(out.body);
}
