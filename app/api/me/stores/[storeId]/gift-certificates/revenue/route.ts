import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/stores/[storeId]/gift-certificates/revenue */
export async function GET(
  _req: Request,
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

  const [availRes, ledgerRes, cashRes, recoveryRes, outstandingRes] = await Promise.all([
    sb.rpc("gift_certificate_store_revenue_available", { p_store_id: sid }),
    sb
      .from(GIFT_TABLES.revenueLedger)
      .select("id, store_id, redemption_id, entry_type, amount, related_type, related_id, created_at")
      .eq("store_id", sid)
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from(GIFT_TABLES.storeCashAccounts).select("store_id, balance, updated_at").eq("store_id", sid).maybeSingle(),
    sb
      .from(GIFT_TABLES.storeCashRecoveryObligations)
      .select("id, amount_remaining, status")
      .eq("store_id", sid)
      .in("status", ["OPEN", "PARTIALLY_CLEARED"])
      .limit(50),
    sb
      .from(GIFT_TABLES.instances)
      .select("remaining_balance, status")
      .eq("store_id", sid)
      .in("status", ["ACTIVE", "PARTIALLY_REDEEMED", "GIFT_LOCKED"])
      .limit(500),
  ]);

  if (ledgerRes.error) {
    return NextResponse.json({ ok: false, error: ledgerRes.error.message }, { status: 500 });
  }

  const available =
    typeof availRes.data === "number"
      ? Math.trunc(availRes.data)
      : Math.trunc(Number(availRes.data) || 0);

  const openRecoveryAmount = (recoveryRes.data ?? []).reduce(
    (s, r) => s + Math.max(0, Math.trunc(Number((r as { amount_remaining?: number }).amount_remaining) || 0)),
    0
  );
  const outstandingBalance = (outstandingRes.data ?? []).reduce(
    (s, r) => s + Math.max(0, Math.trunc(Number((r as { remaining_balance?: number }).remaining_balance) || 0)),
    0
  );

  return NextResponse.json({
    ok: true,
    availableRevenue: available,
    storeCashBalance: cashRes.data ? Math.trunc(Number(cashRes.data.balance) || 0) : 0,
    openRecoveryAmount,
    outstandingBalance,
    ledger: ledgerRes.data ?? [],
  });
}
