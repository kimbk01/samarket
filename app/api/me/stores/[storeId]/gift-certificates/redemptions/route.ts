import { NextResponse } from "next/server";
import { invalidPeriodResponse } from "@/lib/stores/commission/period-input-response";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import {
  ownerGiftRedemptionSummaryFromGroups,
  parseOwnerGiftRedemptionPageParams,
} from "@/lib/gift-certificate/owner-gift-money-ops";
import { loadGiftRailPayoutSummary } from "@/lib/gift-certificate/gift-rail-payout";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import {
  parseOwnerMoneyPeriodParams,
  resolveStoreCommissionPeriod,
  STORE_COMMISSION_TIMEZONE,
} from "@/lib/stores/commission/store-commission-ledger-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/stores/[storeId]/gift-certificates/redemptions
 * Owner same-store redemption list with fee snapshot (server authority).
 * 기간 = 사용(차감) 시각 `created_at` · 사장님 기간(`period`·`from`·`to`, 없음·all → 이번 달, PHT) — 누적 없음.
 * 쪽 나눔(C-6 · Owner 2026-11-03): `status`(all|pending|recognized|refund)·`offset`·`limit`(기본 20, 최대 100).
 * - `summary` 합계·건수는 **고른 기간 전체** 행으로 서버가 계산한다 (현재 쪽 합계 아님).
 * - `total` = 상태 거르기 뒤 전체 건수. `redemptions` = 그중 이 쪽만 (주문·고객·상품명 꾸밈은 이 쪽만).
 * - 합계·거르기·쪽은 DB 함수 `owner_gift_redemption_page` 1회(P-9) — 전량 합산(「일부만 합산」 없음).
 * - 확정 여부는 수익 원장(REVENUE_AVAILABLE·RECOGNITION_CORRECTION·REVERSED 순합 > 0)으로만 판정.
 */

type RedemptionBaseRow = {
  id: string;
  order_id: string;
  instance_id: string;
  redeemed_amount: number | null;
  platform_fee_amount: number | null;
  merchant_net_amount: number | null;
  platform_fee_rate_snapshot: number | null;
  reversed: boolean | null;
  created_at: string | null;
  reversed_at: string | null;
};

