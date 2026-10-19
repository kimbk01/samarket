import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { notifyCommunityMeetingDecision } from "@/lib/notifications/notify-community-moderation";
import { applyCommunityPointReclaimOnPostAdminRemove } from "@/lib/points/community-point-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MeetingRow = {
  id: string;
  post_id: string | null;
  host_user_id: string | null;
  status: string | null;
  platform_approval_status: string | null;
  max_members: number | null;
  is_closed: boolean | null;
};

const CLOSE_STATUSES = new Set(["closed", "ended", "cancelled"]);

/**
 * PATCH — 모임 상태/승인/노출 (관리자)
 * body: { status?, platformApprovalStatus?, maxMembers?, isClosed?, postStatus?, postHidden?,
 *         reason?, expectedStatus?, expectedPlatformApprovalStatus?, expectedPostStatus? }
 * - 반려(platformApprovalStatus=rejected)·종료(status closed|ended|cancelled 또는 isClosed=true)·숨김(postStatus=hidden|postHidden=true)
 *   은 reason(2자 이상) 필수 → 400 reason_required
 * - expected* 가 오면 현재 값과 비교, 다르면 409 conflict { current }. 갱신 자체도 읽은 값 기준 CAS.
 * - 반려·종료 시 개설자 알림, 모든 변경 감사 기록.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: {
    status?: string;
    maxMembers?: number;
    platformApprovalStatus?: string;
    postStatus?: string;
    postHidden?: boolean;
    isClosed?: boolean;
    reason?: string;
    expectedStatus?: string | null;
    expectedPlatformApprovalStatus?: string | null;
    expectedPostStatus?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.status && ["open", "closed", "ended", "cancelled"].includes(body.status)) {
    patch.status = body.status;
  }
  if (
    body.platformApprovalStatus &&
    ["pending_approval", "approved", "rejected"].includes(body.platformApprovalStatus)
  ) {
    patch.platform_approval_status = body.platformApprovalStatus;
  }
  if (typeof body.maxMembers === "number" && body.maxMembers > 0 && body.maxMembers <= 500) {
    patch.max_members = Math.floor(body.maxMembers);
  }
  if (typeof body.isClosed === "boolean") {
    patch.is_closed = body.isClosed;
  }

  const postPatch: Record<string, unknown> = {};
  if (body.postStatus && ["active", "hidden"].includes(body.postStatus)) {
    postPatch.status = body.postStatus;
  }
  if (typeof body.postHidden === "boolean") {
    postPatch.is_hidden = body.postHidden;
  }
  const shouldPatchPost = Object.keys(postPatch).length > 0;

  if (Object.keys(patch).length === 0 && !shouldPatchPost) {
    return NextResponse.json({ ok: false, error: "no_updates" }, { status: 400 });
  }

  const isReject = patch.platform_approval_status === "rejected";
  const isClose = (typeof patch.status === "string" && CLOSE_STATUSES.has(patch.status)) || patch.is_closed === true;
  const isHide = postPatch.status === "hidden" || postPatch.is_hidden === true;
  const reason = normalizeCommunityAdminReason(body.reason);
  if ((isReject || isClose || isHide) && !reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meetingData, error: meetingError } = await sb
    .from("meetings")
    .select("id, post_id, host_user_id, status, platform_approval_status, max_members, is_closed")
    .eq("id", id)
    .maybeSingle();
  if (meetingError) return NextResponse.json({ ok: false, error: meetingError.message }, { status: 500 });
  const meeting = (meetingData ?? null) as MeetingRow | null;
  if (!meeting) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const postId = String(meeting.post_id ?? "").trim();
  let postBefore: { status: string | null; is_hidden: boolean | null } | null = null;
  if (postId) {
    const { data: p } = await sb.from("community_posts").select("status, is_hidden").eq("id", postId).maybeSingle();
    postBefore = (p ?? null) as typeof postBefore;
  }

  const current = {
    status: meeting.status,
    platformApprovalStatus: meeting.platform_approval_status,
    postStatus: postBefore?.status ?? null,
  };
  const conflict = () => NextResponse.json({ ok: false, error: "conflict", current }, { status: 409 });
  if (body.expectedStatus !== undefined && (body.expectedStatus ?? null) !== current.status) return conflict();
  if (
    body.expectedPlatformApprovalStatus !== undefined &&
    (body.expectedPlatformApprovalStatus ?? null) !== current.platformApprovalStatus
  ) {
    return conflict();
  }
  if (body.expectedPostStatus !== undefined && (body.expectedPostStatus ?? null) !== current.postStatus) {
    return conflict();
  }

  const before: Record<string, unknown> = {
    status: meeting.status,
    platform_approval_status: meeting.platform_approval_status,
    max_members: meeting.max_members,
    is_closed: meeting.is_closed,
    ...(shouldPatchPost ? { post_status: postBefore?.status ?? null, post_is_hidden: postBefore?.is_hidden ?? null } : {}),
  };

  if (Object.keys(patch).length > 0) {
    let q = sb.from("meetings").update(patch).eq("id", id);
    q = meeting.status == null ? q.is("status", null) : q.eq("status", meeting.status);
    q =
      meeting.platform_approval_status == null
        ? q.is("platform_approval_status", null)
        : q.eq("platform_approval_status", meeting.platform_approval_status);
    const { data: upd, error } = await q.select("id");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!upd || upd.length === 0) return conflict();
  }

  if (shouldPatchPost) {
    if (!postId) return NextResponse.json({ ok: false, error: "post_not_found" }, { status: 404 });
    const { error: postError } = await sb.from("community_posts").update(postPatch).eq("id", postId);
    if (postError) return NextResponse.json({ ok: false, error: postError.message }, { status: 500 });
    if (isHide) {
      await applyCommunityPointReclaimOnPostAdminRemove({ postId });
    }
  }

  const action = isReject
    ? "meeting.reject"
    : isClose
      ? "meeting.close"
      : isHide
        ? "meeting.hide"
        : patch.platform_approval_status === "approved"
          ? "meeting.approve"
          : "meeting.update";
  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "meeting",
    targetId: id,
    action,
    reason,
    before,
    after: {
      ...patch,
      ...(shouldPatchPost
        ? { post_id: postId, post_status: postPatch.status ?? null, post_is_hidden: postPatch.is_hidden ?? null }
        : {}),
    },
  });

  const notifyKind = isReject ? "rejected" : isClose ? "closed" : null;
  if (notifyKind) {
    try {
      await notifyCommunityMeetingDecision(sb, {
        hostUserId: meeting.host_user_id,
        meetingId: id,
        kind: notifyKind,
        reason,
      });
    } catch (e) {
      console.error("[admin meeting PATCH notify]", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true, ...(audit.ok ? {} : { audit_warning: "audit_failed" }) });
}
