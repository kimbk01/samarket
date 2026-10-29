import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { parseTradeAdminListPage } from "@/lib/admin/trade-admin/trade-admin-list-page";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";
import { sanitizeAdminListSearch } from "@/lib/admin/pagination/parse-admin-list-page";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { TRADE_ADMIN_OPEN_REPORT_STATUSES } from "@/lib/admin/trade-admin/trade-posts-query";
import { isMissingRpcError } from "@/lib/admin/community-admin/community-admin-read-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TradeMemberRpcRow = {
  user_id: string;
  account_status: string | null;
  post_count: number;
  buyer_chat_count: number;
  trade_restrictions: string[];
};
type TradeMembersRpc = {
  ok?: boolean;
  error?: string;
  total?: number;
  tab_counts?: { all?: number; restricted?: number; suspended?: number };
  rows?: TradeMemberRpcRow[];
};

/**
 * GET /api/admin/trade/members — 판매자·구매자 (설계 v2 §C-6)
 * 거래 회원 = 거래글을 올렸거나 거래 채팅에 참여한 회원. 회원 데이터는 공용 profiles (SSOT).
 * 판정·검색·탭·정렬·페이지 = DB RPC `admin_trade_members` (전체 대상 — 예전 posts·chat_rooms 10000건 훑기·메모리 페이지 제거).
 * query: tab=all|restricted|suspended · q(닉네임) · userId(회원 1명) · limit · offset
 * 응답 모양 유지: { ok, total, limit, offset, capped(항상 false — 호환), tabCounts, rows }
 */
export async function GET(req: NextRequest) {
  // G-15: 같은 회원 정보 조회 = 중앙 `/api/admin/users*` 와 같은 `users` 키 (거래 화면 진입점도 동일)
  const admin = await requireAdminPermission("users");
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;
  const tab = (sp.get("tab") ?? "all").trim();
  if (!["all", "restricted", "suspended"].includes(tab)) {
    return NextResponse.json({ ok: false, error: "invalid_tab" }, { status: 400 });
  }
  const q = sanitizeAdminListSearch(sp.get("q"));
  /** 특정 회원 1명 (상세 화면 머리말용) — 거래 활동이 없어도 돌려준다 */
  const onlyUserId = communityAdminUuidOrNull(sp.get("userId"));
  const { limit, offset } = parseTradeAdminListPage(sp);

  const { data, error } = await sb.rpc("admin_trade_members", {
    p_tab: tab,
    p_q: q || null,
    p_user_id: onlyUserId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json({ ok: false, error: "rpc_missing", rpc: "admin_trade_members" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const res = (data ?? {}) as TradeMembersRpc;
  if (res.ok !== true) return NextResponse.json({ ok: false, error: res.error ?? "members_failed" }, { status: 500 });
  const pageRows = Array.isArray(res.rows) ? res.rows : [];
  const page = pageRows.map((r) => r.user_id);
  const tabCounts = {
    all: Number(res.tab_counts?.all ?? 0),
    restricted: Number(res.tab_counts?.restricted ?? 0),
    suspended: Number(res.tab_counts?.suspended ?? 0),
  };

  const [identities, reports] = await Promise.all([
    loadAdminMemberIdentityMap(sb, page),
    page.length
      ? sb
          .from("reports")
          .select("target_id, product_id, target_type")
          .in("status", [...TRADE_ADMIN_OPEN_REPORT_STATUSES])
          .eq("target_type", "user")
          .in("target_id", page)
      : Promise.resolve({ data: [] }),
  ]);
  const openUserReports = new Map<string, number>();
  for (const r of (reports.data ?? []) as { target_id: string }[]) {
    openUserReports.set(r.target_id, (openUserReports.get(r.target_id) ?? 0) + 1);
  }

  return NextResponse.json({
    ok: true,
    total: typeof res.total === "number" ? res.total : pageRows.length,
    limit,
    offset,
    capped: false,
    tabCounts,
    rows: pageRows.map((r) => ({
      user_id: r.user_id,
      label: formatAdminMemberLabel(identities.get(r.user_id)),
      account_status: r.account_status ?? null,
      post_count: Number(r.post_count ?? 0),
      buyer_chat_count: Number(r.buyer_chat_count ?? 0),
      trade_restrictions: Array.isArray(r.trade_restrictions) ? r.trade_restrictions : [],
      open_user_reports: openUserReports.get(r.user_id) ?? 0,
    })),
  });
}
