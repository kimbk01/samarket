import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
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
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

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

    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
