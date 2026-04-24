/**
 * 구매·판매 건수 한 번에 (내정보 대시보드용)
 * - dev에서 `/purchases?count_only` + `/sales?count_only` 이중 컴파일·이중 auth 방지
 * - 구매/판매 로드는 직렬(reconcile 경합 완화)
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { applyBuyerAutoConfirmAllDue } from "@/lib/trade/apply-buyer-auto-confirm";
import {

  loadPurchaseHistoryRows,
  loadSalesHistoryRows,
  countSalesHistoryItems,
} from "@/lib/mypage/trade-history-load-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  /** 구매·판매 목록 API와 동일 — 스윕은 응답을 막지 않음 */
  void applyBuyerAutoConfirmAllDue(sbAny).catch(() => {});

  try {
    // 직렬 로드: 병렬 시 buyer/seller item_trade reconcile 이 동시에 돌면 Supabase/스토리지 경합으로 간헐 실패할 수 있음
    const purchaseLoad = await loadPurchaseHistoryRows(sbAny, userId, { forCount: true });
    const salesLoad = await loadSalesHistoryRows(sbAny, userId, { forCount: true });
    const purchaseCount = purchaseLoad.rows.length;
    const salesCount = countSalesHistoryItems(salesLoad.rows, salesLoad.sellingPostIds);
    return NextResponse.json({ ok: true, purchaseCount, salesCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
