/**
 * GET /api/admin/community/points — 커뮤니티 관련 포인트 원장 (설계 §C-13). 읽기 전용.
 * 유형: community_reward(보상) · community_reclaim(회수) · promotion_order(커뮤니티 홍보 주문에 연결된 행만) ·
 *       admin_manual(관리자 지급·회수 — 도메인 구분 없음)
 * query: userId · type(위 유형 중 하나) · entryType · period=today|7d|30d|custom|all (+from,to, 마닐라) ·
 *        limit(≤100) · offset
 * → { ok, total, limit, offset, period, sums: { count, amountIn, amountOut } | null, promoOrderIdCapped: false,
 *      rows: [{ id, createdAt, userId, userNickname, entryType, amount, balanceAfter, relatedType, relatedId, description,
 *      actorType, actorId, actorNickname }] }
 * R7: 필터·정렬(created_at DESC, id DESC)·페이지·합계를 DB RPC `admin_point_ledger_domain_page` 한 번으로 —
 *     예전 홍보 주문 id 500건 상한·합계 5,000행 상한 없음. `promoOrderIdCapped` 는 응답 모양 호환용(항상 false).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import {
  communityAdminUuidOrNull,
  parseCommunityAdminPage,
  parseCommunityAdminPeriodFromSearch,
} from "@/lib/admin/community-admin/community-admin-period";
import {
  COMMUNITY_POINT_RELATED_TYPES,
  isCommunityPointRelatedType,
} from "@/lib/admin/community-admin/community-admin-read-contract";
import {
  communityPeriodError,
  communityReadError,
  loadCommunityProfileBriefs,
} from "@/lib/admin/community-admin/community-admin-read-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 도메인별 포인트 원장 DB 페이지 (마이그레이션 20270601161000) */
const LEDGER_PAGE_RPC = "admin_point_ledger_domain_page";

type LedgerRow = {
  id: string;
  user_id: string | null;
  entry_type: string | null;
  amount: number | null;
  balance_after: number | null;
  related_type: string | null;
  related_id: string | null;
  description: string | null;
  actor_type: string | null;
  actor_id?: string | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const gate = await requireCommunityAdmin("read");
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "30d" });
  if (!period.ok) return communityPeriodError(period.error);
  const { limit, offset } = parseCommunityAdminPage(sp);

  const userRaw = sp.get("userId");
  const userId = userRaw ? communityAdminUuidOrNull(userRaw) : null;
  if (userRaw && !userId) return communityReadError("invalid_user_id", 400);
  const typeRaw = String(sp.get("type") ?? "").trim();
  if (typeRaw && !isCommunityPointRelatedType(typeRaw)) return communityReadError("invalid_type", 400);
  const types = typeRaw ? [typeRaw] : [...COMMUNITY_POINT_RELATED_TYPES];
  const entryType = String(sp.get("entryType") ?? "").trim().replace(/[^a-z_]/g, "").slice(0, 40) || null;

  const sb = gate.sb;
  const emptyPeriod = {
    period: period.period,
    from: period.fromDate,
    to: period.toDate,
    fromIso: period.fromIso,
    toIso: period.toIso,
  };

  // 유형 필터(홍보 주문 = 커뮤니티 홍보 주문에 연결된 원장 행만, D-30 보류·확정·해제 포함)·회원·원장 종류·기간 →
  // 정렬·페이지·합계를 DB 가 한 번에 (lib/points/promotion-ledger-related-ids.ts 와 같은 연결 규칙)
  const { data, error } = await sb.rpc(LEDGER_PAGE_RPC, {
    p_domain: "community",
    p_related_types: types,
    p_user_id: userId,
    p_entry_type: entryType,
    p_from: period.fromIso ?? null,
    p_to: period.toIso ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return communityReadError(error.message, 500);
  const res = (data ?? {}) as {
    total?: number;
    sums?: { count?: number; amount_in?: number; amount_out?: number } | null;
    rows?: LedgerRow[];
  };
  const rows = Array.isArray(res.rows) ? res.rows : [];
  const count = Number(res.total ?? 0);
  const sums = res.sums
    ? {
        count: Number(res.sums.count ?? 0),
        amountIn: Number(res.sums.amount_in ?? 0),
        amountOut: Number(res.sums.amount_out ?? 0),
      }
    : null;

  const people = await loadCommunityProfileBriefs(sb, [...rows.map((r) => r.user_id), ...rows.map((r) => r.actor_id)]);
  const nick = (id: string | null | undefined) => {
    const p = id ? people.get(id) : undefined;
    return p?.nickname ?? p?.username ?? null;
  };

  return NextResponse.json({
    ok: true,
    total: count,
    limit,
    offset,
    period: emptyPeriod,
    sums,
    promoOrderIdCapped: false,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      userId: r.user_id,
      userNickname: nick(r.user_id),
      entryType: r.entry_type,
      amount: r.amount,
      balanceAfter: r.balance_after,
      relatedType: r.related_type,
      relatedId: r.related_id,
      description: r.description,
      actorType: r.actor_type,
      actorId: r.actor_id ?? null,
      actorNickname: nick(r.actor_id),
    })),
  });
}
