import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { PointChargeRequest, PointLedgerEntry } from "@/lib/types/point";
import {
  POINT_CHARGE_REQUEST_ROW_SELECT,
  POINT_LEDGER_ROW_SELECT,
} from "@/lib/points/point-query-select";

function isMissingTable(message: string, table: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes(table) && lowered.includes("does not exist");
}

function normalizeLedgerRow(row: Record<string, unknown>, userId: string, userNickname: string): PointLedgerEntry {
  return {
    id: String(row.id ?? ""),
    userId,
    userNickname,
    entryType: (String(row.entry_type ?? "admin_adjust") as PointLedgerEntry["entryType"]),
    amount: Number(row.amount ?? 0),
    balanceAfter: Number(row.balance_after ?? 0),
    relatedType: (String(row.related_type ?? "admin_manual") as PointLedgerEntry["relatedType"]),
    relatedId: String(row.related_id ?? ""),
    description: String(row.description ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    actorType: (String(row.actor_type ?? "system") as PointLedgerEntry["actorType"]),
    earnedAt: row.earned_at ? String(row.earned_at) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    expiredAmount: row.expired_amount == null ? undefined : Number(row.expired_amount),
    isExpired: row.expires_at ? new Date(String(row.expires_at)).getTime() < Date.now() : undefined,
  };
}

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
    requestStatus: (String(row.request_status ?? "pending") as PointChargeRequest["requestStatus"]),
    depositorName: String(row.depositor_name ?? ""),
    receiptImageUrl: String(row.receipt_image_url ?? ""),
    requestedAt: String(row.requested_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    adminMemo: row.admin_memo ? String(row.admin_memo) : undefined,
    userMemo: row.user_memo ? String(row.user_memo) : undefined,
  };
}

/**
 * GET /api/me/points
 * 로그인 사용자의 포인트 잔액·원장·충전 신청 내역을 반환한다.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      balance: 0,
      ledger: [],
      chargeRequests: [],
      source: "defaults",
    });
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("nickname, points")
    .eq("id", userId)
    .maybeSingle();
  const userNickname = String(profile?.nickname ?? "");
  const balance = Math.max(0, Number(profile?.points ?? 0));

  let ledger: PointLedgerEntry[] = [];
  const ledgerRes = await sb
    .from("point_ledger")
    .select(POINT_LEDGER_ROW_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!ledgerRes.error) {
    ledger = (ledgerRes.data ?? []).map((row) =>
      normalizeLedgerRow(row as Record<string, unknown>, userId, userNickname)
    );
  } else if (!isMissingTable(ledgerRes.error.message ?? "", "point_ledger")) {
    return NextResponse.json({ ok: false, error: ledgerRes.error.message }, { status: 500 });
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
  } else if (!isMissingTable(chargeRes.error.message ?? "", "point_charge_requests")) {
    return NextResponse.json({ ok: false, error: chargeRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    balance,
    ledger,
    chargeRequests,
    source: "supabase",
  });
}
