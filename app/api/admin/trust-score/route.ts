/**
 * POST /api/admin/trust-score — manual_adjustment trust event (ops provenance).
 * Absolute profiles.trust_score overwrite is FORBIDDEN.
 * Body: { targetUserId, delta: number, reason: string }
 * Optional newScore is rejected.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
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

  /** R2 — 신뢰 점수 조정 = 제재(L2): 화면 확인창과 같은 최소 길이 사유를 받아 감사 `after.reason` 에 남긴다. */
  const reason = parseAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
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
  await appendAdminRouteAudit(sbAny, req, {
    actorId: adminUserId,
    targetType: "member_trust",
    targetId: targetUserId,
    action: "member_trust.manual_adjustment",
    after: {
      adjustment,
      reason,
      adjustmentId,
      trustScore: calc.manner_battery_percent,
      policyVersion: calc.policy_version,
    },
  });
  return NextResponse.json({
    ok: true,
    appliedDelta: adjustment,
    trustScore: calc.manner_battery_percent,
    policyVersion: calc.policy_version,
    adjustmentId,
  });
}
