import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { loadOwnerPointDepositContext } from "@/lib/stores/load-owner-point-deposit-context";
import { canSubmitPointCharge } from "@/lib/stores/owner-point-deposit-context";
import { computeStorePointChargePaymentAmount } from "@/lib/stores/store-point-charge-amount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostBody = {
  point_amount?: number;
  depositor_name?: string;
};

function isMissingTable(msg: string): boolean {
  return /store_point_charge_requests/i.test(msg) && /does not exist/i.test(msg);
}

/** POST /api/me/stores/[storeId]/point-charges — 매장 포인트 충전 신청 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const pointAmount = Math.max(0, Math.floor(Number(body.point_amount) || 0));
  if (pointAmount < 1) {
    return NextResponse.json({ ok: false, error: "point_amount_required" }, { status: 400 });
  }

  const depositorName = String(body.depositor_name ?? "").trim().slice(0, 120);
  if (!depositorName) {
    return NextResponse.json({ ok: false, error: "depositor_name_required" }, { status: 400 });
  }

  const paymentAmount = computeStorePointChargePaymentAmount(pointAmount);

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const depositCtx = await loadOwnerPointDepositContext(sb, sid);
  const chargeGate = canSubmitPointCharge({ pendingCharge: depositCtx.pendingCharge });
  if (!chargeGate.ok) {
    return NextResponse.json({ ok: false, error: chargeGate.error }, { status: 409 });
  }

  const insertPayload: Record<string, unknown> = {
    store_id: sid,
    owner_user_id: userId,
    payment_method: "manual_confirm",
    payment_amount: paymentAmount,
    point_amount: pointAmount,
    request_status: "pending",
    depositor_name: depositorName,
    bank_name: "",
    receipt_image_url: "",
    user_memo: null,
  };

  const { data, error } = await sb
    .from("store_point_charge_requests")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "store_point_charge_table_missing" }, { status: 503 });
    }
    console.error("[POST store point-charges]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}

/** GET /api/me/stores/[storeId]/point-charges */
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

  const { data, error } = await sb
    .from("store_point_charge_requests")
    .select(
      "id, store_id, owner_user_id, payment_method, payment_amount, point_amount, request_status, depositor_name, bank_name, receipt_image_url, user_memo, admin_memo, inquiry_id, requested_at, updated_at, approved_at"
    )
    .eq("store_id", sid)
    .order("requested_at", { ascending: false })
    .limit(30);

  if (error) {
    if (isMissingTable(error.message ?? "")) {
      return NextResponse.json({ ok: true, chargeRequests: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chargeRequests: data ?? [] });
}
