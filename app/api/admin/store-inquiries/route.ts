import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadActorLabels } from "@/lib/admin-business/load-store-hub-summary";
import { deliveryListRange, parseDeliveryListPageIfRequested } from "@/lib/admin/delivery-list/delivery-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 관리자: 전체 매장 문의 모니터링 — `?store_id=` 로 매장 필터 (LNK-2)
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
  const storeIdFilter = (sp.get("store_id") ?? "").trim();
  const page = parseDeliveryListPageIfRequested(sp);
  if (storeIdFilter && !UUID_RE.test(storeIdFilter)) {
    return NextResponse.json({ ok: false, error: "invalid_store_id" }, { status: 400 });
  }

  let query = sb
    .from("store_inquiries")
    .select(
      "id, store_id, from_user_id, inquiry_type, subject, content, status, answer, answered_at, created_at",
      page ? { count: "exact" } : undefined
    );
  if (storeIdFilter) query = query.eq("store_id", storeIdFilter);
  const ordered = query.order("created_at", { ascending: false });
  const { data: rows, error, count } = page
    ? await ordered.order("id", { ascending: false }).range(...deliveryListRange(page))
    : await ordered.limit(300);

  if (error) {
    if (error.message?.includes("store_inquiries") && error.message?.includes("does not exist")) {
      return NextResponse.json(
        { ok: false, error: "store_inquiries_table_missing" },
        { status: 503 }
      );
    }
    console.error("[admin/store-inquiries]", error);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id as string))];
  const storeById: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) storeById[s.id as string] = (s.store_name as string) ?? "";
  }

  const askerLabels = await loadActorLabels(
    sb,
    list.map((r) => String(r.from_user_id ?? ""))
  );

  return NextResponse.json({
    ok: true,
    ...(page ? { total: count ?? list.length, limit: page.limit, offset: page.offset } : {}),
    inquiries: list.map((r) => ({
      ...r,
      store_name: storeById[r.store_id as string] ?? "",
      from_user_label: askerLabels.get(String(r.from_user_id ?? "")) ?? null,
    })),
  });
}
