import { NextRequest, NextResponse } from "next/server";
import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isCommunityCommentPubliclyVisible } from "@/lib/community-engine/visibility";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportTargetType = "post" | "comment";

/** 오류는 코드만(`error`=`code`) — 문구는 화면이 `COMMUNITY_REPORT_ERROR_KEYS` 로 고른다 (재감사 2026-11-27) */
function reportError(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code, code }, { status });
}

/**
 * Community 신고 SSOT — public.community_reports
 * post | comment(reply 포함 — 동일 community_comments 행)
 * 신고만으로 auto-hide 하지 않음 (admin review → moderation).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  // 커뮤니티 활동 제한 (§E-6)
  const restricted = await assertCommunityWriteAllowed(auth.userId, "report");
  if (restricted) return restricted;

  const reportRl = await enforceUserReportQuota(auth.userId, "community_feed");
  if (!reportRl.ok) return reportRl.response;

  let body: {
    postId?: string;
    commentId?: string;
    targetType?: string;
    targetId?: string;
    reasonText?: string;
  };
  try {
    body = await req.json();
  } catch {
    return reportError("invalid_json", 400);
  }

  const reasonText = body.reasonText?.trim();
  if (!reasonText) {
    return reportError("report_reason_required", 400);
  }

  const rawType = String(body.targetType ?? "").trim().toLowerCase();
  let targetType: ReportTargetType;
  let targetId: string;

  if (rawType === "comment" || body.commentId?.trim()) {
    targetType = "comment";
    targetId = (body.commentId ?? body.targetId ?? "").trim();
  } else {
    targetType = "post";
    targetId = (body.postId ?? body.targetId ?? "").trim();
  }

  if (!targetId) {
    return reportError("target_required", 400);
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return reportError("server_config", 500);
  }

  if (targetType === "post") {
    const postId = await resolveCanonicalCommunityPostId(targetId);
    if (!postId) {
      return reportError("post_not_found", 404);
    }
    targetId = postId;

    const { data: post } = await sb
      .from("community_posts")
      .select("id, user_id, report_count, is_deleted, status")
      .eq("id", postId)
      .eq("status", "active")
      .maybeSingle();
    const pr = post as {
      id?: string;
      user_id?: string;
      report_count?: number;
      is_deleted?: boolean;
      status?: string;
    } | null;
    if (!pr?.id || pr.is_deleted === true || pr.status === "deleted" || pr.status === "hidden") {
      return reportError("post_not_found", 404);
    }
    if (pr.user_id === auth.userId) {
      return reportError("self_report_post", 400);
    }

    const dup = await findExistingReport(sb, "post", postId, auth.userId);
    if (dup) {
      return reportError("already_reported_post", 409);
    }

    const ins = await insertReport(sb, "post", postId, auth.userId, reasonText);
    if (!ins.ok) return ins.response;

    const { error: countErr } = await sb
      .from("community_posts")
      .update({ report_count: Number(pr.report_count ?? 0) + 1 })
      .eq("id", postId);
    if (countErr) {
      return NextResponse.json({ ok: true, id: ins.id, report_count_warning: true });
    }
    return NextResponse.json({ ok: true, id: ins.id });
  }

  // comment / reply
  const { data: cRow, error: cErr } = await sb
    .from("community_comments")
    .select("id, post_id, user_id, status, is_hidden, is_deleted")
    .eq("id", targetId)
    .maybeSingle();
  if (cErr || !cRow) {
    return reportError("comment_not_found", 404);
  }
  const cr = cRow as {
    id?: string;
    post_id?: string;
    user_id?: string;
    status?: string;
    is_hidden?: boolean;
    is_deleted?: boolean;
  };
  if (!isCommunityCommentPubliclyVisible(cr as never)) {
    return reportError("comment_not_found", 404);
  }
  if (cr.user_id === auth.userId) {
    return reportError("self_report_comment", 400);
  }

  const parentPostId = String(cr.post_id ?? "").trim();
  if (parentPostId) {
    const { data: post } = await sb
      .from("community_posts")
      .select("id, status, is_deleted, is_hidden")
      .eq("id", parentPostId)
      .maybeSingle();
    const pr = post as { id?: string; status?: string; is_deleted?: boolean; is_hidden?: boolean } | null;
    if (!pr?.id || pr.status === "deleted" || pr.status === "hidden" || pr.is_deleted === true) {
      return reportError("comment_not_found", 404);
    }
  }

  const dup = await findExistingReport(sb, "comment", targetId, auth.userId);
  if (dup) {
    return reportError("already_reported_comment", 409);
  }

  const ins = await insertReport(sb, "comment", targetId, auth.userId, reasonText);
  if (!ins.ok) return ins.response;
  return NextResponse.json({ ok: true, id: ins.id, postId: parentPostId || null });
}

async function findExistingReport(
  sb: ReturnType<typeof getSupabaseServer>,
  targetType: ReportTargetType,
  targetId: string,
  userId: string
): Promise<boolean> {
  const { data: existing } = await sb
    .from("community_reports")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(existing?.id);
}

async function insertReport(
  sb: ReturnType<typeof getSupabaseServer>,
  targetType: ReportTargetType,
  targetId: string,
  userId: string,
  reasonText: string
): Promise<{ ok: true; id: string } | { ok: false; response: NextResponse }> {
  const reasonCode = inferReportReasonCode(reasonText) || "etc";
  const reasonPayload = `${reasonCode}: ${reasonText}`.slice(0, 2000);
  const { data: ins, error } = await sb
    .from("community_reports")
    .insert({
      target_type: targetType,
      target_id: targetId,
      user_id: userId,
      reason: reasonPayload,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !ins) {
    const msg = error?.message ?? "";
    if (error?.code === "23505" || /unique/i.test(msg)) {
      return {
        ok: false,
        response: reportError(targetType === "post" ? "already_reported_post" : "already_reported_comment", 409),
      };
    }
    console.error("[community-reports] insert failed", msg || "no_row");
    return {
      ok: false,
      response: reportError("report_failed", 500),
    };
  }
  return { ok: true, id: (ins as { id: string }).id };
}
