import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminGiftLedgerRedemptions } from "@/lib/gift-certificate/admin-gift-ledger-loaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL_PAGE_MAX = 100;

/**
 * GET /api/admin/gift-certificates/revenue
 * Shared ledger authority for settlement — optional productId / instanceId filters.
 * ?detail=1 adds row-level redemption revenue trace.
 *
 * R7: 합계(대기/확정·미사용 잔액·매장 캐시)는 DB `admin_gift_revenue_page` 가 전체 원장 기준으로 계산한다 (5000건 상한 없음).
 * `detail=1&limit=&offset=` 이면 상세 행도 서버 페이지 (+ total/limit/offset). `limit` 없는 `detail=1` 은 기존 응답(최근 500행).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const url = new URL(req.url);
  const wantDetail = url.searchParams.get("detail") === "1";
  const paged = wantDetail && url.searchParams.has("limit");
  const productId = s(url.searchParams.get("productId") ?? url.searchParams.get("product_id"));
  const instanceId = s(url.searchParams.get("instanceId") ?? url.searchParams.get("instance_id"));
  if ((productId && !UUID_RE.test(productId)) || (instanceId && !UUID_RE.test(instanceId))) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const limitRaw = Math.floor(Number(url.searchParams.get("limit")));
  const limit = paged && Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(DETAIL_PAGE_MAX, limitRaw) : 1;
  const offsetRaw = Math.floor(Number(url.searchParams.get("offset")));
  const offset = paged && Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  const { data: pageData, error: pageErr } = await sb.rpc("admin_gift_revenue_page", {
    p_product_id: productId || null,
    p_instance_id: instanceId || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (pageErr) {
    console.error("[admin gift revenue]", pageErr.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }
  const t = (pageData ?? {}) as Record<string, unknown>;
  const pendingGross = Math.max(0, n(t.pending_gross));
  const pendingPlatformFee = Math.max(0, n(t.pending_platform_fee));
  const pendingMerchantNet = Math.max(0, n(t.pending_merchant_net));
  const recognizedGross = Math.max(0, n(t.recognized_gross));
  const recognizedPlatformFee = Math.max(0, n(t.recognized_platform_fee));
  const recognizedMerchantNet = Math.max(0, n(t.recognized_merchant_net));

  const base = {
    ok: true as const,
    redeemedGross: pendingGross + recognizedGross,
    platformFee: recognizedPlatformFee,
    merchantNet: recognizedMerchantNet,
    pendingGross,
    pendingPlatformFee,
    pendingMerchantNet,
    recognizedGross,
    recognizedPlatformFee,
    recognizedMerchantNet,
    outstandingGiftValue: Math.max(0, n(t.outstanding_gift_value)),
    storeCashTotal: Math.max(0, n(t.store_cash_total)),
  };

  if (!wantDetail) {
    return NextResponse.json(base);
  }

  const pageIds = Array.isArray(t.ids) ? (t.ids as unknown[]).map((v) => s(v)).filter(Boolean) : [];
  const ledger = await loadAdminGiftLedgerRedemptions(
    sb,
    paged
      ? { redemptionIds: pageIds }
      : { productId: productId || null, instanceId: instanceId || null, limit: 500 }
  );
  if (!ledger.ok) {
    return NextResponse.json({ ok: false, error: ledger.error }, { status: 500 });
  }

  const details = ledger.redemptions.map((r) => ({
    redemptionId: r.id,
    storeId: r.storeId,
    storeName: r.storeName,
    publicGiftNumber: r.publicGiftNumber,
    giftScope: r.giftScope,
    instanceId: r.instanceId,
    productId: r.productId,
    orderId: r.orderId,
    orderNo: r.orderNo,
    orderStatus: r.orderStatus,
    gross: r.gross,
    feeRate: r.feeRate,
    platformFee: r.platformFee,
    merchantNet: r.merchantNet,
    recognitionState: r.recognitionState,
    recognizedAt: r.recognizedAt,
    usedAt: r.usedAt,
  }));

  if (paged) {
    return NextResponse.json({
      ...base,
      details,
      total: Math.max(0, n(t.total)),
      limit: Math.max(1, n(t.limit) || limit),
      offset,
    });
  }
  return NextResponse.json({ ...base, details });
}
