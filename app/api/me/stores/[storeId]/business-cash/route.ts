import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  AST_004_STORE_POINTS_ECONOMIC,
  AST_005_BUSINESS_CASH,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  buildOwnerConversionDisclosure,
  createBusinessCashTopUpRequest,
  convertStorePointsToBusinessCash,
  listBusinessCashLedgerForStore,
  listEconomicPointLedgerForStore,
  loadStoreBusinessCashBalance,
  loadStoreEconomicPointsBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";
import { BUSINESS_CASH_CHARGE_REQUESTS_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — selected-store Business Cash + Store Points (Economic) finance surface. */
export async function GET(
  _req: NextRequest,
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

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const [bc, sp, quote, bcLedger, spLedger, charges] = await Promise.all([
    loadStoreBusinessCashBalance(sb, sid),
    loadStoreEconomicPointsBalance(sb, sid),
    buildOwnerConversionDisclosure(sb, { storeId: sid, requestedPoints: 0 }),
    listBusinessCashLedgerForStore(sb, sid),
    listEconomicPointLedgerForStore(sb, sid),
    sb
      .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
      .select("id, amount_minor, status, created_at, decided_at")
      .eq("store_id", sid)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    ok: true,
    storeId: sid,
    assets: {
      storePoints: { assetId: AST_004_STORE_POINTS_ECONOMIC, balance: sp.balance },
      businessCash: {
        assetId: AST_005_BUSINESS_CASH,
        balanceMinor: bc.balanceMinor,
        currency: bc.currency,
      },
    },
    conversion: quote
      ? {
          ratePesosPerPoint: quote.ratePesosPerPoint,
          version: quote.version,
          isDefaultRate: quote.isDefaultRate,
          effectiveFrom: quote.effectiveFrom,
          rateChangedNoticeRequired: quote.rateChangedNoticeRequired,
        }
      : null,
    businessCashLedger: bcLedger,
    storePointsLedger: spLedger,
    topUpRequests: (charges.data ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      amountMinor: Math.trunc(Number((r as { amount_minor?: number }).amount_minor) || 0),
      status: String((r as { status?: string }).status ?? ""),
      createdAt: String((r as { created_at?: string }).created_at ?? ""),
      decidedAt:
        (r as { decided_at?: string | null }).decided_at == null
          ? null
          : String((r as { decided_at: string }).decided_at),
    })),
  });
}

type PostBody = {
  op?: string;
  amountMinor?: number;
  points?: number;
  expectedRateVersion?: number;
  idempotencyKey?: string;
  requestedPoints?: number;
  previousRateVersion?: number;
};

/** POST — topup_request | convert | quote */
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

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const op = String(body.op ?? "").trim();

  if (op === "quote") {
    const quote = await buildOwnerConversionDisclosure(sb, {
      storeId: sid,
      requestedPoints: Math.trunc(Number(body.requestedPoints) || 0),
      previousRateVersion:
        body.previousRateVersion == null ? null : Math.trunc(Number(body.previousRateVersion)),
    });
    if (!quote) return NextResponse.json({ ok: false, error: "quote_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, quote });
  }

  if (op === "topup_request") {
    const amountMinor = Math.trunc(Number(body.amountMinor) || 0);
    const idem =
      String(body.idempotencyKey ?? "").trim() ||
      `bc_topup:${userId}:${sid}:${amountMinor}:${Date.now()}`;
    const result = await createBusinessCashTopUpRequest(sb, {
      storeId: sid,
      ownerUserId: userId,
      amountMinor,
      idempotencyKey: idem,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      requestId: result.requestId,
      status: result.status,
      idempotent: result.idempotent === true,
    });
  }

  if (op === "convert") {
    const points = Math.trunc(Number(body.points) || 0);
    const expectedRateVersion = Math.trunc(Number(body.expectedRateVersion) || 0);
    const idem = String(body.idempotencyKey ?? "").trim();
    if (!idem) {
      return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });
    }
    const result = await convertStorePointsToBusinessCash(sb, {
      ownerUserId: userId,
      storeId: sid,
      points,
      expectedRateVersion,
      idempotencyKey: idem,
    });
    if (!result.ok) {
      const status = result.error === "stale_rate" ? 409 : 400;
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          ratePesosPerPoint: result.ratePesosPerPoint ?? null,
          version: result.version ?? null,
          available: result.available ?? null,
        },
        { status }
      );
    }
    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      spDebited: result.spDebited,
      bcCreditedMinor: result.bcCreditedMinor,
      ratePesosPerPoint: result.ratePesosPerPoint,
      rateVersion: result.rateVersion,
      spBalanceAfter: result.spBalanceAfter,
      bcBalanceAfterMinor: result.bcBalanceAfterMinor,
    });
  }

  return NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 });
}
