import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 구매자: 보낸 매장 문의 목록 (S34).
 * - 각 행 `store_name` + `store_slug`(A10 — 행 → 매장 화면 `/stores/{slug}`).
 * - 실패는 오류 코드(`store_inquiries_load_failed`)로만 응답 — DB 원문 메시지 노출 금지.
 */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: rows, error } = await sb
    .from("store_inquiries")
    .select(
      "id, store_id, inquiry_type, subject, content, status, answer, answered_at, created_at"
    )
    .eq("from_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[GET me/store-inquiries]", error);
    return NextResponse.json({ ok: false, error: "store_inquiries_load_failed" }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id as string))];
  const names: Record<string, string> = {};
  const slugs: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name, slug").in("id", storeIds);
    for (const s of stores ?? []) {
      names[s.id as string] = (s.store_name as string) ?? "";
      slugs[s.id as string] = String((s as { slug?: unknown }).slug ?? "").trim();
    }
  }

  return NextResponse.json({
    ok: true,
    inquiries: list.map((r) => ({
      ...r,
      store_name: names[r.store_id as string] ?? "",
      store_slug: slugs[r.store_id as string] ?? "",
    })),
  });
}
