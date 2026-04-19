import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 전체 매장 문의 모니터링 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: rows, error } = await sb
    .from("store_inquiries")
    .select(
      "id, store_id, from_user_id, inquiry_type, subject, content, status, answer, answered_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    if (error.message?.includes("store_inquiries") && error.message?.includes("does not exist")) {
      return NextResponse.json(
        { ok: false, error: "store_inquiries_table_missing" },
        { status: 503 }
      );
    }
    console.error("[admin/store-inquiries]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id as string))];
  const storeById: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) storeById[s.id as string] = (s.store_name as string) ?? "";
  }

  return NextResponse.json({
    ok: true,
    inquiries: list.map((r) => ({
      ...r,
      store_name: storeById[r.store_id as string] ?? "",
    })),
  });
}
