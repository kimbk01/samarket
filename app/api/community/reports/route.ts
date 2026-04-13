import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";

/**
 * 동네생활 피드 전용 신고 — public.community_reports
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const reportRl = await enforceUserReportQuota(auth.userId, "community_feed");
  if (!reportRl.ok) return reportRl.response;

  let body: { postId?: string; reasonText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 필요" }, { status: 400 });
  }

  const rawPostId = body.postId?.trim();
  const reasonText = body.reasonText?.trim();
  if (!rawPostId) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }
  if (!reasonText) {
    return NextResponse.json({ ok: false, error: "신고 사유를 입력해 주세요." }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 오류" }, { status: 500 });
  }

  const postId = await resolveCanonicalCommunityPostId(rawPostId);
  if (!postId) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: post } = await sb
    .from("community_posts")
    .select("id, report_count, is_deleted, status")
    .eq("id", postId)
    .eq("status", "active")
    .maybeSingle();
  const pr = post as { id?: string; report_count?: number; is_deleted?: boolean; status?: string } | null;
  if (!pr?.id || pr.is_deleted === true || pr.status === "deleted" || pr.status === "hidden") {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const reason_type = inferReportReasonCode(reasonText) || "etc";

  const { data: ins, error } = await sb
    .from("community_reports")
    .insert({
      target_type: "post",
      target_id: postId,
      reporter_id: auth.userId,
      reason_type,
      reason_text: reasonText.slice(0, 2000),
      status: "open",
    })
    .select("id")
    .single();

  if (error || !ins) {
    return NextResponse.json({ ok: false, error: error?.message ?? "신고 접수 실패" }, { status: 500 });
  }

  const prev = Number(pr.report_count ?? 0);
  await sb.from("community_posts").update({ report_count: prev + 1 }).eq("id", postId);

  return NextResponse.json({ ok: true, id: (ins as { id: string }).id });
}
