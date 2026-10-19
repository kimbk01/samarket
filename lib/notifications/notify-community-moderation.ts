/**
 * 커뮤니티 운영 조치 알림 (설계 §C-0-2 · C-17 · O-8 · O-11). 서버 전용 — 클라이언트에서 import 금지.
 * - 작성자: 숨김·삭제·복구·관리자 수정·고정
 * - 회원: 경고·커뮤니티 활동 제한·해제 (이의신청 안내 포함)
 * - 신고자: 「처리 완료」만 (조치 내용·피신고자 정보 비공개)
 * - 홍보 구매자: 종료·환급
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { buildCommunityPostNotificationPath } from "@/lib/notifications/community-post-notification-destination";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

/** 이의신청·문의 진입 (고객센터) */
export const COMMUNITY_APPEAL_HREF = "/support/enter";

function clip(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export type CommunityContentModerationKind = "hidden" | "deleted" | "restored" | "edited";

const CONTENT_TITLE_KEY = {
  post: {
    hidden: "notify_community_mod_post_hidden_title",
    deleted: "notify_community_mod_post_deleted_title",
    restored: "notify_community_mod_post_restored_title",
    edited: "notify_community_mod_post_edited_title",
  },
  comment: {
    hidden: "notify_community_mod_comment_hidden_title",
    deleted: "notify_community_mod_comment_deleted_title",
    restored: "notify_community_mod_comment_restored_title",
    edited: "notify_community_mod_comment_edited_title",
  },
} as const;

const SANCTION_KEYS = {
  warning: { title: "notify_community_sanction_warning_title", body: "notify_community_sanction_warning_body" },
  restriction: { title: "notify_community_sanction_restriction_title", body: "notify_community_sanction_restriction_body" },
  revoked: { title: "notify_community_sanction_revoked_title", body: "notify_community_sanction_revoked_body" },
} as const;

const RESTRICTION_SCOPE_KEY = {
  post: "notify_community_restriction_scope_post",
  comment: "notify_community_restriction_scope_comment",
  all: "notify_community_restriction_scope_all",
} as const;

const MEETING_TITLE_KEY = {
  rejected: "notify_community_meeting_rejected_title",
  closed: "notify_community_meeting_closed_title",
} as const;

export async function notifyCommunityContentModerated(
  sb: SupabaseClient,
  args: {
    userId: string | null | undefined;
    postId: string;
    commentId?: string | null;
    kind: CommunityContentModerationKind;
    reason?: string | null;
    /** 같은 조치 재시도 시 중복 알림 방지 (감사 기록 ID 등) */
    dedupeId: string;
  }
): Promise<void> {
  const uid = clip(args.userId, 64);
  if (!uid || !args.postId) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  const target: "post" | "comment" = args.commentId ? "comment" : "post";
  const reason = clip(args.reason);
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    push_kind: "community",
    domain: "community_chat",
    ref_id: args.commentId ?? args.postId,
    dedupe_key: `community_moderation:${uid}:${target}:${args.kind}:${args.dedupeId}`,
    title: notifySafeT(lang, CONTENT_TITLE_KEY[target][args.kind]),
    body: reason
      ? notifySafeT(lang, "notify_community_mod_reason_body", { vars: { reason } })
      : notifySafeT(lang, "notify_community_mod_default_body"),
    link_url: args.kind === "deleted" ? COMMUNITY_APPEAL_HREF : buildCommunityPostNotificationPath(args.postId),
    meta: {
      kind: "community_moderation",
      action: args.kind,
      target_type: target,
      post_id: args.postId,
      ...(args.commentId ? { comment_id: args.commentId } : {}),
      ...(reason ? { reason } : {}),
    },
  });
}

