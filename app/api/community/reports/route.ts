import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    .select("id, user_id, report_count, is_deleted, status")
    .eq("id", postId)
    .eq("status", "active")
    .maybeSingle();
  const pr = post as { id?: string; user_id?: string; report_count?: number; is_deleted?: boolean; status?: string } | null;
  if (!pr?.id || pr.is_deleted === true || pr.status === "deleted" || pr.status === "hidden") {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  if (pr.user_id === auth.userId) {
    return NextResponse.json({ ok: false, error: "본인 게시글은 신고할 수 없습니다." }, { status: 400 });
  }

  // Production community_reports: reporter=`user_id`, text=`reason` (no reporter_id/reason_type/reason_text).
  const { data: existing } = await sb
    .from("community_reports")
    .select("id")
    .eq("target_type", "post")
    .eq("target_id", postId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (existing?.id) {
    return NextResponse.json({ ok: false, error: "이미 신고한 게시글입니다." }, { status: 409 });
  }

  const reasonCode = inferReportReasonCode(reasonText) || "etc";
  const reasonPayload = `${reasonCode}: ${reasonText}`.slice(0, 2000);

  const { data: ins, error } = await sb
    .from("community_reports")
    .insert({
      target_type: "post",
      target_id: postId,
      user_id: auth.userId,
      reason: reasonPayload,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !ins) {
    const msg = error?.message ?? "";
    if (error?.code === "23505" || msg.includes("community_reports_post_reporter_unique")) {
      return NextResponse.json({ ok: false, error: "이미 신고한 게시글입니다." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg || "신고 접수 실패" }, { status: 500 });
  }

  const { error: countErr } = await sb
    .from("community_posts")
    .update({ report_count: Number(pr.report_count ?? 0) + 1 })
    .eq("id", postId);
  if (countErr) {
    return NextResponse.json({ ok: true, id: (ins as { id: string }).id, report_count_warning: true });
  }

  return NextResponse.json({ ok: true, id: (ins as { id: string }).id });
}
