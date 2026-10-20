import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { parseTradeAdminListPage } from "@/lib/admin/trade-admin/trade-admin-list-page";
import {
  communityAdminUuidOrNull,
  parseCommunityAdminPeriodFromSearch,
} from "@/lib/admin/community-admin/community-admin-period";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import {
  applyTradeReportTabFilter,
  isTradeReportTab,
  TRADE_REPORT_TABS,
  type TradeReportTab,
} from "@/lib/admin/metrics/admin-metric-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_TYPES = new Set(["product", "post", "user", "chat_room", "chat", "chat_message", "comment"]);

/**
 * GET /api/admin/trade/reports — 거래 신고 목록 (설계 v2 §C-4). 서버 조회·서버 건수 (브라우저 RLS 읽기 없음).
 * query: tab(open|sanctioned|rejected|all) · targetType · targetId · reporterId · sellerId · period/from/to(접수일) · limit · offset
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;

  const tab = (sp.get("tab") ?? "open").trim();
  // 탭 상태 = 통합 대시보드 「거래 신고 대기」·거래 대시보드와 같은 필터 함수 (applyTradeReportTabFilter)
  if (!isTradeReportTab(tab)) return NextResponse.json({ ok: false, error: "invalid_tab" }, { status: 400 });
  const targetType = (sp.get("targetType") ?? "").trim();
  if (targetType && !TARGET_TYPES.has(targetType)) {
    return NextResponse.json({ ok: false, error: "invalid_target_type" }, { status: 400 });
  }
  const targetId = communityAdminUuidOrNull(sp.get("targetId"));
  const reporterId = communityAdminUuidOrNull(sp.get("reporterId"));
  /** 판매자 기준 — 회원 본인 신고 + 그 회원 거래글 신고 (판매자·구매자 상세 「신고 받은 내역」) */
  const sellerId = communityAdminUuidOrNull(sp.get("sellerId"));
  let sellerPostIds: string[] = [];
  if (sellerId) {
    const { data: sp2, error: spErr } = await sb.from("posts").select("id").eq("user_id", sellerId).limit(2000);
    if (spErr) return NextResponse.json({ ok: false, error: spErr.message }, { status: 500 });
    sellerPostIds = ((sp2 ?? []) as { id: string }[]).map((p) => p.id);
  }
  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "all" });
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error }, { status: 400 });
  const { limit, offset } = parseTradeAdminListPage(sp);

  /* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */
  const base = (tabKey: TradeReportTab, head: boolean): any => {
    let q: any = sb
      .from("reports")
      .select(
        head
          ? "id"
          : "id, reporter_id, target_type, target_id, room_id, product_id, reason_code, reason_text, status, admin_note, created_at, resolved_at, resolved_by",
        { count: "exact", head }
      );
    q = applyTradeReportTabFilter(q, tabKey);
    if (targetType) q = targetType === "product" ? q.in("target_type", ["product", "post"]) : q.eq("target_type", targetType);
    if (targetId) q = q.or(`target_id.eq.${targetId},product_id.eq.${targetId}`);
    if (reporterId) q = q.eq("reporter_id", reporterId);
    if (sellerId) {
      const parts = [`and(target_type.eq.user,target_id.eq.${sellerId})`];
      if (sellerPostIds.length) {
        parts.push(`product_id.in.(${sellerPostIds.join(",")})`, `target_id.in.(${sellerPostIds.join(",")})`);
      }
      q = q.or(parts.join(","));
    }
    if (period.fromIso) q = q.gte("created_at", period.fromIso);
    if (period.toIso) q = q.lt("created_at", period.toIso);
    return q;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const [list, ...counts] = await Promise.all([
    base(tab, false)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    ...TRADE_REPORT_TABS.map((t) => base(t, true)),
  ]);
  if (list.error) return NextResponse.json({ ok: false, error: list.error.message }, { status: 500 });
  const rows = (list.data ?? []) as Record<string, unknown>[];

  const postIds = [
    ...new Set(
      rows
        .filter((r) => r.target_type === "product" || r.target_type === "post")
        .map((r) => String(r.product_id ?? r.target_id ?? ""))
        .filter(Boolean)
    ),
  ];
  const { data: posts } = postIds.length
    ? await sb
        .from("posts")
        .select("id, title, user_id, thumbnail_url, images, moderation_state, owner_state, seller_listing_state")
        .in("id", postIds)
    : { data: [] };
  const postMap = new Map(((posts ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), p]));
  const identities = await loadAdminMemberIdentityMap(sb, [
    ...rows.map((r) => String(r.reporter_id ?? "")),
    ...rows.map((r) => String(r.resolved_by ?? "")),
    ...rows.filter((r) => r.target_type === "user").map((r) => String(r.target_id ?? "")),
    ...((posts ?? []) as Record<string, unknown>[]).map((p) => String(p.user_id ?? "")),
  ]);
  const label = (uid: unknown) => (uid ? formatAdminMemberLabel(identities.get(String(uid))) : null);

  return NextResponse.json({
    ok: true,
    total: list.count ?? rows.length,
    limit,
    offset,
    tabCounts: Object.fromEntries(
      TRADE_REPORT_TABS.map((t, i) => [t, counts[i]?.error ? null : (counts[i]?.count ?? null)])
    ),
    rows: rows.map((r) => {
      const post = postMap.get(String(r.product_id ?? r.target_id ?? "")) ?? null;
      return {
        ...r,
        reporter_label: label(r.reporter_id),
        resolved_by_label: label(r.resolved_by),
        target_user_id: post ? post.user_id : r.target_type === "user" ? r.target_id : null,
        target_user_label: post ? label(post.user_id) : r.target_type === "user" ? label(r.target_id) : null,
        post: post
          ? {
              id: post.id,
              title: post.title,
              thumbnail_url: post.thumbnail_url,
              images: post.images,
              moderation_state: post.moderation_state,
              owner_state: post.owner_state,
              seller_listing_state: post.seller_listing_state,
            }
          : null,
      };
    }),
  });
}
