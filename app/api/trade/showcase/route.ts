import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  TRADE_SHOWCASE_MAX_VISIBLE,
  TRADE_SHOWCASE_SELECT,
} from "@/lib/trade/showcase/trade-showcase-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P-7 공개 — 활성 샘플 상품(예시 · 거래 불가). `category`(trade_category_id) 가 있으면 그 주제만.
 * 테이블이 아직 없거나 오류면 빈 목록(화면은 예시 구역을 그리지 않음) — 마이그레이션 전 배포에도 안전.
 */
export async function GET(req: NextRequest) {
  const category = (req.nextUrl.searchParams.get("category") ?? "").trim();
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
  let q = sb
    .from("trade_showcase_items")
    .select(TRADE_SHOWCASE_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(TRADE_SHOWCASE_MAX_VISIBLE);
  if (/^[0-9a-f-]{36}$/i.test(category)) {
    q = q.eq("trade_category_id", category);
  } else if (/^[a-z0-9-]{1,60}$/i.test(category)) {
    /** 마켓 URL `?category=vehicle` 처럼 주제 slug — 거래 카테고리 id 로 환산 */
    const { data: cat } = await sb
      .from("categories")
      .select("id")
      .eq("type", "trade")
      .eq("slug", category)
      .maybeSingle();
    const catId = (cat as { id?: string } | null)?.id;
    if (!catId) return NextResponse.json({ ok: true, items: [] });
    q = q.eq("trade_category_id", catId);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: true, items: [] });
  return NextResponse.json(
    { ok: true, items: data ?? [] },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
  );
}
