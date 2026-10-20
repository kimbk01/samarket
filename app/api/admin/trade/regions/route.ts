import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { parseCommunityAdminPeriodFromSearch } from "@/lib/admin/community-admin/community-admin-period";
import { resolveTradePostLguIds, TRADE_ADMIN_OPEN_REPORT_STATUSES } from "@/lib/admin/trade-admin/trade-posts-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

/**
 * GET /api/admin/trade/regions — 지역(시·군 LGU)별 거래 현황 (설계 v2 §C-11, 읽기 전용)
 * 지역 판정: trade_lgu_id, 없으면 레거시 region/city 를 기존 매핑 테이블로 읽기 시점에만 환산 (데이터 변경 없음).
 * 사용자 앱 노출 순서(내 지역 → 주변 → 전국)·배달 반경과 무관.
 * query: period/from/to (게시물 등록일, 기본 전체)
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const period = parseCommunityAdminPeriodFromSearch(req.nextUrl.searchParams, { defaultPeriod: "all" });
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error }, { status: 400 });

  let q = sb
    .from("posts")
    .select("id, user_id, trade_lgu_id, region, city, moderation_state, owner_state, seller_listing_state", {
      count: "exact",
    });
  if (period.fromIso) q = q.gte("created_at", period.fromIso);
  if (period.toIso) q = q.lt("created_at", period.toIso);
  const { data, error, count } = await q.limit(MAX_ROWS);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if ((count ?? 0) > MAX_ROWS) {
    return NextResponse.json({ ok: false, error: "too_many_rows", total: count }, { status: 413 });
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));
  const nowIso = new Date().toISOString();
  const [lguByPost, reps, promos] = await Promise.all([
    resolveTradePostLguIds(sb, rows as { id: unknown }[]),
    ids.length
      ? sb
          .from("reports")
          .select("product_id, target_id")
          .in("status", [...TRADE_ADMIN_OPEN_REPORT_STATUSES])
          .in("target_type", ["product", "post"])
          .limit(MAX_ROWS)
      : Promise.resolve({ data: [] }),
    sb
      .from("point_promotion_orders")
      .select("target_id")
      .eq("domain", "trade")
      .eq("order_status", "active")
      .lte("start_at", nowIso)
      .gt("end_at", nowIso)
      .limit(MAX_ROWS),
  ]);
  const reported = new Set(
    ((reps.data ?? []) as { product_id: string | null; target_id: string | null }[]).map((r) => r.product_id ?? r.target_id ?? "")
  );
  const promoted = new Set(((promos.data ?? []) as { target_id: string }[]).map((p) => String(p.target_id)));

  type Agg = { posts: number; selling: number; reserved: number; sold: number; hidden: number; sellers: Set<string>; openReports: number; activePromotions: number };
  const agg = new Map<string, Agg>();
  for (const r of rows) {
    const key = lguByPost.get(String(r.id)) ?? "";
    const a =
      agg.get(key) ??
      { posts: 0, selling: 0, reserved: 0, sold: 0, hidden: 0, sellers: new Set<string>(), openReports: 0, activePromotions: 0 };
    a.posts += 1;
    const visible = r.moderation_state === "visible" && r.owner_state === "none";
    if (!visible) a.hidden += 1;
    else if (r.seller_listing_state === "reserved") a.reserved += 1;
    else if (r.seller_listing_state === "completed") a.sold += 1;
    else a.selling += 1;
    if (r.user_id) a.sellers.add(String(r.user_id));
    if (reported.has(String(r.id))) a.openReports += 1;
    if (promoted.has(String(r.id))) a.activePromotions += 1;
    agg.set(key, a);
  }
  const lguIds = [...agg.keys()].filter(Boolean);
  const { data: lgus } = lguIds.length
    ? await sb.from("trade_national_lgu").select("canonical_id, display_name, province_name").in("canonical_id", lguIds)
    : { data: [] };
  const names = new Map(
    ((lgus ?? []) as { canonical_id: string; display_name: string; province_name: string | null }[]).map((l) => [
      l.canonical_id,
      l.province_name ? `${l.display_name} · ${l.province_name}` : l.display_name,
    ])
  );
  return NextResponse.json({
    ok: true,
    total: rows.length,
    rows: [...agg.entries()]
      .map(([lguId, a]) => ({
        lgu_id: lguId || null,
        name: lguId ? (names.get(lguId) ?? lguId) : "지역 확인 불가",
        posts: a.posts,
        selling: a.selling,
        reserved: a.reserved,
        sold: a.sold,
        hidden: a.hidden,
        sellers: a.sellers.size,
        open_reports: a.openReports,
        active_promotions: a.activePromotions,
      }))
      .sort((x, y) => y.posts - x.posts),
  });
}
