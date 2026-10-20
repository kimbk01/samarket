import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapMemberBenefitPolicyRow } from "@/lib/member-benefits/member-benefit-policies-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/benefits — 내 회원 구분(profiles.member_type)에 적용되는 활성 혜택 정책만 (D19).
 * 정책 SSOT = member_benefit_policies (관리자 회원 혜택 화면이 관리). 다른 회원 구분 정책·관리자 메모는 내려주지 않는다.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "benefits_service_unavailable" }, { status: 503 });
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("member_type")
    .eq("id", auth.userId)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ ok: false, error: "benefits_load_failed" }, { status: 500 });
  }
  const memberType = String((profile as { member_type?: string } | null)?.member_type ?? "normal").trim() || "normal";

  const { data, error } = await sb
    .from("member_benefit_policies")
    .select("*")
    .eq("member_type", memberType)
    .eq("is_active", true);
  if (error) {
    return NextResponse.json({ ok: false, error: "benefits_load_failed" }, { status: 500 });
  }

  const policies = (data ?? []).map((row) => {
    const { adminMemo: _adminMemo, ...policy } = mapMemberBenefitPolicyRow(row as Record<string, unknown>);
    return policy;
  });
  return NextResponse.json({ ok: true, memberType, policies });
}
