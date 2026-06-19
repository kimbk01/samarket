import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { shouldSkipPushForEventDedupe } from "@/lib/notifications/core/notification-dedupe";
import { isAdminNotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { fetchNotificationBadgeCount } from "@/lib/notifications/pipeline/notify-badge-service";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { getSiteOrigin } from "@/lib/env/runtime";

function absolutizeLink(link: string): string | null {
  const base = getSiteOrigin();
  if (!base) return null;
  return link.startsWith("/") ? `${base}${link}` : `${base}/${link}`;
}

function buildAdminPushPayload(
  row: NotificationEventRow,
  chatBadgeCount: number
): NotificationSideEffectPayloadOut {
  const display =
    row.display_payload && typeof row.display_payload === "object"
      ? (row.display_payload as Record<string, unknown>)
      : null;
  const routeUrl =
    (display && typeof display.routeUrl === "string" ? display.routeUrl.trim() : "") || "/mypage/settings/notifications";
  const pushKind =
    display && typeof display.pushKind === "string" ? String(display.pushKind).trim() : "system";
  const imageUrl = display && typeof display.imageUrl === "string" ? String(display.imageUrl).trim() : null;
  const optOutText = display && typeof display.optOutText === "string" ? String(display.optOutText).trim() : "";

  return {
    user_id: row.user_id,
    notification_type: "admin_campaign",
    title: row.title,
    body: row.body,
    link_url: routeUrl,
    link_url_absolute: absolutizeLink(routeUrl),
    occurred_at: row.created_at,
    meta: {
      kind: row.type,
      push_kind: pushKind,
      notification_event_id: row.id,
      notification_id: row.id,
      badge_count: chatBadgeCount,
      routeUrl,
      imageUrl,
      optOutText,
      display_payload: display,
      admin_campaign_id: display?.adminCampaignId ?? null,
    },
  };
}

export async function dispatchAdminNotificationPushIfAllowed(
  sb: SupabaseClient<any>,
  row: NotificationEventRow,
  opts?: { pushKind?: "marketing" | "notice" | "system" }
): Promise<void> {
  if (!isAdminNotificationEventType(row.type)) return;
  if (row.push_suppressed_reason) return;
  if (shouldSkipPushForEventDedupe(row.id)) return;

  const badge = await fetchNotificationBadgeCount(sb, row.user_id, { force: true });
  const out = buildAdminPushPayload(row, badge.total);
  if (opts?.pushKind) {
    out.meta = { ...(out.meta as Record<string, unknown>), push_kind: opts.pushKind };
  }

  await dispatchPushForUser(out, {
    badge_count: badge.total,
    notification_event_id: row.id,
    event_type: row.type,
    target_type: "admin_campaign",
    target_id:
      out.meta && typeof out.meta === "object"
        ? String((out.meta as Record<string, unknown>).admin_campaign_id ?? "") || undefined
        : undefined,
  });
}
