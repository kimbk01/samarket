import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/**
 * GET /api/admin/trade-post-ads — 거래 상세 광고 신청 목록 (서비스 롤).
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "Supabase 서비스 클라이언트가 없습니다." }, { status: 503 });
  }

  const { data, error } = await sb
    .from("trade_post_ads")
    .select(
      "id, post_id, user_id, ad_product_id, apply_status, point_cost, priority, start_at, end_at, admin_memo, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
