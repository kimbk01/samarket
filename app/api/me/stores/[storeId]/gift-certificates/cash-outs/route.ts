import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  giftCertificateCashOutCancel,
  giftCertificateCashOutRequest,
} from "@/lib/gift-certificate/gift-certificate-rpc";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import {
  validateGiftCashOutAmount,
  validateGiftCashOutDestination,
} from "@/lib/gift-certificate/gift-cash-out-ops";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapCashOutRow(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    storeId: String(raw.store_id),
    ownerUserId: String(raw.owner_user_id),
    amount: Math.trunc(Number(raw.amount) || 0),
    status: String(raw.status ?? ""),
    destinationType: String(raw.destination_type ?? ""),
    accountNumber: String(raw.account_number ?? ""),
    accountName: String(raw.account_name ?? ""),
    bankName: raw.bank_name == null ? null : String(raw.bank_name),
    createdAt: String(raw.created_at ?? ""),
    approvedAt: raw.approved_at == null ? null : String(raw.approved_at),
    paidAt: raw.paid_at == null ? null : String(raw.paid_at),
    rejectedAt: raw.rejected_at == null ? null : String(raw.rejected_at),
    payoutMethod: raw.payout_method == null ? null : String(raw.payout_method),
    payoutReference: raw.payout_reference == null ? null : String(raw.payout_reference),
  };
}

/** GET+POST /api/me/stores/[storeId]/gift-certificates/cash-outs */
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
    .from(GIFT_TABLES.cashOutRequests)
    .select(
      "id, store_id, owner_user_id, amount, status, destination_type, account_number, account_name, bank_name, approved_at, paid_at, rejected_at, payout_method, payout_reference, created_at"
    )
    .eq("store_id", sid)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const cashOuts = (data ?? []).map((r) => mapCashOutRow(r as Record<string, unknown>));
  const pendingAmount = cashOuts
    .filter((r) => r.status.toUpperCase() === "REQUESTED")
    .reduce((s, r) => s + r.amount, 0);
  return NextResponse.json({ ok: true, cashOuts, pendingAmount });
}

export async function POST(
  req: NextRequest,
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "request").trim().toLowerCase();
  if (action === "cancel") {
    const requestId = String(body.requestId ?? body.request_id ?? "").trim();
    if (!requestId) {
      return NextResponse.json({ ok: false, error: "request_id_required" }, { status: 400 });
    }
    const result = await giftCertificateCashOutCancel(sb, {
      ownerUserId: userId,
      requestId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, ...(result.data ?? {}) },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, ...result.data });
  }

  const amount = Math.trunc(Number(body.amount));
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  const dest = validateGiftCashOutDestination(body);
  if (!dest.ok) {
    return NextResponse.json({ ok: false, error: dest.error }, { status: 400 });
  }
  if (!idempotencyKey) {
    return NextResponse.json({ ok: false, error: "idempotencyKey_required" }, { status: 400 });
  }

  const { data: availRaw } = await sb.rpc("gift_certificate_store_revenue_available", {
    p_store_id: sid,
  });
  const available = typeof availRaw === "number" ? Math.trunc(availRaw) : Math.trunc(Number(availRaw) || 0);
  const validated = validateGiftCashOutAmount({ amount, availableRevenue: available });
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error, available }, { status: 400 });
  }

  const result = await giftCertificateCashOutRequest(sb, {
    ownerUserId: userId,
    storeId: sid,
    amount: validated.amount,
    destinationType: dest.destination.destinationType,
    accountNumber: dest.destination.accountNumber,
    accountName: dest.destination.accountName,
    bankName: dest.destination.destinationType === "bank" ? dest.destination.bankName : null,
    idempotencyKey,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, ...result.data }, { status: 201 });
}
