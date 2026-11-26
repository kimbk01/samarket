/**
 * 회원 피드 배너 알림 단일 정의 (광고 DB 묶음 B-DB · FB-09 · 2026-11-27).
 * 승인 · 반려 · 운영 종료 · 검토 7일 만료 · 처리 실패 반려 — 회원 언어로, 신청당·종류당 1번(`dedupe_key`).
 * 알림 실패는 본 처리 결과에 영향 없음(로그만 · appendUserNotification 이 삼킨다).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MessageKey } from "@/lib/i18n/messages";

export type FeedAdNoticeKind =
  | "approved"
  | "rejected"
  | "review_timeout"
  | "admin_ended"
  | "system_failure";

const KEYS: Record<FeedAdNoticeKind, { title: MessageKey; body: MessageKey }> =
  {
    approved: {
      title: "feed_ad_notice_approved_title",
      body: "feed_ad_notice_approved_body",
    },
    rejected: {
      title: "feed_ad_notice_rejected_title",
      body: "feed_ad_notice_rejected_body",
    },
    review_timeout: {
      title: "feed_ad_notice_timeout_title",
      body: "feed_ad_notice_timeout_body",
    },
    admin_ended: {
      title: "feed_ad_notice_ended_title",
      body: "feed_ad_notice_ended_body",
    },
    system_failure: {
      title: "feed_ad_notice_rejected_title",
      body: "feed_ad_notice_failure_body",
    },
  };

export async function notifyFeedAdMember(
  sb: SupabaseClient,
  input: {
    userId: string;
    requestId: string;
    kind: FeedAdNoticeKind;
    domain?: string | null;
    reason?: string | null;
  }
): Promise<boolean> {
  const userId = input.userId.trim();
  const requestId = input.requestId.trim();
  if (!userId || !requestId) return false;
  /** 알림 실패는 본 처리 결과를 바꾸지 않는다 */
  try {
    const lang = await loadNotificationUserLanguage(sb, userId);
    const keys = KEYS[input.kind];
    const reason = String(input.reason ?? "").trim();
    return await appendUserNotification(sb, {
      user_id: userId,
      notification_type: "status",
      title: translateBy(lang, keys.title),
      body: translateBy(lang, keys.body, { reason: reason || "—" }),
      link_url: "/mypage/ads",
      push_kind: input.domain === "community" ? "community" : "trade",
      ref_id: requestId,
      dedupe_key: `feed-ad-${input.kind}:${requestId}`,
      meta: { kind: `feed_ad_${input.kind}`, request_id: requestId },
    });
  } catch {
    return false;
  }
}

/** 신청의 회원·분야 (알림 대상) — 조회 실패면 null */
export async function loadFeedAdRequestOwner(
  sb: SupabaseClient,
  requestId: string
): Promise<{ userId: string; domain: string | null } | null> {
  /** 알림은 부가 처리 — 조회가 던져도 본 처리(반려·승인·종료) 결과를 바꾸지 않는다 */
  try {
    const { data, error } = await sb
      .from("feed_ad_requests")
      .select("user_id, domain")
      .eq("id", requestId)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as { user_id?: unknown; domain?: unknown };
    const userId = String(r.user_id ?? "");
    return userId
      ? { userId, domain: r.domain == null ? null : String(r.domain) }
      : null;
  } catch {
    return null;
  }
}
