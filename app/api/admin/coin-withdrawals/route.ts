import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  memberOpsListRange,
  parseMemberOpsListPageIfRequested,
} from "@/lib/admin/member-ops-list/member-ops-list-page";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import {
  COIN_WITHDRAWAL_REQUESTS_TABLE,
  markCoinWithdrawalPaid,
  rejectCoinWithdrawal,
} from "@/lib/currency/coin-withdrawal-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COIN_WITHDRAWAL_LIST_SELECT =
  "id, store_id, owner_user_id, amount, status, destination_type, account_number, account_name, bank_name, source_kind, created_at, paid_at, paid_by, rejected_by, rejected_at, approved_by";

/**
 * GET /api/admin/coin-withdrawals
 * - `limit`/`offset` 이 있으면 (R7 목록 표준): limit 20/50/100 서버 페이지 + `total`(count exact).
 *   `focusId` 가 있으면 그 요청 행을 `focus` 로 함께 돌려준다 (지원 딥링크 — 다른 쪽에 있어도 맨 위에 표시).
 * - 없으면 기존 응답 그대로(최근 100건) — 다른 호출자 `AdminFinanceOpsQueue`(?status=REQUESTED) 호환.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const status = String(sp.get("status") ?? "REQUESTED").trim();
  const page = parseMemberOpsListPageIfRequested(sp);
  if (page) {
    const [from, to] = memberOpsListRange(page);
    let q = gate.sb
      .from(COIN_WITHDRAWAL_REQUESTS_TABLE)
      .select(COIN_WITHDRAWAL_LIST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (status && status !== "all") q = q.eq("status", status);
    const focusId = String(sp.get("focusId") ?? "").trim();
    const [listRes, focusRes] = await Promise.all([
      q,
      focusId
        ? gate.sb.from(COIN_WITHDRAWAL_REQUESTS_TABLE).select(COIN_WITHDRAWAL_LIST_SELECT).eq("id", focusId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (listRes.error) return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    const requests = listRes.data ?? [];
    return NextResponse.json({
      ok: true,
      requests,
      total: listRes.count ?? requests.length,
      limit: page.limit,
      offset: page.offset,
      focus: focusRes.error ? null : (focusRes.data ?? null),
    });
  }

  let q = gate.sb
    .from(COIN_WITHDRAWAL_REQUESTS_TABLE)
    .select(COIN_WITHDRAWAL_LIST_SELECT)
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

  /** R2 — 반려(reject)·지급 완료(payout) 모두 L2: 확인창 사유 필수 → 감사 `after.reason`. */
  const reason = parseAdminReason(body.reason);

  if (action === "reject") {
    if (!reason) return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
    const result = await rejectCoinWithdrawal(gate.sb, {
      adminUserId: gate.actor.userId,
      requestId,
      reason,
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "coin_withdrawal_request",
      targetId: requestId,
      action: "coin_withdrawal.reject",
      after: { reason },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_paid") {
    const payoutMethod = String(body.payoutMethod ?? body.payout_method ?? "").trim();
    const payoutReference = String(body.payoutReference ?? body.payout_reference ?? "").trim();
    if (!payoutReference || !payoutMethod) {
      return NextResponse.json({ ok: false, error: "payout_reference_required" }, { status: 400 });
    }
    if (!reason) return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
    const result = await markCoinWithdrawalPaid(gate.sb, {
      adminUserId: gate.actor.userId,
      requestId,
      payoutMethod,
      payoutReference,
      payoutNote: String(body.payoutNote ?? body.payout_note ?? ""),
    });
    if (!result.ok) {
      /* RPC: payout_reference_required (blank ref) 등 — 코드 그대로 400 */
      return NextResponse.json({ ok: false, error: result.error ?? "mark_paid_failed" }, { status: 400 });
    }
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "coin_withdrawal_request",
      targetId: requestId,
      action: "coin_withdrawal.mark_paid",
      after: {
        payoutMethod,
        payoutReference,
        payoutNote: String(body.payoutNote ?? body.payout_note ?? "").slice(0, 500),
        reason,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
