import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadStorePlatformPayable, parseStorePayableView } from "@/lib/stores/commission/load-store-commission-ledger";
import {
  parseStoreCommissionLedgerQuery,
  STORE_COMMISSION_TIMEZONE,
} from "@/lib/stores/commission/store-commission-ledger-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 플랫폼 지급 의무 — 완료 주문을 "매장 직접 수령 / 플랫폼 지급 의무 / 과거 수동 지급"으로 분류.
 * 레거시 store_settlements 'scheduled' 금액은 지급 의무가 아니다 (원본은 보존, 조회 시 분류).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const q = parseStoreCommissionLedgerQuery(req.nextUrl.searchParams);
  try {
    const page = await loadStorePlatformPayable(gate.sb, {
      storeIds: q.storeId ? [q.storeId] : null,
      fromIso: q.fromIso,
      toIso: q.toIso,
      view: parseStorePayableView(req.nextUrl.searchParams.get("view")),
      limit: q.limit,
      offset: q.offset,
    });
    return NextResponse.json({
      ok: true,
      period: { period: q.period, fromIso: q.fromIso, toIso: q.toIso, timezone: STORE_COMMISSION_TIMEZONE },
      ...page,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
