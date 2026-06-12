import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
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
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

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

    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
