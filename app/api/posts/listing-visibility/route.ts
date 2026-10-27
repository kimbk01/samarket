import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 120;

/**
 * 목록에 표시 중인 글의 현재 공개 상태 (LIST-01, 2026-10-27).
 * 캐시·세션 복원 목록에서 숨김·삭제된 글을 걷어내고 판매 상태 배지를 맞추는 용도.
 * 응답은 `id·status·seller_listing_state` 만 — 비공개 필드 없음. 숨김 글은 상태만 알린다(내용 미노출).
 */
export async function POST(req: NextRequest) {
  let body: { ids?: unknown } = {};
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))]
    : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, rows: [] });
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ ok: false, error: "too_many_ids" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
  const { data, error } = await sb
    .from(POSTS_TABLE_READ)
    .select("id, status, seller_listing_state")
    .in("id", ids);
  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }
  const rows = (data ?? []).map((r) => {
    const row = r as { id: string; status?: string | null; seller_listing_state?: string | null };
    return {
      id: row.id,
      status: row.status ?? null,
      seller_listing_state: row.seller_listing_state ?? null,
    };
  });
  return NextResponse.json(
    { ok: true, rows },
    { headers: { "Cache-Control": "no-store" } }
  );
}
