import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadStoreCommissionLedger } from "@/lib/stores/commission/load-store-commission-ledger";
import { parseStoreCommissionLedgerQuery } from "@/lib/stores/commission/store-commission-ledger-query";
import { loadStoreCashOrderGateMode } from "@/lib/stores/commission/store-commission-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 매장 수수료 원장 (Owner `/api/me/stores/[storeId]/commission-ledger` 와 동일 loader). */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const { sb } = gate;

  const q = parseStoreCommissionLedgerQuery(req.nextUrl.searchParams);
  let storeIds: string[];
  if (q.storeId) {
    storeIds = [q.storeId];
  } else {
    const { data, error } = await sb.from("stores").select("id").eq("approval_status", "approved").limit(5000);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    storeIds = (data ?? []).map((s) => String(s.id));
  }

  try {
    const [ledger, gateMode] = await Promise.all([
      loadStoreCommissionLedger(sb, { ...q, storeIds }),
      loadStoreCashOrderGateMode(sb),
    ]);
    return NextResponse.json({ ok: true, gateMode, ...ledger });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    console.error("[admin/store-commission-ledger]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
