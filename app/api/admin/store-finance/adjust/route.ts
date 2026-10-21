import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { adminAdjustStoreBalance } from "@/lib/stores/advertising/canonical-business-cash-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FIN-08 — super_admin Cash / Coin correction (new incidents only; D-5: past data is never corrected).
 * Money + audit are written by the DB RPCs (`admin_adjust_business_cash` / `admin_adjust_store_coin`):
 * super_admin re-check, reason + evidence required, ledger ADMIN_ADJUST + audit_logs in one transaction,
 * no negative balance, idempotency key. This route only validates input shape.
 */
type PostBody = {
  storeId?: string;
  asset?: string;
  direction?: string;
  /** Cash: PHP minor units · Coin: whole Coin. */
  amount?: number;
  reason?: string;
  evidenceRef?: string;
  idempotencyKey?: string;
  ledgerOnly?: boolean;
};

const MAX_CASH_MINOR = 100_000_000_00;
const MAX_COIN = 2_000_000_000;

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const storeId = String(body.storeId ?? "").trim();
  if (!isUuidLikeString(storeId)) {
    return NextResponse.json({ ok: false, error: "invalid_store_id" }, { status: 400 });
  }
  const asset = body.asset === "cash" || body.asset === "coin" ? body.asset : null;
  const direction = body.direction === "credit" || body.direction === "debit" ? body.direction : null;
  if (!asset || !direction) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const amount = Math.trunc(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > (asset === "cash" ? MAX_CASH_MINOR : MAX_COIN)) {
    return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
  }
  const reason = parseAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }
  const evidenceRef = String(body.evidenceRef ?? "").trim().slice(0, 500);
  if (evidenceRef.length < 3) {
    return NextResponse.json({ ok: false, error: "evidence_required" }, { status: 400 });
  }
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });
  }

  const result = await adminAdjustStoreBalance(gate.sb, {
    adminUserId: gate.actor.userId,
    storeId,
    asset,
    direction,
    amount,
    reason,
    evidenceRef,
    idempotencyKey,
    ledgerOnly: body.ledgerOnly === true,
  });
  if (!result.ok) {
    const status =
      result.error === "rpc_failed"
        ? 500
        : result.error === "super_admin_required" || result.error === "forbidden"
          ? 403
          : result.error === "store_not_found"
            ? 404
            : result.error === "idempotency_key_reused" || result.error === "insufficient_balance"
              ? 409
              : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  // Request-context audit (ip / user agent). The money-authoritative audit row is written by the RPC itself.
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: asset === "cash" ? "business_cash_account" : "store_coin_account",
    targetId: storeId,
    action: asset === "cash" ? "business_cash.admin_adjust" : "store_coin.admin_adjust",
    after: {
      idempotent: result.idempotent,
      direction,
      amount,
      ledgerOnly: body.ledgerOnly === true,
      reason,
      evidenceRef,
      ledgerId: result.ledgerId,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
    },
  });
  return NextResponse.json(result);
}
