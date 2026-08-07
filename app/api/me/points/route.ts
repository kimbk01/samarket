import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { PointChargeRequest } from "@/lib/types/point";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import { POINT_CHARGE_REQUEST_ROW_SELECT } from "@/lib/points/point-query-select";
import type { PointFinancialFilter } from "@/lib/points/point-financial-history";
import {
  loadPointFinancialHistory,
  loadPointFinancialSummary,
  serializePointFinancialPage,
} from "@/lib/points/project-point-financial-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeChargeRequest(row: Record<string, unknown>, userId: string, userNickname: string): PointChargeRequest {
  return {
    id: String(row.id ?? ""),
    userId,
    userNickname,
    planId: String(row.plan_id ?? ""),
    planName: String(row.plan_name ?? ""),
    paymentMethod: (String(row.payment_method ?? "manual_confirm") as PointChargeRequest["paymentMethod"]),
    paymentAmount: Number(row.payment_amount ?? 0),
    pointAmount: Number(row.point_amount ?? 0),
    appliedRate: Number(row.applied_rate ?? 0),
    rateVersion: Math.max(1, Number(row.rate_version ?? 1)),
    requestStatus: (String(row.request_status ?? "pending") as PointChargeRequest["requestStatus"]),
    depositorName: String(row.depositor_name ?? ""),
    receiptImageUrl: String(row.receipt_image_url ?? ""),
    requestedAt: String(row.requested_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    adminMemo: row.admin_memo ? String(row.admin_memo) : undefined,
    userMemo: row.user_memo ? String(row.user_memo) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    processedAt: row.processed_at ? String(row.processed_at) : undefined,
    processedBy: row.processed_by ? String(row.processed_by) : undefined,
  };
}

function parseFilter(raw: string | null): PointFinancialFilter {
  const v = (raw ?? "all").trim().toLowerCase();
  if (v === "credit" || v === "debit") return v;
  return "all";
}

/**
 * GET /api/me/points
 * Balance + Financial History Projection (ledger SSOT) + optional charge-request list.
 * Query: filter=all|credit|debit&limit=&cursor=
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      balance: 0,
      summary: {
        balance: 0,
        ledgerSum: 0,
        cacheMatchesLedger: true,
        totalCredit: 0,
        totalDebit: 0,
        lastOccurredAt: null,
      },
      history: { items: [], hasMore: false, nextCursor: null },
      ledger: [],
      chargeRequests: [],
      source: "defaults",
    });
  }

  const { searchParams } = req.nextUrl;
  const filter = parseFilter(searchParams.get("filter"));
  const limit = Number(searchParams.get("limit") ?? 30);
  const cursor = searchParams.get("cursor");

  const { data: profile } = await sb
    .from("profiles")
    .select("nickname, points")
    .eq("id", userId)
    .maybeSingle();
  const userNickname = String(profile?.nickname ?? "");

  const summary = await loadPointFinancialSummary(sb, userId);
  const historyRes = await loadPointFinancialHistory(sb, {
    userId,
    filter,
    limit,
    cursor,
  });
  if (!historyRes.ok) {
    if (historyRes.code === "table_missing") {
      return NextResponse.json({
        ok: true,
        balance: summary.balance,
        summary,
        history: { items: [], hasMore: false, nextCursor: null },
        ledger: [],
        chargeRequests: [],
        source: "missing_table",
      });
    }
    return NextResponse.json({ ok: false, error: historyRes.error }, { status: 500 });
  }

  let chargeRequests: PointChargeRequest[] = [];
  const chargeRes = await sb
    .from("point_charge_requests")
    .select(POINT_CHARGE_REQUEST_ROW_SELECT)
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(20);
  if (!chargeRes.error) {
    chargeRequests = (chargeRes.data ?? []).map((row) =>
      normalizeChargeRequest(row as Record<string, unknown>, userId, userNickname)
    );
  } else if (!isMissingPointsTable(chargeRes.error.message ?? "", "point_charge_requests")) {
    return NextResponse.json({ ok: false, error: chargeRes.error.message }, { status: 500 });
  }

  const history = serializePointFinancialPage(historyRes.page);

  return NextResponse.json({
    ok: true,
    balance: summary.balance,
    summary,
    history,
    /** @deprecated use history.items — kept for older clients during cutover */
    ledger: history.items.map((item) => ({
      id: item.ledgerId,
      userId,
      userNickname,
      entryType: item.entryType,
      amount: item.signedAmount,
      balanceAfter: item.balanceAfter,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
      description: item.description,
      createdAt: item.occurredAt,
      actorType: item.actorType,
    })),
    chargeRequests,
    source: "supabase",
  });
}
