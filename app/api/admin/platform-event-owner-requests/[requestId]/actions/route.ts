import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { adminActOnOwnerEventPromoRequest } from "@/lib/platform-event-owner-requests/admin-review";
import { isPlatformEventOwnerAdminAction } from "@/lib/platform-event-owner-requests/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ requestId: string }> };

/**
 * POST { action, reason? }
 * approve → Platform Event draft link; pushDispatchCount always 0.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  // 재감사 D-5: 사장님 이벤트 신청 심사 = 사장님 팝업 신청 심사(platform-popup-requests actions)와 같은 business 키
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = String(body.action ?? "").trim();
  if (!isPlatformEventOwnerAdminAction(action)) {
    return NextResponse.json({ ok: false, error: "action_invalid" }, { status: 400 });
  }

  // R2: 승인·반려·수정 요청 = L2 — 사유 필수(감사 after_json.reason). 심사 시작은 L1.
  const reason = parseAdminReason(body.reason);
  if (action !== "start_review" && !reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const result = await adminActOnOwnerEventPromoRequest(sb, {
    adminUserId: admin.userId,
    requestId: String(requestId ?? "").trim(),
    action,
    reason: reason ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }

  if ("platformEventId" in result) {
    return NextResponse.json({
      ok: true,
      request: result.request,
      platformEventId: result.platformEventId,
      replay: result.replay,
      pushDispatchCount: result.pushDispatchCount,
      distributionConfigured: result.distributionConfigured,
      eventStatus: result.eventStatus,
      distributionHandoffPath: `/admin/platform-events/${encodeURIComponent(result.platformEventId)}`,
    });
  }

  return NextResponse.json({ ok: true, request: result.request });
}
