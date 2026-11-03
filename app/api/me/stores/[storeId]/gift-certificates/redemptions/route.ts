import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRedemptionRecognizedFromLedger } from "@/lib/gift-certificate/gift-revenue-recognition";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import {
  pageOwnerGiftRedemptions,
  parseOwnerGiftRedemptionPageParams,
  summarizeOwnerGiftRedemptionPeriod,
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
 * - 기간 안 행이 안전 한도(`GIFT_REDEMPTIONS_SUM_MAX_ROWS`)를 넘으면 `truncated: true` — 화면은 「기간을 줄여 주세요」.
 * - 확정 여부는 수익 원장(REVENUE_AVAILABLE·RECOGNITION_CORRECTION·REVERSED 순합 > 0)으로만 판정.
 */
const GIFT_REDEMPTIONS_SUM_PAGE = 1000;
const GIFT_REDEMPTIONS_SUM_MAX_ROWS = 20_000;
const LEDGER_ID_CHUNK = 100;

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
  const periodParams = parseOwnerMoneyPeriodParams(searchParams);
  if (periodParams.period === "custom" && (!periodParams.fromDay || !periodParams.toDay)) {
    return NextResponse.json({ ok: false, error: "period_required" }, { status: 400 });
  }
  const range = resolveStoreCommissionPeriod(periodParams.period, periodParams.fromDay, periodParams.toDay);
  const pageParams = parseOwnerGiftRedemptionPageParams(searchParams);

  // 1) 기간 전체 사용 행 (합계용 — 1000줄씩, 안전 한도까지)
  const allRows: RedemptionBaseRow[] = [];
  let truncated = false;
  for (let from = 0; ; from += GIFT_REDEMPTIONS_SUM_PAGE) {
    if (from >= GIFT_REDEMPTIONS_SUM_MAX_ROWS) {
      truncated = true;
      break;
    }
    const { data, error } = await sb
      .from(GIFT_TABLES.redemptions)
      .select(
        "id, order_id, instance_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, reversed, created_at, reversed_at"
      )
      .eq("store_id", sid)
      .gte("created_at", range.fromIso ?? "")
      .lt("created_at", range.toIso ?? "")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + GIFT_REDEMPTIONS_SUM_PAGE - 1);
    if (error) {
      return internalErrorResponse("load_failed", "[/api/me/stores/[storeId]/gift-certificates/redemptions GET]", error, 500);
    }
    const page = (data ?? []) as unknown as RedemptionBaseRow[];
    allRows.push(...page);
    if (page.length < GIFT_REDEMPTIONS_SUM_PAGE) break;
  }

  // 2) 확정 여부 — 수익 원장 (기간 전체 행 · id 묶음별)
  const recognizedIds = new Set<string>();
  const allIds = allRows.map((r) => String(r.id));
  for (let i = 0; i < allIds.length; i += LEDGER_ID_CHUNK) {
    const chunk = allIds.slice(i, i + LEDGER_ID_CHUNK);
    const { data: ledgerRows, error: ledgerError } = await sb
      .from(GIFT_TABLES.revenueLedger)
      .select("redemption_id, entry_type, amount")
      .in("redemption_id", chunk)
      .in("entry_type", ["REVENUE_AVAILABLE", "RECOGNITION_CORRECTION", "REVERSED"])
      .limit(5000);
    if (ledgerError) {
      // 확정 여부를 모르는 채로 합계를 내지 않는다 (이전: 오류를 무시해 전부 「확정 대기」로 보임)
      return internalErrorResponse(
        "load_failed",
        "[/api/me/stores/[storeId]/gift-certificates/redemptions GET ledger]",
        ledgerError,
        500
      );
    }
    const byRed = new Map<string, Array<{ entry_type: string; amount: number }>>();
    for (const lr of ledgerRows ?? []) {
      const rid = String((lr as { redemption_id: string }).redemption_id);
      const list = byRed.get(rid) ?? [];
      list.push({
        entry_type: String((lr as { entry_type: string }).entry_type),
        amount: Math.trunc(Number((lr as { amount?: number }).amount) || 0),
      });
      byRed.set(rid, list);
    }
    for (const [rid, entries] of byRed) {
      if (isRedemptionRecognizedFromLedger(entries)) recognizedIds.add(rid);
    }
  }

  const statusRows = allRows.map((r) => ({
    base: r,
    reversed: r.reversed === true,
    recognized: recognizedIds.has(String(r.id)),
    redeemedAmount: Math.trunc(Number(r.redeemed_amount) || 0),
    platformFeeAmount: Math.trunc(Number(r.platform_fee_amount) || 0),
    merchantNetAmount: Math.trunc(Number(r.merchant_net_amount) || 0),
  }));
  const summary = summarizeOwnerGiftRedemptionPeriod(statusRows);
  const paged = pageOwnerGiftRedemptions(statusRows, pageParams);
  const rows = paged.rows;

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
    truncated,
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