export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  const searchParams = new URL(req.url).searchParams;
  // 잘못된 기간(날짜 하나만·뒤바뀜·형식 오류) → 400 (D-12 · 이전 검사는 이번 달 대체 뒤라 실행되지 않았다)
  const badPeriod = invalidPeriodResponse(searchParams);
  if (badPeriod) return badPeriod;
  const periodParams = parseOwnerMoneyPeriodParams(searchParams);
  const range = resolveStoreCommissionPeriod(periodParams.period, periodParams.fromDay, periodParams.toDay);
  const pageParams = parseOwnerGiftRedemptionPageParams(searchParams);

  // 합계(기간 전체)·거르기·쪽 = DB 1회 (재감사 P-9 · `owner_gift_redemption_page`).
  // 이전: 기간 안 행 전부(최대 2만 줄)와 수익 원장을 서버 메모리로 읽어 합산·거르기·자르기.
  const { data: pageData, error: pageError } = await sb.rpc("owner_gift_redemption_page", {
    p_store_id: sid,
    p_from: range.fromIso,
    p_to: range.toIso,
    p_filter: pageParams.filter,
    p_limit: pageParams.limit,
    p_offset: pageParams.offset,
  });
  if (pageError || !pageData || typeof pageData !== "object") {
    return internalErrorResponse(
      "load_failed",
      "[/api/me/stores/[storeId]/gift-certificates/redemptions GET]",
      pageError ?? new Error("empty"),
      500
    );
  }
  const pageObj = pageData as { groups?: unknown; total?: number | string; rows?: Array<RedemptionBaseRow & { recognized?: boolean }> };
  const summary = ownerGiftRedemptionSummaryFromGroups(pageObj.groups);
  const paged = { total: Math.max(0, Math.trunc(Number(pageObj.total) || 0)) };
  const rows = (pageObj.rows ?? []).map((r) => ({
    base: r,
    reversed: r.reversed === true,
    recognized: r.recognized === true,
    redeemedAmount: Math.trunc(Number(r.redeemed_amount) || 0),
    platformFeeAmount: Math.trunc(Number(r.platform_fee_amount) || 0),
    merchantNetAmount: Math.trunc(Number(r.merchant_net_amount) || 0),
  }));

  const instanceIds = [...new Set(rows.map((r) => String(r.base.instance_id)))];
  const orderIds = [...new Set(rows.map((r) => String(r.base.order_id)))];

  const titleByInstance = new Map<string, string>();
  const publicNumberByInstance = new Map<string, string>();
  const giftScopeByInstance = new Map<string, "STORE" | "PLATFORM">();
  const orderNoById = new Map<string, string | null>();
  const orderStatusById = new Map<string, string>();
  const customerLabelByOrder = new Map<string, string>();

  if (instanceIds.length > 0) {
    const { data: instRows } = await sb
      .from(GIFT_TABLES.instances)
      .select("id, public_gift_number, product_id, gift_scope")
      .in("id", instanceIds)
      .limit(1000);
    const productIds = [
      ...new Set((instRows ?? []).map((r) => String((r as { product_id?: string }).product_id ?? "")).filter(Boolean)),
    ];
    const titleByProduct = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: products } = await sb
        .from(GIFT_TABLES.products)
        .select("id, title")
        .in("id", productIds)
        .limit(1000);
      for (const p of products ?? []) {
        titleByProduct.set(String((p as { id: string }).id), String((p as { title?: string }).title ?? ""));
      }
    }
    for (const inst of instRows ?? []) {
      const id = String((inst as { id: string }).id);
      const pid = String((inst as { product_id?: string }).product_id ?? "");
      titleByInstance.set(id, titleByProduct.get(pid) ?? "");
      publicNumberByInstance.set(
        id,
        String((inst as { public_gift_number?: string | null }).public_gift_number ?? "")
      );
      giftScopeByInstance.set(
        id,
        String((inst as { gift_scope?: string }).gift_scope ?? "") === "PLATFORM"
          ? "PLATFORM"
          : "STORE"
      );
    }
  }

  if (orderIds.length > 0) {
    const { data: orders } = await sb
      .from("store_orders")
      .select("id, order_no, order_status, user_id")
      .eq("store_id", sid)
      .in("id", orderIds)
      .limit(1000);
    const buyerIds = [
      ...new Set(
        (orders ?? [])
          .map((o) => String((o as { user_id?: string | null }).user_id ?? "").trim())
          .filter(Boolean)
      ),
    ];
    const labelByBuyer = new Map<string, string>();
    if (buyerIds.length > 0) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, display_name, nickname, username")
        .in("id", buyerIds)
        .limit(1000);
      for (const p of profiles ?? []) {
        const id = String((p as { id: string }).id);
        const display = String((p as { display_name?: string }).display_name ?? "").trim();
        const nick = String((p as { nickname?: string }).nickname ?? "").trim();
        const user = String((p as { username?: string }).username ?? "").trim();
        const raw = display || nick || user || id.slice(0, 8);
        // Mask: keep first char + *** + last digit/char if long enough
        const masked =
          raw.length <= 2
            ? `${raw[0] ?? "?"}***`
            : `${raw.slice(0, 1)}***${raw.slice(-1)}`;
        labelByBuyer.set(id, masked);
      }
    }
    for (const o of orders ?? []) {
      const oid = String((o as { id: string }).id);
      orderNoById.set(
        oid,
        (o as { order_no?: string | null }).order_no != null
          ? String((o as { order_no: string }).order_no)
          : null
      );
      orderStatusById.set(oid, String((o as { order_status?: string | null }).order_status ?? ""));
      const uid = String((o as { user_id?: string | null }).user_id ?? "").trim();
      customerLabelByOrder.set(
        oid,
        uid ? labelByBuyer.get(uid) || `${uid.slice(0, 1)}***${uid.slice(-1)}` : "—"
      );
    }
  }

  const redemptions = rows.map((row) => {
    const r = row.base;
    const instanceId = String(r.instance_id);
    const orderId = String(r.order_id);
    return {
      id: String(r.id),
      orderId,
      orderNo: orderNoById.get(orderId) ?? null,
      orderStatus: orderStatusById.get(orderId) || null,
      customerLabel: customerLabelByOrder.get(orderId) || "—",
      instanceId,
      publicGiftNumber: publicNumberByInstance.get(instanceId) ?? "",
      giftScope: giftScopeByInstance.get(instanceId) ?? "STORE",
      giftTitle: titleByInstance.get(instanceId) ?? "",
      redeemedAmount: row.redeemedAmount,
      platformFeeAmount: row.platformFeeAmount,
      merchantNetAmount: row.merchantNetAmount,
      platformFeeRateSnapshot: Math.trunc(Number(r.platform_fee_rate_snapshot) || 0),
      recognized: row.recognized,
      reversed: row.reversed,
      createdAt: String(r.created_at ?? ""),
      reversedAt: r.reversed_at == null ? null : String(r.reversed_at),
    };
  });

  // D-2 option A: gift revenue is settled on the gift rail (admin payout) — same SQL reader as Admin.
  const giftRail = await loadGiftRailPayoutSummary(sb, sid);

  return NextResponse.json({
    ok: true,
    period: { ...periodParams, ...range, timezone: STORE_COMMISSION_TIMEZONE },
    summary,
    status: pageParams.filter,
    offset: pageParams.offset,
    limit: pageParams.limit,
    total: paged.total,
    redemptions,
    giftRail: giftRail
      ? { availablePhp: giftRail.availablePhp, paidOutPhp: giftRail.paidOutPhp, lastPaidAt: giftRail.lastPaidAt }
      : null,
  });
}
