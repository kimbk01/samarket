import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import type { AdminNotificationEventType } from "@/lib/notifications/core/notification-event-types";
import {
  buildAdminAdNotificationDisplay,
  buildAdminCampaignDedupeKey,
} from "@/lib/notifications/display/build-admin-ad-notification-display";
import { dispatchAdminNotificationPushIfAllowed } from "@/lib/notifications/pipeline/notify-admin-push-dispatcher";

export type NotifyAdminAdPipelineInput = {
  userId: string;
  eventType: AdminNotificationEventType;
  title: string;
  body: string;
  routeUrl?: string | null;
  imageUrl?: string | null;
  dedupeKey: string;
  language?: AppLanguageCode;
  /** marketing | notice | system — push settings gate */
  pushKind: "marketing" | "notice" | "system";
  campaignId?: string | null;
};

export async function notifyAdminAdPipeline(
  sb: SupabaseClient<any>,
  input: NotifyAdminAdPipelineInput
): Promise<{ ok: boolean; eventId?: string; duplicate?: boolean; error?: string }> {
  const userId = input.userId.trim();
  const dedupeKey = input.dedupeKey.trim();
  if (!userId || !dedupeKey) return { ok: false, error: "invalid_input" };

  const language = input.language ?? DEFAULT_APP_LANGUAGE;
  const display = buildAdminAdNotificationDisplay({
    language,
    eventType: input.eventType,
    title: input.title,
    body: input.body,
    routeUrl: input.routeUrl,
    imageUrl: input.imageUrl,
  });

  const category = categoryForEventType(input.eventType);
  const created = await createNotificationEvent(sb, {
    userId,
    type: input.eventType,
    category,
    title: display.title,
    body: display.body,
    displayPayload: {
      ...display,
      pushKind: input.pushKind,
      adminCampaignId: input.campaignId ?? null,
    },
    dedupeKey,
    unread: true,
  });

  if (!created.ok) {
    if (created.duplicate) return { ok: true, duplicate: true };
    return { ok: false, error: created.error };
  }

  await dispatchAdminNotificationPushIfAllowed(sb, created.row, {
    pushKind: input.pushKind,
  });

  return { ok: true, eventId: created.row.id };
}
