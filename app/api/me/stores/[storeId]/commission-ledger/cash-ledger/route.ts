import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { loadStoreCashLedgerPage } from "@/lib/stores/commission/load-store-commission-ledger";
import { parseStoreCommissionLedgerQuery } from "@/lib/stores/commission/store-commission-ledger-query";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 자기 매장 캐시 거래 원장 — Admin 과 동일 SQL 함수. */
export async function GET(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const q = parseStoreCommissionLedgerQuery(req.nextUrl.searchParams);
  try {
    const page = await loadStoreCashLedgerPage(sb, {
      storeIds: [sid],
      fromIso: q.fromIso,
      toIso: q.toIso,
      kinds: q.kinds,
      limit: q.limit,
      offset: q.offset,
    });
    return NextResponse.json({
      ok: true,
      period: { period: q.period, fromIso: q.fromIso, toIso: q.toIso, timezone: "UTC" },
      ...page,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    console.error("[me/commission-ledger/cash-ledger]", message);
    return internalErrorResponse("load_failed", "[/api/me/stores/[storeId]/commission-ledger/cash-ledger GET]", message, 500);
  }
}
