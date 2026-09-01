import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { COIN_WITHDRAWAL_REQUESTS_TABLE, requestCoinWithdrawal } from "@/lib/currency/coin-withdrawal-writer";
import { loadStoreEconomicPointsBalance } from "@/lib/stores/advertising/canonical-business-cash-writer";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  validateGiftCashOutAmount,
  validateGiftCashOutDestination,
} from "@/lib/gift-certificate/gift-cash-out-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — canonical Coin withdrawal (replaces gift revenue cash-out writer). */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const amount = Math.trunc(Number(body.amount));
  const idempotencyKey = String(body.idempotencyKey ?? body.idempotency_key ?? "").trim();
  const dest = validateGiftCashOutDestination(body);
  if (!dest.ok) return NextResponse.json({ ok: false, error: dest.error }, { status: 400 });
  if (!idempotencyKey) {
    return NextResponse.json({ ok: false, error: "idempotencyKey_required" }, { status: 400 });
  }

  const coin = await loadStoreEconomicPointsBalance(sb, sid);
  const validated = validateGiftCashOutAmount({
    amount,
    availableRevenue: coin.balance,
  });
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error, available: coin.balance },
      { status: 400 }
    );
  }

  const result = await requestCoinWithdrawal(sb, {
    ownerUserId: userId,
    storeId: sid,
    amount: validated.amount,
    destination:
      dest.destination.destinationType === "gcash"
        ? {
            destinationType: "gcash",
            accountNumber: dest.destination.accountNumber,
            accountName: dest.destination.accountName,
          }
        : {
            destinationType: "bank",
            bankName: dest.destination.bankName,
            accountNumber: dest.destination.accountNumber,
            accountName: dest.destination.accountName,
          },
    idempotencyKey,
    sourceKind: "coin",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, requestId: result.requestId }, { status: 201 });
}

/** GET — list coin withdrawal requests for store. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const { data, error } = await sb
    .from(COIN_WITHDRAWAL_REQUESTS_TABLE)
    .select("id, amount, status, destination_type, created_at, paid_at, rejected_at")
    .eq("store_id", sid)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, withdrawals: data ?? [] });
}
