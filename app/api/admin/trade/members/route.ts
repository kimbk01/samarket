import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { parseCommunityAdminPage } from "@/lib/admin/community-admin/community-admin-period";
import { sanitizeAdminListSearch, escapeAdminIlike } from "@/lib/admin/pagination/parse-admin-list-page";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { TRADE_ADMIN_OPEN_REPORT_STATUSES } from "@/lib/admin/trade-admin/trade-posts-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 거래 활동 회원 판정 상한 (현재 운영 규모의 수십 배) — 넘으면 응답에 capped 표시 */
const SCAN_CAP = 10000;

/**
 * GET /api/admin/trade/members — 판매자·구매자 (설계 v2 §C-6)
 * 거래 회원 = 거래글을 올렸거나 거래 채팅에 참여한 회원. 회원 데이터는 공용 profiles (SSOT).
 * query: tab=all|restricted|suspended · q(닉네임) · limit · offset
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;
  const tab = (sp.get("tab") ?? "all").trim();
  if (!["all", "restricted", "suspended"].includes(tab)) {
    return NextResponse.json({ ok: false, error: "invalid_tab" }, { status: 400 });
  }
  const q = sanitizeAdminListSearch(sp.get("q"));
  const { limit, offset } = parseCommunityAdminPage(sp);
  const nowIso = new Date().toISOString();

  const [sellers, buyers, restrictions] = await Promise.all([
    sb.from("posts").select("user_id").limit(SCAN_CAP),
    sb.from("chat_rooms").select("buyer_id").eq("room_type", "item_trade").limit(SCAN_CAP),
    sb
      .from("sanctions")
      .select("user_id, restriction, end_at")
      .eq("scope", "trade")
      .eq("sanction_type", "trade_restriction")
      .is("revoked_at", null)
      .or(`end_at.is.null,end_at.gt.${nowIso}`)
      .limit(SCAN_CAP),
  ]);
  const err = sellers.error ?? buyers.error ?? restrictions.error;
  if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 });

  const postCount = new Map<string, number>();
  for (const r of (sellers.data ?? []) as { user_id: string | null }[]) {
    if (r.user_id) postCount.set(r.user_id, (postCount.get(r.user_id) ?? 0) + 1);
  }
  const buyCount = new Map<string, number>();
  for (const r of (buyers.data ?? []) as { buyer_id: string | null }[]) {
    if (r.buyer_id) buyCount.set(r.buyer_id, (buyCount.get(r.buyer_id) ?? 0) + 1);
  }
  const restricted = new Map<string, string[]>();
  for (const r of (restrictions.data ?? []) as { user_id: string; restriction: string }[]) {
    restricted.set(r.user_id, [...(restricted.get(r.user_id) ?? []), r.restriction]);
  }
  let ids = [...new Set([...postCount.keys(), ...buyCount.keys()])];
  const capped = (sellers.data ?? []).length >= SCAN_CAP || (buyers.data ?? []).length >= SCAN_CAP;

  // 프로필 (닉네임 검색·계정 상태)
  const profiles = new Map<string, { status: string | null; nickname: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let pq = sb.from("profiles").select("id, status, nickname").in("id", chunk);
    if (q) pq = pq.ilike("nickname", `%${escapeAdminIlike(q)}%`);
    const { data, error } = await pq;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const p of (data ?? []) as { id: string; status: string | null; nickname: string | null }[]) profiles.set(p.id, p);
  }
  ids = ids.filter((id) => profiles.has(id));
  const suspended = (id: string) => {
    const st = String(profiles.get(id)?.status ?? "");
    return st === "suspended" || st === "blocked" || st === "banned";
  };
  const tabCounts = {
    all: ids.length,
    restricted: ids.filter((id) => restricted.has(id)).length,
    suspended: ids.filter(suspended).length,
  };
  if (tab === "restricted") ids = ids.filter((id) => restricted.has(id));
  if (tab === "suspended") ids = ids.filter(suspended);
  ids.sort((a, b) => (postCount.get(b) ?? 0) + (buyCount.get(b) ?? 0) - ((postCount.get(a) ?? 0) + (buyCount.get(a) ?? 0)));
  const page = ids.slice(offset, offset + limit);

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
    total: ids.length,
    limit,
    offset,
    capped,
    tabCounts,
    rows: page.map((id) => ({
      user_id: id,
      label: formatAdminMemberLabel(identities.get(id)),
      account_status: profiles.get(id)?.status ?? null,
      post_count: postCount.get(id) ?? 0,
      buyer_chat_count: buyCount.get(id) ?? 0,
      trade_restrictions: restricted.get(id) ?? [],
      open_user_reports: openUserReports.get(id) ?? 0,
    })),
  });
}