export async function notifyCommunitySanction(
  sb: SupabaseClient,
  args: {
    userId: string;
    sanctionId: string;
    kind: "warning" | "restriction" | "revoked";
    restriction?: "post" | "comment" | "all" | null;
    endAt?: string | null;
    reason?: string | null;
  }
): Promise<void> {
  const uid = clip(args.userId, 64);
  if (!uid) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  const reason = clip(args.reason);
  const scope = notifySafeT(lang, RESTRICTION_SCOPE_KEY[args.restriction ?? "all"]);
  const until = args.endAt
    ? new Date(args.endAt).toLocaleString(lang === "en" ? "en-PH" : "ko-KR", { timeZone: "Asia/Manila" })
    : notifySafeT(lang, "notify_community_restriction_permanent");
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    push_kind: "community",
    domain: "community_chat",
    ref_id: args.sanctionId,
    dedupe_key: `community_sanction:${uid}:${args.kind}:${args.sanctionId}`,
    title: notifySafeT(lang, SANCTION_KEYS[args.kind].title),
    body: notifySafeT(lang, SANCTION_KEYS[args.kind].body, {
      vars: { scope, until, reason: reason || "-" },
    }),
    link_url: args.kind === "revoked" ? "/philife" : COMMUNITY_APPEAL_HREF,
    meta: {
      kind: "community_sanction",
      action: args.kind,
      sanction_id: args.sanctionId,
      ...(args.restriction ? { restriction: args.restriction } : {}),
      ...(args.endAt ? { end_at: args.endAt } : {}),
    },
  });
}

/** 신고자에게는 처리 완료만 알린다 (O-11). */
export async function notifyCommunityReportProcessed(
  sb: SupabaseClient,
  args: { reporterId: string | null | undefined; reportId: string }
): Promise<void> {
  const uid = clip(args.reporterId, 64);
  if (!uid) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    push_kind: "community",
    domain: "community_chat",
    ref_id: args.reportId,
    dedupe_key: `community_report_processed:${uid}:${args.reportId}`,
    title: notifySafeT(lang, "notify_community_report_processed_title"),
    body: notifySafeT(lang, "notify_community_report_processed_body"),
    link_url: "/philife",
    meta: { kind: "community_report_processed", report_id: args.reportId },
  });
}

export async function notifyCommunityPostPinned(
  sb: SupabaseClient,
  args: { userId: string | null | undefined; postId: string; pinnedAt: string }
): Promise<void> {
  const uid = clip(args.userId, 64);
  if (!uid) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    push_kind: "community",
    domain: "community_chat",
    ref_id: args.postId,
    dedupe_key: `community_pin:${uid}:${args.postId}:${args.pinnedAt}`,
    title: notifySafeT(lang, "notify_community_pinned_title"),
    body: notifySafeT(lang, "notify_community_pinned_body"),
    link_url: buildCommunityPostNotificationPath(args.postId),
    meta: { kind: "community_pinned", post_id: args.postId },
  });
}

export async function notifyCommunityPromotionEnded(
  sb: SupabaseClient,
  args: {
    userId: string | null | undefined;
    orderId: string;
    refundPoints: number;
    reason?: string | null;
  }
): Promise<void> {
  const uid = clip(args.userId, 64);
  if (!uid) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  const reason = clip(args.reason) || "-";
  const refund = Math.max(0, Math.floor(args.refundPoints || 0));
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "commerce",
    push_kind: "community",
    ref_id: args.orderId,
    dedupe_key: `community_promotion_end:${uid}:${args.orderId}`,
    title: notifySafeT(lang, "notify_community_promotion_ended_title"),
    body: refund > 0
      ? notifySafeT(lang, "notify_community_promotion_ended_refund_body", { vars: { points: refund.toLocaleString(), reason } })
      : notifySafeT(lang, "notify_community_promotion_ended_body", { vars: { reason } }),
    link_url: "/mypage/points",
    meta: { kind: "community_promotion_ended", order_id: args.orderId, refund_points: refund },
  });
}

export async function notifyCommunityMeetingDecision(
  sb: SupabaseClient,
  args: { hostUserId: string | null | undefined; meetingId: string; kind: "rejected" | "closed"; reason?: string | null }
): Promise<void> {
  const uid = clip(args.hostUserId, 64);
  if (!uid) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  const reason = clip(args.reason) || "-";
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    push_kind: "community",
    domain: "community_chat",
    ref_id: args.meetingId,
    dedupe_key: `community_meeting_${args.kind}:${uid}:${args.meetingId}`,
    title: notifySafeT(lang, MEETING_TITLE_KEY[args.kind]),
    body: notifySafeT(lang, "notify_community_mod_reason_body", { vars: { reason } }),
    link_url: COMMUNITY_APPEAL_HREF,
    meta: { kind: "community_meeting_decision", action: args.kind, meeting_id: args.meetingId },
  });
}
