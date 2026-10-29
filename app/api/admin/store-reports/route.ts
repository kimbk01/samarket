import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadActorLabels } from "@/lib/admin-business/load-store-hub-summary";
import { deliveryListRange, parseDeliveryListPageIfRequested } from "@/lib/admin/delivery-list/delivery-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 매장·상품 신고 목록
 * - `limit`/`offset` 이 있으면 서버 페이지(R7): 20/50/100 · `total`(count exact) — 고정 상한 없음.
 * - 없으면 예전 응답(최근 400건) 그대로 — 매장 허브 요약·포인트 대기·배달 신고 화면 호환.
 * - `focus_position=<신고 id>` → `{ position }` (같은 정렬·매장 필터에서 앞선 건수, 없으면 null) — 딥링크 강조용.
 */
export async function GET(req: NextRequest) {
  // RS-04: 매장·상품 신고 목록 = 신고 키 `reports` (신고 처리 PATCH 는 `business`)
  const gate = await requireAdminPermission("reports");
  if (!gate.ok) return gate.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const storeIdFilter = req.nextUrl.searchParams.get("store_id")?.trim() || "";

  // 딥링크 강조 신고의 목록 위치 — 같은 정렬(최신순 · id 내림)·같은 매장 필터에서 앞에 있는 건수.
  // 화면이 이 위치로 쪽을 옮겨 첫 쪽 밖 신고도 강조한다 (예전 400건 목록과 같은 동작).
  const focusId = req.nextUrl.searchParams.get("focus_position")?.trim() || "";
  if (focusId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(focusId)) {
      return NextResponse.json({ ok: true, position: null });
    }
    const { data: target, error: tErr } = await sb
      .from("store_reports")
      .select("id, created_at, store_id")
      .eq("id", focusId)
      .maybeSingle();
    if (tErr) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
    if (!target || (storeIdFilter && target.store_id !== storeIdFilter)) {
      return NextResponse.json({ ok: true, position: null });
    }
    const at = String(target.created_at);
    let pq = sb
      .from("store_reports")
      .select("id", { count: "exact", head: true })
      .or(`created_at.gt.${at},and(created_at.eq.${at},id.gt.${focusId})`);
    if (storeIdFilter) pq = pq.eq("store_id", storeIdFilter);
    const { count, error: pErr } = await pq;
    if (pErr) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, position: count ?? 0 });
  }

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
