import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/points/charge/[id]/cancel
 * 사용자 본인의 충전 신청 취소
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const requestId = id?.trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const { data: row, error } = await sb
    .from("point_charge_requests")
    // 처리(취소) 시각 — 목록 「취소 YYYY-MM-DD HH:mm (PHT)」 (재감사 R6-f · 운영 열 point_charge_requests.processed_at)
    .update({ request_status: "cancelled", updated_at: now, processed_at: now })
    .eq("id", requestId)
    .eq("user_id", auth.userId)
    .in("request_status", ["pending", "waiting_confirm"])
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_charge_requests")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "cannot_cancel" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
