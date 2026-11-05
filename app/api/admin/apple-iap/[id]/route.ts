import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appleIapIsUuid } from "@/lib/apple-iap/apple-iap-contract";
import { adminActorLabel, loadAdminActorNames } from "@/lib/admin/load-admin-actor-names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const DETAIL_SELECT =
  "id, kind, user_id, store_id, product_id, client_key, plan_name, point_amount, payment_amount, cash_amount_minor, status, review_reason, reserve_expires_at, transaction_id, original_transaction_id, environment, bundle_id, purchase_date, price_milli, currency, storefront, revoked_at, verified_at, verified_via, credited_at, credited_by, point_charge_request_id, cash_charge_request_id, credit_ledger_id, refund_status, refund_notified_at, refund_reason, refund_decided_by, refund_decided_at, refund_decision_note, refund_ledger_id, refund_reversal_ledger_id, created_at, updated_at";

/** GET /api/admin/apple-iap/[id] — 거래 상세 · 현재 잔액 · Apple 알림 이력 */
export async function GET(_req: Request, ctx: Ctx) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!appleIapIsUuid(id)) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

  const { data: row, error } = await guard.sb
    .from("apple_iap_transactions")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const r = row as Record<string, unknown>;

  let balance: number | null = null;
  if (r.kind === "point") {
    const sum = await guard.sb.rpc("sum_user_point_ledger", { p_user_id: r.user_id });
    if (!sum.error && sum.data != null) balance = Math.trunc(Number(sum.data) || 0);
  } else if (r.store_id) {
    const acct = await guard.sb.from("business_cash_accounts").select("balance_minor").eq("store_id", r.store_id).maybeSingle();
    if (!acct.error) balance = Number((acct.data as { balance_minor?: number } | null)?.balance_minor ?? 0);
  }

  const notifications = r.transaction_id
    ? await guard.sb
        .from("apple_iap_notifications")
        .select("notification_uuid, notification_type, subtype, environment, signed_date, result, received_at")
        .eq("transaction_id", r.transaction_id)
        .order("received_at", { ascending: false })
        .limit(50)
    : { data: [] };

  const names = await loadAdminActorNames(guard.sb, [r.credited_by as string | null, r.refund_decided_by as string | null]);
  const actors = {
    creditedBy: adminActorLabel(names, r.credited_by as string | null),
    refundDecidedBy: adminActorLabel(names, r.refund_decided_by as string | null),
  };

  return NextResponse.json({ ok: true, row: r, balance, notifications: notifications.data ?? [], actors });
}
