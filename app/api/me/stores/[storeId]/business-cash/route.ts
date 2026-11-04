import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner, getStoreIfOwnerForOperationalWrite } from "@/lib/stores/owner-product-gate";
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
  loadBusinessCashChargePolicy,
  loadStoreBusinessCashBalance,
  loadStoreEconomicPointsBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";
import { BUSINESS_CASH_CHARGE_REQUESTS_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — selected-store canonical Cash + Coin finance surface. */
const TOP_UP_PAGE_SIZE = 20;

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

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const topUpOffset = Math.max(0, Math.trunc(Number(req.nextUrl.searchParams.get("topup_offset") ?? "0")) || 0);
  // 내역 줄 「자세히」 → 그 충전 신청 1건 (`focus=` · Coin 출금 focus 와 같은 방식 · D-6). 이 매장 것만.
  const focusId = String(req.nextUrl.searchParams.get("focus") ?? "").trim();
  const chargeCols = "id, amount_minor, status, created_at, decided_at, payment_method, payment_reference, reject_reason";
  const [bc, sp, quote, bcLedger, spLedger, charges, chargePolicy, focus] = await Promise.all([
    loadStoreBusinessCashBalance(sb, sid),
    loadStoreEconomicPointsBalance(sb, sid),
    buildOwnerConversionDisclosure(sb, { ownerUserId: userId, storeId: sid, requestedPoints: 0 }),
    listBusinessCashLedgerForStore(sb, sid),
    listEconomicPointLedgerForStore(sb, sid),
    sb
      .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
      .select(chargeCols, {
        count: "exact",
      })
      .eq("store_id", sid)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      // 충전 신청 목록 페이지 (20건씩 · 「최근 20건만」 폐지 — Owner 2026-11-03)
      .range(topUpOffset, topUpOffset + TOP_UP_PAGE_SIZE - 1),
    loadBusinessCashChargePolicy(sb),
    /^[0-9a-f-]{36}$/i.test(focusId)
      ? sb.from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE).select(chargeCols).eq("store_id", sid).eq("id", focusId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
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
    // P0-5 — 정책·한도·전환 가능 최대는 서버 미리보기(DB-2)만. 실패면 null → 화면 「확인 불가」·전환 차단.
    conversion: quote.ok
      ? {
          ratePesosPerPoint: quote.quote.ratePesosPerPoint,
          version: quote.quote.version,
          isDefaultRate: quote.quote.isDefaultRate,
          effectiveFrom: quote.quote.effectiveFrom,
          conversionEnabled: quote.quote.conversionEnabled,
          minimumCoin: quote.quote.minimumCoin,
          conversionUnit: quote.quote.conversionUnit,
          limits: quote.quote.limits,
          usage: quote.quote.usage,
          maxConvertible: quote.quote.maxConvertible,
          outstandingFeeMinor: quote.quote.outstandingFeeMinor,
        }
      : null,
    businessCashLedger: bcLedger,
    storePointsLedger: spLedger,
    topUpPolicy: chargePolicy,
    topUpRequestsTotal: charges.count ?? (charges.data ?? []).length,
    // 목록 조회 실패를 0건으로 숨기지 않는다 (재감사 R8-d)
    topUpRequestsError: Boolean(charges.error),
    topUpRequestsOffset: topUpOffset,
    topUpRequestsPageSize: TOP_UP_PAGE_SIZE,
    topUpRequests: (charges.data ?? []).map(mapTopUpRow),
    topUpFocus: focus.error || !focus.data ? null : mapTopUpRow(focus.data),
  });
}

/** 충전 신청 한 줄 — 목록·focus 같은 모양 */
function mapTopUpRow(r: unknown) {
  return {
    id: String((r as { id: string }).id),
    amountMinor: Math.trunc(Number((r as { amount_minor?: number }).amount_minor) || 0),
    status: String((r as { status?: string }).status ?? ""),
    createdAt: String((r as { created_at?: string }).created_at ?? ""),
    decidedAt:
      (r as { decided_at?: string | null }).decided_at == null
        ? null
        : String((r as { decided_at: string }).decided_at),
    paymentMethod: (r as { payment_method?: string | null }).payment_method ?? null,
    paymentReference: (r as { payment_reference?: string | null }).payment_reference ?? null,
    rejectReason: (r as { reject_reason?: string | null }).reject_reason ?? null,
  };
}

type PostBody = {
  op?: string;
  amountMinor?: number;
  points?: number;
  expectedRateVersion?: number;
  idempotencyKey?: string;
  paymentMethod?: string;
  paymentReference?: string;
  proofFilePath?: string | null;
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

  const gate = await getStoreIfOwnerForOperationalWrite(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const op = String(body.op ?? "").trim();

  if (op === "quote") {
    // P0-5 / DB-2 — 서버 미리보기: 막힘 사유·전후 잔액·미납 정산·실제 증가액. 실행 보증 아님 (convert 가 재검사).
    const quote = await buildOwnerConversionDisclosure(sb, {
      ownerUserId: userId,
      storeId: sid,
      requestedPoints: Math.trunc(Number(body.requestedPoints) || 0),
      previousRateVersion:
        body.previousRateVersion == null ? null : Math.trunc(Number(body.previousRateVersion)),
    });
    if (!quote.ok) {
      const status = quote.error === "forbidden" ? 403 : quote.error === "rate_missing" ? 409 : 503;
      return NextResponse.json({ ok: false, error: quote.error }, { status });
    }
    return NextResponse.json({ ok: true, quote: quote.quote });
  }

  if (op === "topup_request") {
    const amountMinor = Math.trunc(Number(body.amountMinor) || 0);
    // FIN-04 / IA-22 — the form owns one stable key per submission; no server-made fallback (retries must replay).
    const idem = String(body.idempotencyKey ?? "").trim();
    if (!idem) {
      return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });
    }
    const result = await createBusinessCashTopUpRequest(sb, {
      storeId: sid,
      ownerUserId: userId,
      amountMinor,
      paymentMethod: String(body.paymentMethod ?? ""),
      paymentReference: String(body.paymentReference ?? ""),
      proofFilePath: body.proofFilePath == null ? null : String(body.proofFilePath),
      idempotencyKey: idem,
    });
    if (!result.ok) {
      const conflict =
        result.error === "pending_request_exists" ||
        result.error === "payment_reference_duplicate" ||
        result.error === "idempotency_key_reused";
      const status = result.error === "rpc_failed" ? 500 : conflict ? 409 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
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
          minimumCoin: result.minimumCoin ?? null,
          conversionUnit: result.conversionUnit ?? null,
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
