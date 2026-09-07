import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  loadUnifiedFinanceTransactionByKey,
  loadUnifiedFinanceTransactions,
} from "@/lib/finance/unified-transaction/load-unified-transactions";
import type { FinanceWallet } from "@/lib/finance/presentation";
import { resolveFinanceListWindow } from "@/lib/finance/resolve-finance-list-window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/transactions?wallet=&direction=&date=today&storeId=&orderId=&txKey= */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
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

  const rows = await loadUnifiedFinanceTransactions(gate.sb, {
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
  });

  return NextResponse.json({
    ok: true,
    transactions: rows,
    window: { day: window.day, fromIso: window.fromIso, toIso: window.toIso },
  });
}
