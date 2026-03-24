import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";

/**
 * 동네생활 피드 전용 신고 — public.community_reports
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

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
    .select("id, report_count")
    .eq("id", postId)
    .eq("is_hidden", false)
    .maybeSingle();
  if (!post) {
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

  const prev = Number((post as { report_count?: number }).report_count ?? 0);
  await sb.from("community_posts").update({ report_count: prev + 1 }).eq("id", postId);

  return NextResponse.json({ ok: true, id: (ins as { id: string }).id });
}
