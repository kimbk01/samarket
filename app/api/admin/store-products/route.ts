import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { deliveryListRange, parseDeliveryListPageIfRequested } from "@/lib/admin/delivery-list/delivery-list-page";
import { escapeAdminIlike, sanitizeAdminListSearch } from "@/lib/admin/pagination/parse-admin-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 전체 매장 상품 목록 (검수용)
 * - `limit`/`offset` 이 있으면 서버 페이지(R7): 20/50/100 · `total`(count exact) · `q`(상품명) — 고정 상한 없음.
 * - 없으면 예전 응답(최근 400건) 그대로.
 */
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
  const storeId = searchParams.get("store_id")?.trim() || "";

  const page = parseDeliveryListPageIfRequested(searchParams);
  const search = sanitizeAdminListSearch(searchParams.get("q"));

  let q = sb
    .from("store_products")
    .select(
      "id, store_id, title, price, product_status, admin_review_status, thumbnail_url, created_at",
      page ? { count: "exact" } : undefined
    )
    .order("created_at", { ascending: false });

  if (storeId) {
    q = q.eq("store_id", storeId);
  }
  if (status && status !== "all") {
    q = q.eq("product_status", status);
  }
  if (page && search) {
    q = q.ilike("title", `%${escapeAdminIlike(search)}%`);
  }
  q = page ? q.order("id", { ascending: false }).range(...deliveryListRange(page)) : q.limit(400);

  const { data: products, error, count } = await q;
  if (error) {
    console.error("[admin/store-products]", error);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
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
    ...(page ? { total: count ?? list.length, limit: page.limit, offset: page.offset } : {}),
    products: list.map((p) => ({
      ...p,
      store: storeById[p.store_id as string] ?? null,
    })),
  });
}
