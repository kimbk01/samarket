import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import {
  countTradePosts,
  listTradePosts,
  loadTradePostsContext,
  resolveTradePostLguIds,
  TRADE_ADMIN_OPEN_REPORT_STATUSES,
  type TradePostsFilter,
} from "@/lib/admin/trade-admin/trade-posts-query";
import {
  parseTradePostSort,
  parseTradePostTab,
  TRADE_POST_TABS,
} from "@/lib/admin/trade-admin/trade-post-tabs";
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

function numOrNull(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/admin/trade/posts — 거래 게시물 목록 + 탭 건수 (설계 v2 §C-2)
 * query: tab · q · sellerId · categoryId · tradeType(product|job) · lguId · period/from/to(등록일, PHT)
 *        · priceMin · priceMax · sort · limit · offset · counts=0(건수 생략)
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;

  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "all" });
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error }, { status: 400 });
  const tradeTypeRaw = (sp.get("tradeType") ?? "").trim();
  const lguRaw = (sp.get("lguId") ?? "").trim();
  const filter: TradePostsFilter = {
    q: sp.get("q") ?? "",
    sellerId: communityAdminUuidOrNull(sp.get("sellerId")),
    categoryId: communityAdminUuidOrNull(sp.get("categoryId")),
    tradeType: tradeTypeRaw === "product" || tradeTypeRaw === "job" ? tradeTypeRaw : null,
    lguId: /^[0-9A-Za-z_-]{1,40}$/.test(lguRaw) ? lguRaw : null,
    fromIso: period.fromIso,
    toIso: period.toIso,
    priceMin: numOrNull(sp.get("priceMin")),
    priceMax: numOrNull(sp.get("priceMax")),
  };
  const tab = parseTradePostTab(sp.get("tab"));
  const sort = parseTradePostSort(sp.get("sort"));
  const { limit, offset } = parseCommunityAdminPage(sp);

  const ctxRes = await loadTradePostsContext(sb, { lguId: filter.lguId });
  if (!ctxRes.ok) return NextResponse.json({ ok: false, error: ctxRes.error }, { status: 500 });
  const ctx = ctxRes.ctx;

  const [list, counts] = await Promise.all([
    listTradePosts(sb, { tab, filter, sort, offset, limit }, ctx),
    sp.get("counts") === "0"
      ? Promise.resolve(null)
      : Promise.all(TRADE_POST_TABS.map(async (t) => [t, await countTradePosts(sb, t, filter, ctx)] as const)),
  ]);
  if (!list.ok) return NextResponse.json({ ok: false, error: list.error }, { status: 500 });

  const rows = list.rows;
  const postIds = rows.map((r) => String(r.id));
  const catIds = [...new Set(rows.map((r) => String(r.trade_category_id ?? "")).filter(Boolean))];
  const lguByPost = await resolveTradePostLguIds(sb, rows as { id: unknown }[]);
  const lguIds = [...new Set(lguByPost.values())];

  const [identities, catsRes, lguRes, repRes] = await Promise.all([
    loadAdminMemberIdentityMap(sb, rows.map((r) => String(r.user_id ?? ""))),
    catIds.length ? sb.from("categories").select("id, name, is_active").in("id", catIds) : Promise.resolve({ data: [] }),
    lguIds.length
      ? sb.from("trade_national_lgu").select("canonical_id, display_name, province_name").in("canonical_id", lguIds)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? sb
          .from("reports")
          .select("product_id, target_id")
          .in("status", [...TRADE_ADMIN_OPEN_REPORT_STATUSES])
          .or(`product_id.in.(${postIds.join(",")}),target_id.in.(${postIds.join(",")})`)
      : Promise.resolve({ data: [] }),
  ]);
  const catMap = new Map(
    ((catsRes.data ?? []) as { id: string; name: string; is_active: boolean | null }[]).map((c) => [c.id, c])
  );
  const lguMap = new Map(
    ((lguRes.data ?? []) as { canonical_id: string; display_name: string; province_name: string | null }[]).map(
      (l) => [l.canonical_id, l]
    )
  );
  const openReports = new Map<string, number>();
  for (const r of (repRes.data ?? []) as { product_id: string | null; target_id: string | null }[]) {
    const id = r.product_id ?? r.target_id;
    if (id) openReports.set(id, (openReports.get(id) ?? 0) + 1);
  }

  return NextResponse.json({
    ok: true,
    total: list.total,
    limit,
    offset,
    tabCounts: counts ? Object.fromEntries(counts) : null,
    rows: rows.map((r) => {
      const uid = String(r.user_id ?? "");
      const ident = identities.get(uid) ?? null;
      const cat = catMap.get(String(r.trade_category_id ?? ""));
      const lgu = lguMap.get(lguByPost.get(String(r.id)) ?? "");
      return {
        ...r,
        seller_label: formatAdminMemberLabel(ident),
        seller_nickname: ident?.nickname ?? null,
        seller_dibay_id: ident?.username ?? null,
        category_name: cat?.name ?? null,
        category_active: cat ? cat.is_active !== false : null,
        lgu_id: lguByPost.get(String(r.id)) ?? null,
        region_label: lgu ? lgu.display_name : null,
        open_report_count: openReports.get(String(r.id)) ?? 0,
      };
    }),
  });
}
