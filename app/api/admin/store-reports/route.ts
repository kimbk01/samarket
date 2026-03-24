import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 관리자: 매장·상품 신고 목록 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: rows, error } = await sb
    .from("store_reports")
    .select(
      "id, reporter_user_id, target_type, target_id, store_id, reason_type, message, status, action_type, action_memo, reviewed_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) {
    if (error.message?.includes("store_reports") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin/store-reports]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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

  return NextResponse.json({
    ok: true,
    reports: list.map((r) => ({
      ...r,
      store_name: names[r.store_id as string] ?? "",
      product_title:
        r.target_type === "product" ? productTitles[r.target_id as string] ?? "" : null,
    })),
  });
}
