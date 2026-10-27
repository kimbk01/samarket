import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  parseTradeShowcaseInput,
  TRADE_SHOWCASE_SELECT,
} from "@/lib/trade/showcase/trade-showcase-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P-7 거래 샘플 상품 (어드민) — GET 전체 목록(비활성 포함) · POST 만들기.
 * `trade_showcase_items` 는 posts 와 분리 — 채팅·찜·신고·알림 경로 없음.
 */
export async function GET() {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const { data, error } = await admin.sb
    .from("trade_showcase_items")
    .select(TRADE_SHOWCASE_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    const missing = /trade_showcase_items|PGRST205|does not exist/i.test(error.message);
    return NextResponse.json(
      { ok: false, error: missing ? "table_missing" : error.message },
      { status: missing ? 503 : 500 }
    );
  }
  /** 주제 선택용 — 거래 ROOT 주제(이름순 고정 정렬) */
  const { data: cats } = await admin.sb
    .from("categories")
    .select("id, name, slug")
    .eq("type", "trade")
    .is("parent_id", null)
    .order("sort_order", { ascending: true });
  return NextResponse.json({ ok: true, items: data ?? [], categories: cats ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const body = await req.json().catch(() => null);
  const parsed = parseTradeShowcaseInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const { data, error } = await admin.sb
    .from("trade_showcase_items")
    .insert({ ...parsed.value, created_by: admin.userId })
    .select(TRADE_SHOWCASE_SELECT)
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.userId,
    targetType: "trade_showcase_item",
    targetId: (data as { id: string }).id,
    action: "trade_showcase.create",
    after: data as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, item: data });
}
