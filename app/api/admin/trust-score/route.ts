/**
 * POST /api/admin/trust-score — 신뢰 점수 강제 조정 (서비스 롤 + 관리자 세션)
 * Body: { targetUserId, newScore?: number, delta?: number, reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { applyTrustScoreDelta } from "@/lib/trust/trust-score-apply";
import { clampTrustScore, TRUST_SCORE_DEFAULT } from "@/lib/trust/trust-score-core";

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

  const sb = getTradeServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서비스 롤 설정 필요" }, { status: 500 });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  let baseDelta = 0;
  if (body.newScore != null && Number.isFinite(Number(body.newScore))) {
    const target = clampTrustScore(Number(body.newScore));
    let current = TRUST_SCORE_DEFAULT;
    try {
      const { data: prof } = await sbAny.from("profiles").select("trust_score").eq("id", targetUserId).maybeSingle();
      const ts = (prof as { trust_score?: number } | null)?.trust_score;
      if (ts != null && Number.isFinite(Number(ts))) current = clampTrustScore(Number(ts));
    } catch {
      /* ignore */
    }
    baseDelta = Math.round((target - current) * 100) / 100;
  } else if (body.delta != null && Number.isFinite(Number(body.delta))) {
    baseDelta = Math.round(Number(body.delta) * 100) / 100;
  } else {
    return NextResponse.json({ ok: false, error: "newScore 또는 delta 필요" }, { status: 400 });
  }

  if (baseDelta === 0) {
    return NextResponse.json({ ok: true, message: "변경 없음", appliedDelta: 0 });
  }

  try {
    await applyTrustScoreDelta(sbAny, {
      userId: targetUserId,
      sourceType: "admin_adjust",
      sourceId: null,
      baseDelta,
      recentPositiveBoost: false,
      skipDailyCap: true,
      reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : "admin_adjust",
      metadata: { admin_user_id: adminUserId },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? "반영 실패" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, appliedDelta: baseDelta });
}
