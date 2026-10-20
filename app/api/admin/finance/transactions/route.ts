import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  loadUnifiedFinanceTransactionByKey,
  loadUnifiedFinanceTransactionPage,
} from "@/lib/finance/unified-transaction/load-unified-transactions";
import type { FinanceWallet } from "@/lib/finance/presentation";
import { resolveFinanceListWindow } from "@/lib/finance/resolve-finance-list-window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/transactions?wallet=&type=&direction=&date=today&from=&to=&storeId=&orderId=&adId=&memberId=&limit=&offset=&txKey=
 * R7 — 현금·코인·포인트 원장을 DB 에서 합쳐 필터·정렬·페이지 (RPC `admin_finance_unified_tx_page`).
 * 응답 `{ ok, transactions, total, limit, offset, window }` — `transactions` 모양은 예전과 같다 (허브·전환·매장 상세 호출 호환).
 * limit 기본 80 · 최대 100 (전체는 total + offset 으로 넘긴다). txKey = 상세 1건.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  try {
    const txKey = url.searchParams.get("txKey")?.trim() ?? "";
    if (txKey) {
      const tx = await loadUnifiedFinanceTransactionByKey(gate.sb, txKey);
      if (!tx) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      return NextResponse.json({ ok: true, transaction: tx });
    }

    const walletRaw = url.searchParams.get("wallet")?.trim().toUpperCase() ?? "";
    const wallet =
      walletRaw === "POINT" || walletRaw === "COIN" || walletRaw === "CASH"
        ? (walletRaw as FinanceWallet)
        : null;

    const dirRaw = url.searchParams.get("direction")?.trim().toLowerCase() ?? "";
    const direction = dirRaw === "credit" || dirRaw === "debit" ? dirRaw : null;

    const window = resolveFinanceListWindow({
      date: url.searchParams.get("date"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    const page = await loadUnifiedFinanceTransactionPage(gate.sb, {
      wallet,
      type: url.searchParams.get("type"),
      direction,
      storeId: url.searchParams.get("storeId"),
      orderId: url.searchParams.get("orderId"),
      adId: url.searchParams.get("adId"),
      memberId: url.searchParams.get("memberId"),
      fromIso: window.fromIso,
      toIso: window.toIso,
      limit: Math.trunc(Number(url.searchParams.get("limit") || 80)),
      offset: Math.trunc(Number(url.searchParams.get("offset") || 0)),
    });

    return NextResponse.json({
      ok: true,
      transactions: page.rows,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      window: { day: window.day, fromIso: window.fromIso, toIso: window.toIso },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
