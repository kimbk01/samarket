import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  COIN_WITHDRAWAL_REQUESTS_TABLE,
  markCoinWithdrawalPaid,
  rejectCoinWithdrawal,
} from "@/lib/currency/coin-withdrawal-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/coin-withdrawals */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const status = String(req.nextUrl.searchParams.get("status") ?? "REQUESTED").trim();
  let q = gate.sb
    .from(COIN_WITHDRAWAL_REQUESTS_TABLE)
    .select(
      "id, store_id, owner_user_id, amount, status, destination_type, account_number, account_name, bank_name, source_kind, created_at, paid_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

/** POST /api/admin/coin-withdrawals — reject | mark_paid */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim().toLowerCase();
  const requestId = String(body.requestId ?? body.request_id ?? "").trim();
  if (!requestId) return NextResponse.json({ ok: false, error: "missing_request_id" }, { status: 400 });

  if (action === "reject") {
    const result = await rejectCoinWithdrawal(gate.sb, {
      adminUserId: gate.actor.userId,
      requestId,
      reason: String(body.reason ?? ""),
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_paid") {
    const result = await markCoinWithdrawalPaid(gate.sb, {
      adminUserId: gate.actor.userId,
      requestId,
      payoutMethod: String(body.payoutMethod ?? body.payout_method ?? ""),
      payoutReference: String(body.payoutReference ?? body.payout_reference ?? ""),
      payoutNote: String(body.payoutNote ?? body.payout_note ?? ""),
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
