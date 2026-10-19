/**
 * 거래 운영 조치 알림 (설계 v2 §C-4 · §F-3 · D-28). 서버 전용 — 클라이언트에서 import 금지.
 * 커뮤니티 운영 알림(notify-community-moderation)과 같은 규칙:
 * - 판매자: 거래글 숨김·삭제·복원·관리자 수정
 * - 회원: 경고·거래 활동 제한·해제 (이의신청 안내 포함)
 * - 신고자: 「처리 완료」만 (조치 내용·피신고자 정보 비공개)
 * - 홍보 신청자: 승인·반려·종료·환급
 * 알림은 조치가 끝난 뒤 보낸다. 알림 실패는 조치를 되돌리지 않는다 (금전·상태와 무관).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { COMMUNITY_APPEAL_HREF } from "@/lib/notifications/notify-community-moderation";

function clip(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export type TradePostModerationKind = "hidden" | "deleted" | "restored" | "edited";

const POST_TITLE_KEY = {
  hidden: "notify_trade_mod_post_hidden_title",
  deleted: "notify_trade_mod_post_deleted_title",
  restored: "notify_trade_mod_post_restored_title",
  edited: "notify_trade_mod_post_edited_title",
} as const;

const SANCTION_KEYS = {
  warning: { title: "notify_trade_sanction_warning_title", body: "notify_trade_sanction_warning_body" },
  restriction: { title: "notify_trade_sanction_restriction_title", body: "notify_trade_sanction_restriction_body" },
  revoked: { title: "notify_trade_sanction_revoked_title", body: "notify_trade_sanction_revoked_body" },
} as const;

const RESTRICTION_SCOPE_KEY = {
  post: "notify_trade_restriction_scope_post",
  chat: "notify_trade_restriction_scope_chat",
  all: "notify_trade_restriction_scope_all",
} as const;

export async function notifyTradePostModerated(
  sb: SupabaseClient,
  args: { userId: string | null | undefined; postId: string; kind: TradePostModerationKind; reason?: string | null; dedupeId: string }
): Promise<void> {
  const uid = clip(args.userId, 64);
  if (!uid || !args.postId) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  const reason = clip(args.reason);
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    push_kind: "trade",
    ref_id: args.postId,
    dedupe_key: `trade_moderation:${uid}:${args.kind}:${args.dedupeId}`,
    title: notifySafeT(lang, POST_TITLE_KEY[args.kind]),
    body: reason
      ? notifySafeT(lang, "notify_community_mod_reason_body", { vars: { reason } })
      : notifySafeT(lang, "notify_community_mod_default_body"),
    link_url: args.kind === "restored" || args.kind === "edited" ? `/post/${args.postId}` : COMMUNITY_APPEAL_HREF,
    meta: { kind: "trade_moderation", action: args.kind, post_id: args.postId, ...(reason ? { reason } : {}) },
  });
}

export async function notifyTradeSanction(
  sb: SupabaseClient,
  args: {
    userId: string;
    sanctionId: string;
    kind: "warning" | "restriction" | "revoked";
    restriction?: "post" | "chat" | "all" | null;
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
    push_kind: "trade",
    ref_id: args.sanctionId,
    dedupe_key: `trade_sanction:${uid}:${args.kind}:${args.sanctionId}`,
    title: notifySafeT(lang, SANCTION_KEYS[args.kind].title),
    body: notifySafeT(lang, SANCTION_KEYS[args.kind].body, { vars: { scope, until, reason: reason || "-" } }),
    link_url: args.kind === "revoked" ? "/market" : COMMUNITY_APPEAL_HREF,
    meta: {
      kind: "trade_sanction",
      action: args.kind,
      sanction_id: args.sanctionId,
      ...(args.restriction ? { restriction: args.restriction } : {}),
      ...(args.endAt ? { end_at: args.endAt } : {}),
    },
  });
}

export async function notifyTradeReportProcessed(
  sb: SupabaseClient,
  args: { reporterId: string | null | undefined; reportId: string }
): Promise<void> {
  const uid = clip(args.reporterId, 64);
  if (!uid) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "system",
    push_kind: "trade",
    ref_id: args.reportId,
    dedupe_key: `trade_report_processed:${uid}:${args.reportId}`,
    title: notifySafeT(lang, "notify_trade_report_processed_title"),
    body: notifySafeT(lang, "notify_trade_report_processed_body"),
    link_url: "/market",
    meta: { kind: "trade_report_processed", report_id: args.reportId },
  });
}

export async function notifyTradePromotionDecision(
  sb: SupabaseClient,
  args: {
    userId: string | null | undefined;
    orderId: string;
    kind: "approved" | "rejected" | "ended";
    points?: number;
    reason?: string | null;
  }
): Promise<void> {
  const uid = clip(args.userId, 64);
  if (!uid) return;
  const lang = await loadNotificationUserLanguage(sb, uid);
  const reason = clip(args.reason) || "-";
  const points = Math.max(0, Math.floor(args.points || 0));
  const title =
    args.kind === "approved"
      ? "notify_trade_promotion_approved_title"
      : args.kind === "rejected"
        ? "notify_trade_promotion_rejected_title"
        : "notify_trade_promotion_ended_title";
  const body =
    args.kind === "approved"
      ? notifySafeT(lang, "notify_trade_promotion_approved_body")
      : args.kind === "rejected"
        ? notifySafeT(lang, "notify_trade_promotion_rejected_body", { vars: { points: points.toLocaleString(), reason } })
        : points > 0
          ? notifySafeT(lang, "notify_trade_promotion_ended_refund_body", { vars: { points: points.toLocaleString(), reason } })
          : notifySafeT(lang, "notify_trade_promotion_ended_body", { vars: { reason } });
  await appendUserNotification(sb, {
    user_id: uid,
    notification_type: "commerce",
    push_kind: "trade",
    ref_id: args.orderId,
    dedupe_key: `trade_promotion_${args.kind}:${uid}:${args.orderId}`,
    title: notifySafeT(lang, title),
    body,
    link_url: "/mypage/points",
    meta: { kind: "trade_promotion_decision", action: args.kind, order_id: args.orderId, points },
  });
}
