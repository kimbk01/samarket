import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadActorLabels } from "@/lib/admin-business/load-store-hub-summary";
import { deliveryListRange, parseDeliveryListPageIfRequested } from "@/lib/admin/delivery-list/delivery-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 매장·상품 신고 목록
 * - `limit`/`offset` 이 있으면 서버 페이지(R7): 20/50/100 · `total`(count exact) — 고정 상한 없음.
 * - 없으면 예전 응답(최근 400건) 그대로 — 매장 허브 요약·포인트 대기·배달 신고 화면 호환.
 */
export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const storeIdFilter = req.nextUrl.searchParams.get("store_id")?.trim() || "";
  const page = parseDeliveryListPageIfRequested(req.nextUrl.searchParams);

  let q = sb
    .from("store_reports")
    .select(
      "id, reporter_user_id, target_type, target_id, store_id, reason_type, message, status, action_type, action_memo, reviewed_at, created_at",
      page ? { count: "exact" } : undefined
    )
    .order("created_at", { ascending: false });

  if (storeIdFilter) {
    q = q.eq("store_id", storeIdFilter);
  }
  q = page ? q.order("id", { ascending: false }).range(...deliveryListRange(page)) : q.limit(400);

  const { data: rows, error, count } = await q;

  if (error) {
    if (error.message?.includes("store_reports") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin/store-reports]", error);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id as string))];
  const names: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) names[s.id as string] = (s.store_name as string) ?? "";
  }

  const productIds = list
    .filter((r) => r.target_type === "product")
    .map((r) => r.target_id as string);
  const productTitles: Record<string, string> = {};
  if (productIds.length) {
    const { data: prods } = await sb.from("store_products").select("id, title").in("id", productIds);
    for (const p of prods ?? []) productTitles[p.id as string] = (p.title as string) ?? "";
  }

  // 신고자 이름 (UUID 는 기술 정보에서만)
  const reporterLabels = await loadActorLabels(
    sb,
    list.map((r) => String(r.reporter_user_id ?? ""))
  );

  return NextResponse.json({
    ok: true,
    store_id: storeIdFilter || null,
    ...(page ? { total: count ?? list.length, limit: page.limit, offset: page.offset } : {}),
    reports: list.map((r) => ({
      ...r,
      reporter_label: reporterLabels.get(String(r.reporter_user_id ?? "")) ?? null,
      store_name: names[r.store_id as string] ?? "",
      product_title:
        r.target_type === "product" ? productTitles[r.target_id as string] ?? "" : null,
    })),
  });
}
