import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/**
 * GET /api/admin/trade-ad-products — 거래 마켓 광고 정책(ad_products 중 trade·placement).
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "Supabase 서비스 클라이언트가 없습니다." }, { status: 503 });
  }

  const { data, error } = await sb
    .from("ad_products")
    .select(
      "id, name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active, placement, service_type, category_id, region_target, allow_duplicate, auto_approve, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const raw = Array.isArray(data) ? data : [];
  const rows = raw.filter((r) => {
    const row = r as Record<string, unknown>;
    const bk = row.board_key != null ? String(row.board_key) : "";
    const pl = row.placement != null ? String(row.placement) : "";
    return bk === "trade" || pl.length > 0;
  });

  return NextResponse.json({ ok: true, rows });
}
