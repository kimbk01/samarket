import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getMemberBenefitPolicyByIdFromDb,
  insertMemberBenefitLog,
  listMemberBenefitLogs,
  updateMemberBenefitPolicy,
} from "@/lib/member-benefits/member-benefit-policies-db";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { id } = await ctx.params;
  try {
    const [policy, logs] = await Promise.all([
      getMemberBenefitPolicyByIdFromDb(sb, id),
      listMemberBenefitLogs(sb, id, 100),
    ]);
    if (!policy) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, policy, logs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // IA-02/J-6: 회원 혜택 정책 쓰기 = 회원 키 `users` (조회는 활성 관리자 전원 그대로)
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<MemberBenefitPolicy>;

  try {
    const policy = await updateMemberBenefitPolicy(sb, id, body);

    const { data: prof } = await sb
      .from("profiles")
      .select("display_name, nickname, username")
      .eq("id", admin.userId)
      .maybeSingle();
    const nick = labelFromDisplayAndUsername(
      String(prof?.display_name ?? prof?.nickname ?? ""),
      String(prof?.username ?? "")
    );

    await insertMemberBenefitLog(sb, {
      userId: "",
      userNickname: "",
      memberType: policy.memberType,
      policyId: policy.id,
      actionType: body.isActive === false ? "revoke" : "update",
      note: body.isActive === false ? "정책 비활성화" : "정책 수정",
      actorType: "admin",
      actorId: admin.userId,
      actorNickname: nick || "admin",
    });

    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "member_benefit_policy",
      targetId: policy.id,
      action: body.isActive === false ? "member_benefit_policy.deactivate" : "member_benefit_policy.update",
      after: { memberType: policy.memberType, changedKeys: Object.keys(body) },
    });

    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
