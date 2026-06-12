import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";

async function loadUserLanguage(sb: SupabaseClient, userId: string): Promise<AppLanguageCode> {
  const uid = userId.trim();
  if (!uid) return DEFAULT_APP_LANGUAGE;
  const { data } = await sb
    .from("profiles")
    .select("preferred_language")
    .eq("id", uid)
    .maybeSingle();
  return normalizeAppLanguage((data as { preferred_language?: unknown } | null)?.preferred_language);
}

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
    title: nt(language, "notify_user_point_charge_approved_title"),
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
  opts: { userId: string; requestId: string }
): Promise<void> {
  const userId = opts.userId.trim();
  if (!userId) return;
  const language = await loadUserLanguage(sb, userId);
  await appendUserNotification(sb, {
    user_id: userId,
    notification_type: "commerce",
    ref_id: opts.requestId,
    dedupe_key: `user_point_charge_reject:${opts.requestId}`,
    title: nt(language, "notify_user_point_charge_rejected_title"),
    body: nt(language, "notify_user_point_charge_rejected_body"),
    link_url: "/mypage/points",
    meta: {
      kind: "user_point_charge_rejected",
      request_id: opts.requestId,
    },
  });
}
