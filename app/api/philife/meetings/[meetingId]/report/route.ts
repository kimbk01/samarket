import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

const VALID_TARGET_TYPES = new Set([
  "meeting",
  "member",
  "feed_post",
  "feed_comment",
  "chat_message",
  "album_item",
]);

const VALID_REASON_TYPES = new Set([
  "spam",
  "abuse",
  "sexual",
  "illegal",
  "impersonation",
  "off_topic",
  "etc",
]);

/** POST /api/philife/meetings/[meetingId]/report — 신고 제출 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const reportRl = await enforceUserReportQuota(auth.userId, "philife_meeting");
  if (!reportRl.ok) return reportRl.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: {
    target_type?: string;
    target_id?: string;
    reason_type?: string;
    reason_detail?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const targetType = String(body.target_type ?? "").trim();
  const targetId = String(body.target_id ?? "").trim();
  const reasonType = String(body.reason_type ?? "etc").trim();
  const reasonDetail = String(body.reason_detail ?? "").trim().slice(0, 500) || null;

  if (!VALID_TARGET_TYPES.has(targetType) || !targetId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  if (!VALID_REASON_TYPES.has(reasonType)) {
    return NextResponse.json({ ok: false, error: "bad_reason" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  // 중복 신고 방지 (같은 대상을 같은 사람이 이미 신고)
  const { data: existing } = await sb
    .from("meeting_reports")
    .select("id")
    .eq("meeting_id", id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("reporter_user_id", auth.userId)
    .in("status", ["pending", "reviewing"])
    .maybeSingle();

  if ((existing as { id?: string } | null)?.id) {
    return NextResponse.json({ ok: false, error: "already_reported" }, { status: 409 });
  }

  const { error } = await sb.from("meeting_reports").insert({
    meeting_id: id,
    target_type: targetType,
    target_id: targetId,
    reporter_user_id: auth.userId,
    reason_type: reasonType,
    reason_detail: reasonDetail,
    status: "pending",
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
