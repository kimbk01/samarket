/**
 * GET /api/admin/trade/points — 거래 관련 포인트 원장 (거래 Admin 설계 v2 §G-2). 읽기 전용.
 * 공용 원장(point_ledger) 하나를 거래 기준으로 거른다 — 거래 전용 원장은 없다.
 * 유형: promotion_order(거래 홍보 주문 — 차감·보류·확정·해제·환급) · trade_post_ad(이전 거래 광고) ·
 *       admin_manual(관리자 지급·회수 — 도메인 구분 없음)
 * query: userId · type(위 유형 중 하나) · entryType · period=today|7d|30d|custom|all (+from,to, 마닐라) ·
 *        limit(20/50/100, 그 외 50) · offset
 * → { ok, total, limit, offset, period, sums: { count, amountIn, amountOut } | null, rows: [{ id, createdAt, userId,
 *      userNickname, entryType, amount, balanceAfter, relatedType, relatedId, description, actorType, actorId,
 *      actorNickname }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { parseTradeAdminListPage } from "@/lib/admin/trade-admin/trade-admin-list-page";
import {
  communityAdminUuidOrNull,
  parseCommunityAdminPeriodFromSearch,
} from "@/lib/admin/community-admin/community-admin-period";
import {
  communityPeriodError,
  communityReadError,
  loadCommunityProfileBriefs,
} from "@/lib/admin/community-admin/community-admin-read-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRADE_POINT_RELATED_TYPES = ["promotion_order", "trade_post_ad", "admin_manual"] as const;

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
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "30d" });
  if (!period.ok) return communityPeriodError(period.error);
  const { limit, offset } = parseTradeAdminListPage(sp);

  const userRaw = sp.get("userId");
  const userId = userRaw ? communityAdminUuidOrNull(userRaw) : null;
  if (userRaw && !userId) return communityReadError("invalid_user_id", 400);
  const typeRaw = String(sp.get("type") ?? "").trim();
  if (typeRaw && !(TRADE_POINT_RELATED_TYPES as readonly string[]).includes(typeRaw)) {
    return communityReadError("invalid_type", 400);
  }
  const types: string[] = typeRaw ? [typeRaw] : [...TRADE_POINT_RELATED_TYPES];
  const entryType = String(sp.get("entryType") ?? "").trim().replace(/[^a-z_]/g, "").slice(0, 40) || null;

  const sb = gate.sb;
  const emptyPeriod = {
    period: period.period,
    from: period.fromDate,
    to: period.toDate,
    fromIso: period.fromIso,
    toIso: period.toIso,
  };

  // R7: 유형(홍보 주문 = 거래 홍보 주문에 연결된 원장 행 · D-30 보류·확정·해제 포함)·회원·원장 종류·기간 →
  // 정렬·페이지·합계를 DB 한 번에 (커뮤니티 원장과 같은 RPC · p_domain='trade').
  // 예전: 홍보 주문 id 최근 500건만 in(...) 으로 거르고 합계는 최대 5,000행만 읽었다.
  const { data, error } = await sb.rpc("admin_point_ledger_domain_page", {
    p_domain: "trade",
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
