import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_CASH_LEDGER_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import {
  AST_005_BUSINESS_CASH,
  DELIVERY_AD_CANONICAL_PAYMENT_MODEL,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  loadCanonicalBcFundingDetailForApplication,
  loadStoreBusinessCashBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

function productFrom(raw: unknown): "store_sponsored" | "banner" | null {
  return raw === "banner" || raw === "store_sponsored" ? raw : null;
}

async function loadOwnedCampaignStoreId(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  input: {
    product: "store_sponsored" | "banner";
    campaignId: string;
    ownerUserId: string;
  }
): Promise<string | null> {
  const table =
    input.product === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;
  const { data, error } = await sb
    .from(table)
    .select("store_id, owner_user_id")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { store_id?: string; owner_user_id?: string };
  if (String(row.owner_user_id ?? "") !== input.ownerUserId) return null;
  const storeId = String(row.store_id ?? "").trim();
  return storeId || null;
}

/** GET — canonical Cash funding status for Owner campaign. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { campaignId } = await ctx.params;
  const product = productFrom(req.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  const storeId = await loadOwnedCampaignStoreId(sb, {
    product,
    campaignId,
    ownerUserId: userId,
  });
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const [funding, bc] = await Promise.all([
    loadCanonicalBcFundingDetailForApplication(sb, {
      productKind: product,
      applicationId: campaignId,
    }),
    loadStoreBusinessCashBalance(sb, storeId),
  ]);

  const status = funding?.status ?? "UNFUNDED";
  const amountMinor = funding?.amountMinor ?? null;
  /**
   * SA-11: 환불 금액·시각 — 운영 종료 환불은 남은 기간 비율이라 결제 금액과 다를 수 있다 → 환불 원장 행 금액을 그대로.
   * 환불됐을 때만 1회 조회. 실패하면 null(금액 없이 「환불됨」만).
   */
  let refundAmountMinor: number | null = null;
  let refundedAt: string | null = null;
  if (status === "REFUNDED" && funding?.refundLedgerId) {
    const { data: refundRow } = await sb
      .from(BUSINESS_CASH_LEDGER_TABLE)
      .select("amount_minor, created_at")
      .eq("id", funding.refundLedgerId)
      .maybeSingle();
    const r = refundRow as { amount_minor?: unknown; created_at?: unknown } | null;
    if (r && Number.isFinite(Number(r.amount_minor))) refundAmountMinor = Math.abs(Math.trunc(Number(r.amount_minor)));
    if (r && typeof r.created_at === "string") refundedAt = r.created_at;
  }

  return NextResponse.json({
    ok: true,
    authority: AST_005_BUSINESS_CASH,
    paymentModel: DELIVERY_AD_CANONICAL_PAYMENT_MODEL.id,
    funding: {
      status,
      fundingStatus: status,
      amountPhp: amountMinor == null ? null : Math.trunc(amountMinor / 100),
      amountMinor,
      spendLedgerId: funding?.spendLedgerId ?? null,
      refundLedgerId: funding?.refundLedgerId ?? null,
      fundingId: funding?.fundingId ?? null,
      fundedAt: funding?.fundedAt ?? null,
      refundAmountMinor,
      refundedAt,
      authority: AST_005_BUSINESS_CASH,
    },
    businessCash: {
      // P0-1 — null = 조회 실패 (0 으로 대체하지 않음)
      balanceMinor: bc.balanceMinor,
      balancePhp: bc.balanceMinor == null ? null : Math.trunc(bc.balanceMinor / 100),
      currency: bc.currency,
      authority: AST_005_BUSINESS_CASH,
      storeId,
    },
  });
}

/**
 * POST — Manual fund path DISABLED.
 * Owner submit/resubmit secures canonical Cash.
 */
export async function POST(_req: NextRequest, _ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  return NextResponse.json(
    {
      ok: false,
      error: "DISABLED_FOR_NEW_PRODUCT",
      detail:
        "Delivery Ads payments use Cash at submit. Use Cash top-up or Coin conversion, then submit.",
      authority: AST_005_BUSINESS_CASH,
    },
    { status: 410 }
  );
}
