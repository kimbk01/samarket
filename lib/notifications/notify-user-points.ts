import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

/** B-21 — 받는 사람 알림 언어는 공용 로더 하나로 판정(user_settings 우선 · profiles 폴백). */
const loadUserLanguage = loadNotificationUserLanguage;

function nt(
  language: AppLanguageCode,
  key: Parameters<typeof notifySafeT>[1],
  vars?: Record<string, string | number>
): string {
  return notifySafeT(language, key, { vars });
}

export async function notifyUserPointChargeApproved(
  sb: SupabaseClient,
  opts: { userId: string; pointAmount: number; balanceAfter: number; requestId: string }
): Promise<void> {
  const userId = opts.userId.trim();
  if (!userId) return;
  const language = await loadUserLanguage(sb, userId);
  await appendUserNotification(sb, {
    user_id: userId,
    notification_type: "commerce",
    ref_id: opts.requestId,
    dedupe_key: `user_point_charge_ok:${opts.requestId}`,
    title: nt(language, "notify_user_point_charge_approved_title", { points: opts.pointAmount }),
    body: nt(language, "notify_user_point_charge_approved_body", {
      points: opts.pointAmount,
      balance: opts.balanceAfter,
    }),
    link_url: "/mypage/points",
    meta: {
      kind: "user_point_charge_approved",
      point_amount: opts.pointAmount,
      balance_after: opts.balanceAfter,
      request_id: opts.requestId,
    },
  });
}

export async function notifyUserPointChargeOnHold(
  sb: SupabaseClient,
  opts: { userId: string; requestId: string }
): Promise<void> {
  const userId = opts.userId.trim();
  if (!userId) return;
  const language = await loadUserLanguage(sb, userId);
  await appendUserNotification(sb, {
    user_id: userId,
    notification_type: "commerce",
    ref_id: opts.requestId,
    dedupe_key: `user_point_charge_hold:${opts.requestId}`,
    title: nt(language, "notify_user_point_charge_on_hold_title"),
    body: nt(language, "notify_user_point_charge_on_hold_body"),
    link_url: "/mypage/points",
    meta: {
      kind: "user_point_charge_on_hold",
      request_id: opts.requestId,
    },
  });
}

export async function notifyUserPointChargeRejected(
  sb: SupabaseClient,
  opts: { userId: string; requestId: string; reason?: string | null }
): Promise<void> {
  const userId = opts.userId.trim();
  if (!userId) return;
  const language = await loadUserLanguage(sb, userId);
  const reason = String(opts.reason ?? "").trim().slice(0, 300);
  await appendUserNotification(sb, {
    user_id: userId,
    notification_type: "commerce",
    ref_id: opts.requestId,
    dedupe_key: `user_point_charge_reject:${opts.requestId}`,
    title: nt(language, "notify_user_point_charge_rejected_title"),
    body: reason
      ? nt(language, "notify_user_point_charge_rejected_reason_body", { reason })
      : nt(language, "notify_user_point_charge_rejected_body"),
    link_url: "/mypage/points",
    meta: {
      kind: "user_point_charge_rejected",
      request_id: opts.requestId,
      ...(reason ? { reason } : {}),
    },
  });
}
