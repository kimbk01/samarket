import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { resolveOwnerPlatformInquiryHref } from "@/lib/admin/admin-inquiry-deeplink";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";

/** B-21 — 받는 사람 알림 언어는 공용 로더 하나로 판정(user_settings 우선 · profiles 폴백). */
const loadUserLanguage = loadNotificationUserLanguage;

export async function notifyStoreOwnerPlatformInquiryReplied(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    ownerUserId: string;
    inquiryId: string;
    subject: string;
    answer: string;
  }
): Promise<void> {
  const ownerId = opts.ownerUserId.trim();
  const storeId = opts.storeId.trim();
  const inquiryId = opts.inquiryId.trim();
  if (!ownerId || !storeId || !inquiryId) return;
  const language = await loadUserLanguage(sb, ownerId);
  const subject =
    String(opts.subject ?? "").trim() ||
    notifySafeT(language, "notify_store_platform_inquiry_replied_title");
  const answer = String(opts.answer ?? "").trim().slice(0, 500);
  await createAndDispatchNotificationEvent(sb, {
    userId: ownerId,
    type: "inquiry_answered",
    category: "inquiry_answered",
    title: subject.slice(0, 120),
    body:
      answer ||
      notifySafeT(language, "notify_store_platform_inquiry_replied_body"),
    displayPayload: {
      routeUrl: resolveOwnerPlatformInquiryHref(storeId, inquiryId),
      platformInquiryId: inquiryId,
      previewKind: "platform_admin_inquiry",
      supportKind: "inquiry",
      subject,
    },
    dedupeKey: `platform_admin_inquiry_replied:${inquiryId}`,
  });
}
