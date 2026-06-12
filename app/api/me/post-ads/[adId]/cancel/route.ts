import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { cancelPostAdForUserWithServiceRole } from "@/lib/ads/post-ads-supabase";
import { creditUserPoints } from "@/lib/points/user-point-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/post-ads/[adId]/cancel
 * 승인 전(draft / pending_payment / pending_review)만 취소. 포인트 결제분 환불.
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

  const r = await cancelPostAdForUserWithServiceRole(svc, auth.userId, adId.trim(), {
    refundPoints: async ({ userId, pointCost, adProductName }) => {
      await creditUserPoints(svc, {
        userId,
        amount: pointCost,
        entryType: "ad_refund",
        relatedType: "ad_application",
        relatedId: adId.trim(),
        description: `${adProductName ?? "광고"} 취소 환불`,
        actorType: "user",
      });
    },
  });

  if (!r.ok) {
    const status =
      r.error === "not_cancellable" ? 400 : r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: r.error ?? "failed" }, { status });
  }

  return NextResponse.json({ ok: true, source: "supabase" });
}
