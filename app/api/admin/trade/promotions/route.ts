import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import {
  communityAdminUuidOrNull,
  parseCommunityAdminPage,
  parseCommunityAdminPeriodFromSearch,
} from "@/lib/admin/community-admin/community-admin-period";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRADE_PROMOTION_TAB_STATUSES: Record<string, string[] | null> = {
  pending_review: ["pending_review"],
  active: ["active"],
  paused: ["paused"],
  ended: ["ended", "expired"],
  rejected: ["rejected", "cancelled"],
  all: null,
};

/**
 * GET /api/admin/trade/promotions — 거래 홍보(더 알리기) 주문 (point_promotion_orders domain='trade', 설계 v2 §G-1)
 * query: tab · userId · postId · period/from/to(신청일) · limit · offset
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;
  const tab = (sp.get("tab") ?? "pending_review").trim();
  if (!(tab in TRADE_PROMOTION_TAB_STATUSES)) {
    return NextResponse.json({ ok: false, error: "invalid_tab" }, { status: 400 });
  }
  const userId = communityAdminUuidOrNull(sp.get("userId"));
  const postId = communityAdminUuidOrNull(sp.get("postId"));
  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "all" });
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error }, { status: 400 });
  const { limit, offset } = parseCommunityAdminPage(sp);

  /* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */
  const base = (statuses: string[] | null, head: boolean): any => {
    let q: any = sb
      .from("point_promotion_orders")
      .select(head ? "id" : "*", { count: "exact", head })
      .eq("domain", "trade");
    if (statuses) q = q.in("order_status", statuses);
    if (userId) q = q.eq("user_id", userId);
    if (postId) q = q.eq("target_id", postId);
    if (period.fromIso) q = q.gte("created_at", period.fromIso);
    if (period.toIso) q = q.lt("created_at", period.toIso);
    return q;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [list, ...counts] = await Promise.all([
    base(TRADE_PROMOTION_TAB_STATUSES[tab], false)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    ...Object.keys(TRADE_PROMOTION_TAB_STATUSES).map((t) => base(TRADE_PROMOTION_TAB_STATUSES[t], true)),
  ]);
  if (list.error) return NextResponse.json({ ok: false, error: list.error.message }, { status: 500 });
  const rows = (list.data ?? []) as Record<string, unknown>[];

  const postIds = [...new Set(rows.map((r) => String(r.target_id ?? "")).filter(Boolean))];
  const { data: posts } = postIds.length
    ? await sb.from("posts").select("id, title, thumbnail_url, images, moderation_state, owner_state").in("id", postIds)
    : { data: [] };
  const postMap = new Map(((posts ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), p]));
  const identities = await loadAdminMemberIdentityMap(sb, [
    ...rows.map((r) => String(r.user_id ?? "")),
    ...rows.map((r) => String(r.ended_by ?? "")),
  ]);
  const label = (uid: unknown) => (uid ? formatAdminMemberLabel(identities.get(String(uid))) : null);
  const nowMs = Date.now();

  return NextResponse.json({
    ok: true,
    total: list.count ?? rows.length,
    limit,
    offset,
    tabCounts: Object.fromEntries(
      Object.keys(TRADE_PROMOTION_TAB_STATUSES).map((t, i) => [t, counts[i]?.error ? null : (counts[i]?.count ?? null)])
    ),
    rows: rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      user_label: label(r.user_id),
      target_id: r.target_id,
      target_title: r.target_title,
      post: postMap.get(String(r.target_id ?? "")) ?? null,
      placement: r.placement,
      duration_days: r.duration_days,
      point_cost: r.point_cost,
      order_status: r.order_status,
      /** 진행 중인데 종료일이 지난 주문 (만료 처리 전) */
      overdue: r.order_status === "active" && r.end_at ? new Date(String(r.end_at)).getTime() < nowMs : false,
      start_at: r.start_at,
      end_at: r.end_at,
      created_at: r.created_at,
      ended_at: r.ended_at ?? null,
      ended_by_label: label(r.ended_by),
      fault: r.fault ?? null,
      refund_points: r.refund_points ?? null,
      review_reason: r.review_reason ?? null,
    })),
  });
}
