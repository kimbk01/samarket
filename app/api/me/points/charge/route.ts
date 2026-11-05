import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isMissingPointsTable, normalizeChargeRequest } from "@/lib/points/admin-user-points-shared";
import { POINT_CHARGE_REQUEST_ROW_SELECT } from "@/lib/points/point-query-select";
import {
  computeAppliedRate,
  isMissingPointPlansTable,
  normalizePointPlanRow,
  pickPlanDisplayName,
  POINT_PLAN_ROW_SELECT,
  totalPointsFromPlanRow,
} from "@/lib/points/point-plan-shared";
import type { PointPaymentMethod } from "@/lib/types/point";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChargeBody {
  planId: string;
  paymentMethod: PointPaymentMethod;
  depositorName?: string;
  userMemo?: string;
  /** P1 — 제출 1회당 1개. 같은 키 재요청은 기존 신청을 그대로 돌려준다 (중복 신청 방지). */
  idempotencyKey?: string;
}

/**
 * POST /api/me/points/charge
 * 포인트 충전 신청 생성
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let body: Partial<ChargeBody>;
  try {
    body = (await req.json()) as Partial<ChargeBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { planId, paymentMethod, depositorName, userMemo } = body;
  if (!planId || !paymentMethod) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  /** Apple 결제는 서명 검증 경로(/api/me/apple-iap/verify)에서만 승인 완료 행으로 들어간다 */
  if (paymentMethod === "apple_iap") {
    return NextResponse.json({ ok: false, error: "invalid_payment_method" }, { status: 400 });
  }
  const idempotencyKey = String(body.idempotencyKey ?? "").trim().slice(0, 120);
  if (idempotencyKey.length < 8) {
    return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: planRow, error: planErr } = await sb
    .from("point_plans")
    .select(POINT_PLAN_ROW_SELECT)
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (planErr) {
    if (isMissingPointPlansTable(planErr.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: planErr.message }, { status: 500 });
  }
  if (!planRow) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }

  const plan = planRow as Record<string, unknown>;
  const { data: profile } = await sb.from("profiles").select("nickname").eq("id", userId).maybeSingle();
  const userNickname = String((profile as { nickname?: string } | null)?.nickname ?? userId.slice(0, 8));

  /** 같은 키 재요청 → 기존 신청 (다른 요금제·결제수단이면 키 재사용 오류). */
  const replay = async (): Promise<NextResponse | null> => {
    const { data: existing } = await sb
      .from("point_charge_requests")
      .select(`${POINT_CHARGE_REQUEST_ROW_SELECT}, idempotency_key`)
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (!existing) return null;
    const ex = existing as unknown as Record<string, unknown>;
    if (String(ex.plan_id ?? "") !== String(plan.id) || String(ex.payment_method ?? "") !== paymentMethod) {
      return NextResponse.json({ ok: false, error: "idempotency_key_reused" }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      idempotent: true,
      request: normalizeChargeRequest(ex, userId, userNickname),
      plan: normalizePointPlanRow(plan, "ko"),
    });
  };
  const replayed = await replay();
  if (replayed) return replayed;

  const pointAmount = totalPointsFromPlanRow(plan as { point_amount?: number; bonus_amount?: number });
  const paymentAmount = Math.max(0, Number(plan.payment_amount ?? 0));
  const appliedRate = computeAppliedRate(pointAmount, paymentAmount);
  const rateVersion = Math.max(1, Number(plan.rate_version ?? 1));
  const planName = pickPlanDisplayName(
    { name_ko: String(plan.name_ko ?? ""), name_en: String(plan.name_en ?? "") },
    "ko"
  );
  const requestStatus = paymentMethod === "manual_confirm" ? "waiting_confirm" : "pending";
  const now = new Date().toISOString();

  const { data: row, error } = await sb
    .from("point_charge_requests")
    .insert({
      user_id: userId,
      plan_id: String(plan.id),
      plan_name: planName,
      payment_method: paymentMethod,
      payment_amount: paymentAmount,
      point_amount: pointAmount,
      applied_rate: appliedRate,
      rate_version: rateVersion,
      request_status: requestStatus,
      depositor_name: String(depositorName ?? "").slice(0, 120),
      receipt_image_url: "",
      user_memo: userMemo ? String(userMemo).slice(0, 500) : null,
      requested_at: now,
      updated_at: now,
      idempotency_key: idempotencyKey,
    })
    .select(POINT_CHARGE_REQUEST_ROW_SELECT)
    .maybeSingle();

  if (error) {
    // 동시 재요청이 먼저 같은 키로 넣었으면 그 신청을 돌려준다 (point_charge_requests_user_idempotency_uidx).
    if (String((error as { code?: string }).code ?? "") === "23505") {
      const again = await replay();
      if (again) return again;
    }
    if (isMissingPointsTable(error.message ?? "", "point_charge_requests")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  const request = normalizeChargeRequest(row as Record<string, unknown>, userId, userNickname);
  return NextResponse.json({ ok: true, request, plan: normalizePointPlanRow(plan, "ko") });
}
