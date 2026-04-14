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
      [
        "id, post_id, user_id, ad_product_id, apply_status, point_cost, priority, start_at, end_at, admin_memo, created_at, updated_at",
        "post:posts!trade_post_ads_post_id_fkey(id, title, status, category_id, region, city, author_nickname)",
        "product:ad_products!trade_post_ads_ad_product_id_fkey(id, name, placement, duration_days, point_cost, service_type, region_target, category_id)",
      ].join(", ")
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    const relationMissing =
      error.message.includes("Could not find a relationship") ||
      error.message.includes("relationship") ||
      error.message.includes("foreign key");
    if (!relationMissing) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const fallback = await sb
      .from("trade_post_ads")
      .select("id, post_id, user_id, ad_product_id, apply_status, point_cost, priority, start_at, end_at, admin_memo, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (fallback.error) {
      return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, rows: fallback.data ?? [] });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
