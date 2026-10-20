import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadActorLabels } from "@/lib/admin-business/load-store-hub-summary";
import { deliveryListRange, parseDeliveryListPageIfRequested } from "@/lib/admin/delivery-list/delivery-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 매장 리뷰 목록
 * - `limit`/`offset` 이 있으면 서버 페이지(R7): 20/50/100 · `total`(count exact) — 고정 상한 없음.
 * - 없으면 예전 응답(최근 300건) 그대로.
 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = new URL(req.url).searchParams;
  const storeId = sp.get("store_id")?.trim() || "";
  const page = parseDeliveryListPageIfRequested(sp);

  let q = sb
    .from("store_reviews")
    .select(
      "id, order_id, store_id, product_id, buyer_user_id, rating, content, status, created_at, owner_reply_content, owner_reply_created_at",
      page ? { count: "exact" } : undefined
    )
    .order("created_at", { ascending: false });

  if (storeId) {
    q = q.eq("store_id", storeId);
  }
  q = page ? q.order("id", { ascending: false }).range(...deliveryListRange(page)) : q.limit(300);

  const { data: rows, error, count } = await q;

  if (error) {
    if (error.message?.includes("store_reviews") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin/store-reviews]", error);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id as string))];
  const names: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) names[s.id as string] = (s.store_name as string) ?? "";
  }

  const buyerLabels = await loadActorLabels(
    sb,
    list.map((r) => String(r.buyer_user_id ?? ""))
  );

  return NextResponse.json({
    ok: true,
    ...(page ? { total: count ?? list.length, limit: page.limit, offset: page.offset } : {}),
    reviews: list.map((r) => ({
      ...r,
      store_name: names[r.store_id as string] ?? "",
      buyer_label: buyerLabels.get(String(r.buyer_user_id ?? "")) ?? null,
    })),
  });
}
