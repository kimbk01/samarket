import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  createOwnerBusinessCashChargeRequest,
  listOwnerBusinessCashChargeRequests,
} from "@/lib/stores/advertising/delivery-ad-business-cash-charge-request";
import { DELIVERY_AD_CASH_CHARGE_PRESETS_MAJOR } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/delivery-ads/business-cash/charge-requests */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const rows = await listOwnerBusinessCashChargeRequests(sb, userId);
  return NextResponse.json({
    ok: true,
    requests: rows,
    presetsMajor: [...DELIVERY_AD_CASH_CHARGE_PRESETS_MAJOR],
  });
}

/** POST /api/me/delivery-ads/business-cash/charge-requests */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const amountMajor = Number(body.amountMajor ?? body.amount_major);
  const ownerMemo =
    typeof body.ownerMemo === "string"
      ? body.ownerMemo
      : typeof body.owner_memo === "string"
        ? body.owner_memo
        : null;
  const clientRequestId =
    typeof body.clientRequestId === "string"
      ? body.clientRequestId
      : typeof body.client_request_id === "string"
        ? body.client_request_id
        : null;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const result = await createOwnerBusinessCashChargeRequest(sb, {
    ownerUserId: userId,
    amountMajor,
    ownerMemo,
    clientRequestId,
  });
  if (!result.ok) {
    const status =
      result.error === "DISABLED_FOR_NEW_PRODUCT"
        ? 410
        : result.error === "invalid_amount"
          ? 400
          : result.error === "duplicate"
            ? 409
            : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, request: result.row });
}
