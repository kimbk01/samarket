import { NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 전역 매장 상품 카테고리(메뉴 그룹) — 오너 폼에서 선택용 */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, categories: [], meta: { source: "supabase_unconfigured" } });
  }
  const { data, error } = await sb
    .from("store_product_categories")
    .select("id, name, slug, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[GET /api/stores/product-categories]", error);
    return NextResponse.json({ ok: false, error: error.message, categories: [] }, { status: 500 });
  }

  return NextResponse.json({ ok: true, categories: data ?? [], meta: { source: "supabase" } });
}
