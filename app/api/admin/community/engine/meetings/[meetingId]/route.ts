import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { notifyCommunityMeetingDecision } from "@/lib/notifications/notify-community-moderation";
import { applyCommunityPointReclaimOnPostAdminRemove } from "@/lib/points/community-point-bridge";
import {
  listRunningCommunityPromotionsForPost,
  parseCommunityPromotionFault,
  type RunningCommunityPromotion,
} from "@/lib/admin/community-admin/community-promotion-admin";
import {
  moderateCommunityPostWithPromotions,
  recordModeratedPromotionEnds,
} from "@/lib/admin/community-admin/community-post-moderate-rpc";

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
 * - 승인(platformApprovalStatus=approved)·반려(rejected)·종료(status closed|ended|cancelled 또는 isClosed=true)·숨김(postStatus=hidden|postHidden=true)
 *   은 reason(2자 이상) 필수 → 400 reason_required
 * - expected* 가 오면 현재 값과 비교, 다르면 409 conflict { current }. 갱신 자체도 읽은 값 기준 CAS.
 * - 반려·종료 시 개설자 알림, 모든 변경 감사 기록.
 * - D-11 ② (2026-11-07): 모임 글 숨김도 진행 중 상위노출을 확인한다 — 있으면 귀책(promotionFault: operator|member) 필수
 *   (없으면 400 promotion_fault_required). 숨김은 글 관리 숨김과 같은 DB 함수 `admin_community_post_moderate`
 *   (주문 종료 + 글 숨김 한 트랜잭션)로 처리한다. 예전에는 상위노출을 보지 않아 트리거가 「회원 숨김 = 정지」로 처리했다.
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
    promotionFault?: string | null;
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
  // 승인 = approve (L2) — 화면 시트 사유를 받아 감사 기록에 남긴다.
  const isApprove = patch.platform_approval_status === "approved";
  const reason = normalizeCommunityAdminReason(body.reason);
  if ((isReject || isClose || isHide || isApprove) && !reason) {
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
  type PostSnapshot = { status: string | null; is_hidden: boolean | null };
  let postBefore: PostSnapshot | null = null;
  if (postId) {
    const { data: p } = await sb.from("community_posts").select("status, is_hidden").eq("id", postId).maybeSingle();
    postBefore = (p ?? null) as PostSnapshot | null;
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

  // ── D-11 ② 상위노출 중인 모임 글 숨김: 귀책 필수 (글 관리 숨김과 같은 규칙)
  const promotions: RunningCommunityPromotion[] =
    isHide && postId ? await listRunningCommunityPromotionsForPost(sb, postId) : [];
  const promotionFault = parseCommunityPromotionFault(body.promotionFault);
  if (promotions.length > 0 && !promotionFault) {
    return NextResponse.json(
      {
        ok: false,
        error: "promotion_fault_required",
        promotions: promotions.map((p) => ({ id: p.id, orderStatus: p.orderStatus, endAt: p.endAt })),
      },
      { status: 400 }
    );
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

  let promotionEnd: Array<Record<string, unknown>> = [];
  if (shouldPatchPost) {
    if (!postId) return NextResponse.json({ ok: false, error: "post_not_found" }, { status: 404 });
    if (isHide && promotions.length > 0) {
      // 주문 종료 + 글 숨김 = DB 함수 1번. 실패하면 글·주문 모두 그대로.
      const moderated = await moderateCommunityPostWithPromotions(sb, {
        postId,
        actorId: admin.userId,
        action: "hide",
        fault: promotionFault,
        reason: reason ?? "",
      });
      if (!moderated.ok) {
        return NextResponse.json(
          { ok: false, error: moderated.error, ...(moderated.detail ?? {}) },
          { status: moderated.httpStatus }
        );
      }
      promotionEnd = await recordModeratedPromotionEnds(sb, req, {
        actorId: admin.userId,
        promotions,
        moderated,
        fault: promotionFault,
        reason,
        endReasonCode: "post_hidden",
      });
      // 상태는 함수가 썼다 — 나머지 칸(is_hidden)만 이어서 저장.
      const rest: Record<string, unknown> = { ...postPatch };
      delete rest.status;
      if (Object.keys(rest).length > 0) {
        const { error: restError } = await sb.from("community_posts").update(rest).eq("id", postId);
        if (restError) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
      }
    } else {
      const { error: postError } = await sb.from("community_posts").update(postPatch).eq("id", postId);
      if (postError) return NextResponse.json({ ok: false, error: postError.message }, { status: 500 });
    }
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
      ...(promotionEnd.length ? { promotion_end: promotionEnd, promotion_fault: promotionFault } : {}),
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
