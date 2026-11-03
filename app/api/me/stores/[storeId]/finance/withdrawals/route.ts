import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { COIN_WITHDRAWAL_REQUESTS_TABLE, requestCoinWithdrawal } from "@/lib/currency/coin-withdrawal-writer";
import { loadStoreEconomicPointsBalance } from "@/lib/stores/advertising/canonical-business-cash-writer";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { getStoreIfOwnerForOperationalWrite } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  validateGiftCashOutAmount,
  validateGiftCashOutDestination,
} from "@/lib/gift-certificate/gift-cash-out-ops";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — canonical Coin withdrawal (replaces gift revenue cash-out writer). */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwnerForOperationalWrite(sb, userId, sid);
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
  // P0-1 — 잔액을 확인하지 못하면 신청을 받지 않는다 (0 으로 가정하지 않음)
  if (coin.balance == null) {
    return NextResponse.json({ ok: false, error: "balance_unavailable" }, { status: 503 });
  }
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
    const status = result.error === "not_owner" ? 403 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, requestId: result.requestId }, { status: 201 });
}

const WITHDRAWAL_PAGE_SIZE = 20;

/** GET — list coin withdrawal requests for store (`offset` 페이지). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const offset = Math.max(0, Math.trunc(Number(req.nextUrl.searchParams.get("offset") ?? "0")) || 0);
  // 내역 줄 「자세히」 → 그 출금 신청 1건 (재감사 R6-i). 이 매장 것만.
  const focusId = String(req.nextUrl.searchParams.get("focus") ?? "").trim();
  const cols =
    "id, amount, status, destination_type, created_at, paid_at, rejected_at, rejection_reason, payout_method, payout_reference";
  const [list, focus] = await Promise.all([
    sb
      .from(COIN_WITHDRAWAL_REQUESTS_TABLE)
      .select(cols, { count: "exact" })
      .eq("store_id", sid)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      // 페이지 20건씩 (「최근 50건만」 폐지 — Owner 2026-11-03)
      .range(offset, offset + WITHDRAWAL_PAGE_SIZE - 1),
    /^[0-9a-f-]{36}$/i.test(focusId)
      ? sb.from(COIN_WITHDRAWAL_REQUESTS_TABLE).select(cols).eq("store_id", sid).eq("id", focusId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data, error, count } = list;

  if (error) return internalErrorResponse("load_failed", "[/api/me/stores/[storeId]/finance/withdrawals GET]", error, 500);
  return NextResponse.json({
    ok: true,
    withdrawals: data ?? [],
    total: count ?? (data ?? []).length,
    offset,
    pageSize: WITHDRAWAL_PAGE_SIZE,
    focus: focus.error ? null : focus.data ?? null,
  });
}
