/**
 * POST /api/admin/trust-score — manual_adjustment trust event (ops provenance).
 * Absolute profiles.trust_score overwrite is FORBIDDEN.
 * Body: { targetUserId, delta: number, reason: string }
 * Optional newScore is rejected.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { recordTrustEvent, recomputeMemberTrustSnapshot } from "@/lib/trust/trust-event-ledger";
import { buildManualAdjustmentIdempotencyKey } from "@/lib/trust/manner-battery-policy-v1";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const adminUserId = admin.userId;

  let body: {
    targetUserId?: string;
    newScore?: number;
    delta?: number;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 필요" }, { status: 400 });
  }

  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "targetUserId 필요" }, { status: 400 });
  }

  if (body.newScore != null) {
    return NextResponse.json(
      {
        ok: false,
        error: "absolute newScore overwrite is forbidden — use delta with reason (manual_adjustment)",
      },
      { status: 400 }
    );
  }

  if (body.delta == null || !Number.isFinite(Number(body.delta))) {
    return NextResponse.json({ ok: false, error: "delta 필요" }, { status: 400 });
  }
  const adjustment = Math.round(Number(body.delta) * 100) / 100;
  if (adjustment === 0) {
    return NextResponse.json({ ok: true, message: "변경 없음", appliedDelta: 0 });
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : "";
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason 필요" }, { status: 400 });
  }

  const sb = getTradeServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서비스 롤 설정 필요" }, { status: 500 });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const adjustmentId = randomUUID();

  const result = await recordTrustEvent(sbAny, {
    memberId: targetUserId,
    domain: "platform",
    eventType: "manual_adjustment",
    sourceType: "admin_manual_adjustment",
    sourceId: adjustmentId,
    idempotencyKey: buildManualAdjustmentIdempotencyKey(adjustmentId, targetUserId),
    direction: "ops",
    severity: "none",
    metadata: {
      adjustment,
      reason,
      operator_id: adminUserId,
      adjustment_id: adjustmentId,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  const calc = await recomputeMemberTrustSnapshot(sbAny, targetUserId);
  return NextResponse.json({
    ok: true,
    appliedDelta: adjustment,
    trustScore: calc.manner_battery_percent,
    policyVersion: calc.policy_version,
    adjustmentId,
  });
}
