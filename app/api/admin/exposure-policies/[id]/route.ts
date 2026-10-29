import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  insertExposurePolicyLog,
  updateExposureScorePolicy,
} from "@/lib/exposure/exposure-score-policies-db";
import type { ExposureScorePolicy } from "@/lib/types/exposure";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // IA-02/J-6: 정책 쓰기 = 최고관리자 전용 (조회는 활성 관리자 전원 그대로)
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<ExposureScorePolicy>;

  try {
    const policy = await updateExposureScorePolicy(sb, id, body);

    const { data: prof } = await sb
      .from("profiles")
      .select("display_name, nickname, username")
      .eq("id", admin.userId)
      .maybeSingle();
    const nick = labelFromDisplayAndUsername(
      String(prof?.display_name ?? prof?.nickname ?? ""),
      String(prof?.username ?? "")
    );

    await insertExposurePolicyLog(sb, {
      policyId: policy.id,
      surface: policy.surface,
      actionType: "update",
      adminId: admin.userId,
      adminNickname: nick || "admin",
      note: "정책 수정",
    });

    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "exposure_score_policy",
      targetId: policy.id,
      action: "exposure_score_policy.update",
      after: { surface: policy.surface, changedKeys: Object.keys(body) },
    });

    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
