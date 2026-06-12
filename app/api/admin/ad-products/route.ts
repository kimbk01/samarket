import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { fetchAllAdProductsFromDb } from "@/lib/ads/ad-products-supabase";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ad-products
 * 관리자: 광고 상품 전체 목록 (DB)
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: true, products: [], meta: { source: "unavailable" as const } });
  }

  const db = await fetchAllAdProductsFromDb(svc);
  if (!db.ok) {
    if (db.reason === "missing_table") {
      return NextResponse.json({ ok: true, products: [], meta: { source: "missing_table" as const } });
    }
    return NextResponse.json({ ok: false, error: db.message ?? "db_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    products: db.products,
    meta: { source: "supabase" as const },
  });
}
