import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import {
  adminApprovePlatformPopupCampaign,
  transitionPlatformPopupCampaign,
} from "@/lib/platform-popup/admin-transitions";
import type {
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
} from "@/lib/platform-popup/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/platform-popup-campaigns/[campaignId]/transition
 * Server-enforced Admin approval / lifecycle. Owner/payment cannot call this route.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ campaignId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "approve" | "transition";
    nextStatus?: PlatformPopupCampaignStatus;
    nextApproval?: PlatformPopupApprovalStatus;
    activate?: boolean;
    schedule?: boolean;
    reason?: unknown;
  };

  // R2 — 승인·노출 시작·반려(L2)·종료(L3)는 처리 사유 필수, 노출 중지·검토 요청(L1)은 선택. 감사 after_json.reason 에 남긴다.
  const isApprove = body.action === "approve" || Boolean(body.activate) || Boolean(body.schedule);
  const reasonRequired =
    isApprove ||
    body.nextStatus === "active" ||
    body.nextStatus === "ended" ||
    body.nextStatus === "rejected" ||
    body.nextApproval === "rejected";
  const reason = parseAdminReason(body.reason);
  if (reasonRequired && !reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  if (isApprove) {
    const result = await adminApprovePlatformPopupCampaign(sb, {
      campaignId,
      adminUserId: admin.userId,
      activate: Boolean(body.activate),
      schedule: Boolean(body.schedule) && !body.activate,
      reason,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      approvalStatus: result.approvalStatus,
    });
  }

  const result = await transitionPlatformPopupCampaign(sb, {
    campaignId,
    actorUserId: admin.userId,
    actorRole: "admin",
    nextStatus: body.nextStatus,
    nextApproval: body.nextApproval,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    approvalStatus: result.approvalStatus,
  });
}
