/**
 * GET /api/admin/community/members — 커뮤니티 작성자 조회 (설계 §C-10). 읽기 전용.
 * query: q(닉네임·아이디·DIBAY ID·회원 UUID) · restricted=1 · account=suspended|active ·
 *        sort=recent|posts|comments|joined|nickname · period=today|7d|30d|custom|all (+from,to YYYY-MM-DD, 마닐라)
 *        — 기간 안에 글·댓글을 쓴 회원만 · limit(≤100) · offset
 * → { ok, total, limit, offset, period, rows: CommunityMemberRow[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import {
  parseCommunityAdminPage,
  parseCommunityAdminPeriodFromSearch,
} from "@/lib/admin/community-admin/community-admin-period";
import { COMMUNITY_MEMBER_SORTS, type CommunityMemberSort } from "@/lib/admin/community-admin/community-admin-read-contract";
import {
  communityPeriodError,
  communityReadError,
  isMissingRpcError,
} from "@/lib/admin/community-admin/community-admin-read-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireCommunityAdmin("read");
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;

  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "all" });
  if (!period.ok) return communityPeriodError(period.error);
  const { limit, offset } = parseCommunityAdminPage(sp);
  const sortRaw = String(sp.get("sort") ?? "").trim();
  const sort: CommunityMemberSort = (COMMUNITY_MEMBER_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as CommunityMemberSort)
    : "recent";
  const accountRaw = String(sp.get("account") ?? "").trim();
  const account = accountRaw === "suspended" || accountRaw === "active" ? accountRaw : null;
  const restricted = sp.get("restricted") === "1" || sp.get("restricted") === "true";
  const q = String(sp.get("q") ?? "").trim().slice(0, 60) || null;

  const { data, error } = await gate.sb.rpc("admin_community_members", {
    p_q: q,
    p_restricted: restricted,
    p_account: account,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
    p_from: period.fromIso,
    p_to: period.toIso,
  });
  if (error) {
    if (isMissingRpcError(error)) return communityReadError("rpc_missing", 503, { rpc: "admin_community_members" });
    return communityReadError(error.message, 500);
  }
  const res = (data ?? {}) as { ok?: boolean; error?: string; total?: number; rows?: unknown[] };
  if (res.ok !== true) return communityReadError(res.error ?? "members_failed", res.error === "forbidden" ? 403 : 500);
  return NextResponse.json({
    ok: true,
    total: Number(res.total ?? 0),
    limit,
    offset,
    period: { period: period.period, from: period.fromDate, to: period.toDate, fromIso: period.fromIso, toIso: period.toIso },
    filters: { q, restricted, account, sort },
    rows: Array.isArray(res.rows) ? res.rows : [],
  });
}
