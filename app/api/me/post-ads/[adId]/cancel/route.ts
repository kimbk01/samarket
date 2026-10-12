import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  cancelPostAdForUserWithServiceRole,
  httpStatusForRefundPostAdPointsError,
} from "@/lib/ads/post-ads-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/post-ads/[adId]/cancel
 * 승인 전(draft / pending_payment / pending_review)만 취소. 포인트 결제분 환불은
 * DB RPC `refund_post_ad_points` 가 원장 기준으로 원자 처리.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ adId: string }> }
): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { adId } = await params;
  if (!adId?.trim()) {
    return NextResponse.json({ ok: false, error: "missing_ad_id" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }

  const r = await cancelPostAdForUserWithServiceRole(svc, auth.userId, adId.trim());

  if (!r.ok) {
    const status = httpStatusForRefundPostAdPointsError(r.error);
    return NextResponse.json(
      {
        ok: false,
        error: r.error ?? "failed",
        ...(r.currentStatus ? { current_status: r.currentStatus } : {}),
      },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    source: "supabase",
    idempotent: r.idempotent === true,
    refunded_amount: r.refundedAmount ?? 0,
  });
}
