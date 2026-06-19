import type { AppLanguageCode } from "@/lib/i18n/config";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import type { AdminNotificationEventType } from "@/lib/notifications/core/notification-event-types";

export type AdminAdNotificationDisplayPayload = {
  title: string;
  body: string;
  routeUrl: string;
  imageUrl: string | null;
  optOutText: string;
  eventType: AdminNotificationEventType;
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function buildAdminAdNotificationDisplay(input: {
  language: AppLanguageCode;
  eventType: AdminNotificationEventType;
  title: string;
  body: string;
  routeUrl?: string | null;
  imageUrl?: string | null;
}): AdminAdNotificationDisplayPayload {
  const title = trimText(input.title) || notifySafeT(input.language, "notify_admin_ad_title_fallback");
  const body = trimText(input.body);
  const routeUrl = trimText(input.routeUrl) || "/mypage/settings/notifications";
  const imageUrl = trimText(input.imageUrl) || null;
  const optOutText = notifySafeT(input.language, "notify_admin_ad_opt_out_text");

  return {
    title,
    body,
    routeUrl,
    imageUrl,
    optOutText,
    eventType: input.eventType,
  };
}

export function adminCampaignTypeToEventType(
  campaignType: "notice" | "marketing" | "system"
): AdminNotificationEventType {
  switch (campaignType) {
    case "marketing":
      return "admin_ad";
    case "notice":
      return "admin_notice";
    case "system":
    default:
      return "admin_system";
  }
}

export function buildAdminCampaignDedupeKey(campaignId: string, userId: string): string {
  return `admin_campaign:${campaignId.trim()}:${userId.trim()}`;
}
