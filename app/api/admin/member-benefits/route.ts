import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getMemberBenefitSummariesFromDb,
  insertMemberBenefitLog,
  insertMemberBenefitPolicy,
  listMemberBenefitPolicies,
} from "@/lib/member-benefits/member-benefit-policies-db";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, policies: [], summaries: [] });
  }

  try {
    const [policies, summaries] = await Promise.all([
      listMemberBenefitPolicies(sb),
      getMemberBenefitSummariesFromDb(sb),
    ]);
    return NextResponse.json({ ok: true, policies, summaries });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<MemberBenefitPolicy>;

  try {
    const policy = await insertMemberBenefitPolicy(sb, {
      memberType: body.memberType ?? "normal",
      title: body.title ?? "",
      description: body.description ?? "",
      isActive: body.isActive ?? true,
      profileFrameType: body.profileFrameType ?? "dark",
      badgeLabel: body.badgeLabel ?? "",
      homePriorityBoost: body.homePriorityBoost ?? 0,
      searchPriorityBoost: body.searchPriorityBoost ?? 0,
      shopFeaturedPriorityBoost: body.shopFeaturedPriorityBoost ?? 0,
      pointRewardBonusRate: body.pointRewardBonusRate ?? 0,
      adDiscountRate: body.adDiscountRate ?? 0,
      productLimitPerMonth: body.productLimitPerMonth,
      canOpenBusinessProfile: body.canOpenBusinessProfile ?? true,
      canAccessPremiumPromotion: body.canAccessPremiumPromotion ?? false,
      adminMemo: body.adminMemo,
    });

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
      actionType: "update",
      note: "정책 생성",
      actorType: "admin",
      actorId: admin.userId,
      actorNickname: nick || "admin",
    });

    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
