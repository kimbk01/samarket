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
import { loadPromotionLedgerRelatedIds, postgrestInList } from "@/lib/points/promotion-ledger-related-ids";
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

/** 거래 홍보 주문 id 상한 — 넘으면 오래된 주문 행이 빠질 수 있어 응답에 표시 */
const TRADE_POINT_RELATED_TYPES = ["promotion_order", "trade_post_ad", "admin_manual"] as const;
const PROMO_ORDER_ID_CAP = 500;

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
  let promoRelatedIds: string[] = [];
  let promoCapped = false;
  if (types.includes("promotion_order")) {
    // D-30: 보류(hold:)·확정(capture:)·해제(release:) 원장 행까지 포함
    const res = await loadPromotionLedgerRelatedIds(sb, "trade", PROMO_ORDER_ID_CAP);
    if (!res.ok) return communityReadError(res.error, 500);
    promoRelatedIds = res.relatedIds;
    promoCapped = res.capped;
  }
  const plain = types.filter((t) => t !== "promotion_order");
  const ors = [
    ...(plain.length ? [`related_type.in.(${plain.join(",")})`] : []),
    ...(promoRelatedIds.length
      ? [`and(related_type.eq.promotion_order,related_id.in.(${postgrestInList(promoRelatedIds)}))`]
      : []),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST 빌더 체인 공용 필터
  const apply = (q: any): any => {
    let x = q.or(ors.join(","));
    if (userId) x = x.eq("user_id", userId);
    if (entryType) x = x.eq("entry_type", entryType);
    if (period.fromIso) x = x.gte("created_at", period.fromIso);
    if (period.toIso) x = x.lt("created_at", period.toIso);
    return x;
  };

  const emptyPeriod = {
    period: period.period,
    from: period.fromDate,
    to: period.toDate,
    fromIso: period.fromIso,
    toIso: period.toIso,
  };
  if (!ors.length) {
    return NextResponse.json({ ok: true, total: 0, limit, offset, period: emptyPeriod, sums: { count: 0, amountIn: 0, amountOut: 0 }, rows: [], promoOrderIdCapped: false });
  }

  const { data, error, count } = await apply(
    sb.from("point_ledger").select("*", { count: "exact" }).order("created_at", { ascending: false })
  ).range(offset, offset + limit - 1);
  if (error) return communityReadError(error.message, 500);
  const rows = (data ?? []) as LedgerRow[];

  // 합계 — 같은 조건 최대 5,000행 (넘으면 null = 「확인 불가」)
  let sums: { count: number; amountIn: number; amountOut: number } | null = null;
  if ((count ?? 0) <= 5000) {
    const { data: all, error: sumErr } = await apply(sb.from("point_ledger").select("amount")).limit(5000);
    if (!sumErr) {
      let amountIn = 0;
      let amountOut = 0;
      for (const r of (all ?? []) as { amount: number | null }[]) {
        const n = Number(r.amount ?? 0);
        if (n >= 0) amountIn += n;
        else amountOut += n;
      }
      sums = { count: (all ?? []).length, amountIn, amountOut };
    }
  }

  const people = await loadCommunityProfileBriefs(sb, [...rows.map((r) => r.user_id), ...rows.map((r) => r.actor_id)]);
  const nick = (id: string | null | undefined) => {
    const p = id ? people.get(id) : undefined;
    return p?.nickname ?? p?.username ?? null;
  };

  return NextResponse.json({
    ok: true,
    total: count ?? null,
    limit,
    offset,
    period: emptyPeriod,
    sums,
    promoOrderIdCapped: promoCapped,
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
