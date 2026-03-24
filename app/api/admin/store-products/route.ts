import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 관리자: 전체 매장 상품 목록 (검수용) */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();

  let q = sb
    .from("store_products")
    .select(
      "id, store_id, title, price, product_status, admin_review_status, thumbnail_url, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(400);

  if (status && status !== "all") {
    q = q.eq("product_status", status);
  }

  const { data: products, error } = await q;
  if (error) {
    console.error("[admin/store-products]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = products ?? [];
  const storeIds = [...new Set(list.map((p) => p.store_id as string))];
  const storeById: Record<string, { store_name: string; slug: string }> = {};
  if (storeIds.length > 0) {
    const { data: stores } = await sb
      .from("stores")
      .select("id, store_name, slug")
      .in("id", storeIds);
    for (const s of stores ?? []) {
      storeById[s.id as string] = {
        store_name: s.store_name as string,
        slug: s.slug as string,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    products: list.map((p) => ({
      ...p,
      store: storeById[p.store_id as string] ?? null,
    })),
  });
}
