import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { loadStorePointSummary } from "@/lib/stores/load-store-point-summary";
import { loadOwnerPointDepositContext } from "@/lib/stores/load-owner-point-deposit-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEDGER_SELECT =
  "id, store_id, order_id, entry_type, amount, balance_after, description, created_at";

function isMissingTable(msg: string, table: string): boolean {
  return msg.includes(table) && /does not exist/i.test(msg);
}

/** GET /api/me/stores/[storeId]/points — 매장 포인트 잔액·원장·충전 신청 */
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

  const { data: storeMeta } = await sb
    .from("stores")
    .select("store_category_id")
    .eq("id", sid)
    .maybeSingle();
  const storeCategoryId =
    storeMeta && typeof storeMeta.store_category_id === "string"
      ? storeMeta.store_category_id
      : null;

  const summary = await loadStorePointSummary(sb, { storeId: sid, storeCategoryId });
  const depositContext = await loadOwnerPointDepositContext(sb, sid);

  let ledger: unknown[] = [];
  const ledgerRes = await sb
    .from("store_point_ledger")
    .select(LEDGER_SELECT)
    .eq("store_id", sid)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!ledgerRes.error) {
    ledger = (ledgerRes.data ?? []).map((r) => ({
      id: r.id,
      storeId: r.store_id,
      orderId: r.order_id,
      entryType: r.entry_type,
      amount: r.amount,
      balanceAfter: r.balance_after,
      description: r.description,
      createdAt: r.created_at,
    }));
  } else if (!isMissingTable(ledgerRes.error.message ?? "", "store_point_ledger")) {
    return NextResponse.json({ ok: false, error: ledgerRes.error.message }, { status: 500 });
  }

  let chargeRequests: unknown[] = [];
  const chargeRes = await sb
    .from("store_point_charge_requests")
    .select(
      "id, store_id, owner_user_id, payment_method, payment_amount, point_amount, request_status, depositor_name, bank_name, receipt_image_url, user_memo, admin_memo, inquiry_id, requested_at, updated_at, approved_at"
    )
    .eq("store_id", sid)
    .order("requested_at", { ascending: false })
    .limit(20);
  if (!chargeRes.error) {
    chargeRequests = (chargeRes.data ?? []).map((r) => ({
      id: r.id,
      storeId: r.store_id,
      ownerUserId: r.owner_user_id,
      paymentMethod: r.payment_method,
      paymentAmount: r.payment_amount,
      pointAmount: r.point_amount,
      requestStatus: r.request_status,
      depositorName: r.depositor_name,
      bankName: r.bank_name,
      receiptImageUrl: r.receipt_image_url,
      userMemo: r.user_memo,
      adminMemo: r.admin_memo,
      inquiryId: r.inquiry_id ?? null,
      requestedAt: r.requested_at,
      updatedAt: r.updated_at,
      approvedAt: r.approved_at,
    }));
  } else if (!isMissingTable(chargeRes.error.message ?? "", "store_point_charge_requests")) {
    return NextResponse.json({ ok: false, error: chargeRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true as const,
    summary: summary ?? {
      pointBalance: 0,
      pointCommerceBlocked: false,
      pointBlockReason: null,
      estimatedFeePerOrder: 10,
      estimatedAcceptCount: 0,
    },
    depositStep: depositContext.chargeUiState,
    chargeUiState: depositContext.chargeUiState,
    activeAccountInquiry: depositContext.activeAccountInquiry,
    latestAccountAnswer: depositContext.latestAccountAnswer,
    pendingCharge: depositContext.pendingCharge,
    canSubmitCharge: depositContext.canSubmitCharge,
    ledger,
    chargeRequests,
  });
}
