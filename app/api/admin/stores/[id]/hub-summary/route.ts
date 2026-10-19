import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadStoreHubSummary } from "@/lib/admin-business/load-store-hub-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 허브 요약 카드 (§3) — 읽기 전용. 조회 권한 = 관리자 전체 (매장 상세 GET 과 동일). */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id: rawId } = await context.params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data: store, error } = await sb
    .from("stores")
    .select("id, owner_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  if (!store) return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });

  try {
    const summary = await loadStoreHubSummary(
      sb,
      id,
      typeof store.owner_user_id === "string" ? store.owner_user_id : null
    );
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    console.error("[admin/stores hub-summary]", id, e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
