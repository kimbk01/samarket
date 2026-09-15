import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateNotificationEventInput,
  NotificationEventRow,
} from "@/lib/notifications/core/notification-event-schema";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import type { NotificationEventCategory } from "@/lib/notifications/core/notification-event-types";
import { logNotifyMessage } from "@/lib/notifications/core/notification-logs";
import {
  resolveNotificationPolicyProfile,
  shouldUseOsNotificationForState,
  type NotificationRuntimeAppState,
} from "@/lib/notifications/policy/notification-policy-profiles";
import { dispatchNotificationPushIfAllowed } from "@/lib/notifications/pipeline/notify-push-dispatcher";

export type CreateAndDispatchNotificationEventInput = CreateNotificationEventInput & {
  appState?: NotificationRuntimeAppState;
};

export async function createAndDispatchNotificationEvent(
  sb: SupabaseClient<any>,
  input: CreateAndDispatchNotificationEventInput,
  opts?: {
    /**
     * When true: persist `notification_events` only and return.
     * Caller must schedule `dispatchNotificationEvent` (typically route `after()`).
     * Preserves 44e7073fe durable-accept guarantee without blocking ACK on FCM.
     */
    deferPush?: boolean;
  }
): Promise<{ ok: true; row: NotificationEventRow; pushDeferred?: boolean } | { ok: false; error: string; duplicate?: boolean }> {
  const created = await createNotificationEvent(sb, input);
  if (!created.ok) return created;
  if (opts?.deferPush) {
    return { ok: true, row: created.row, pushDeferred: true };
  }
  await dispatchNotificationEvent(sb, created.row, { appState: input.appState });
  return created;
}

export async function dispatchNotificationEvent(
  sb: SupabaseClient<any>,
  row: NotificationEventRow,
  opts?: { appState?: NotificationRuntimeAppState }
): Promise<void> {
  const category = row.category as NotificationEventCategory;
  const profile = resolveNotificationPolicyProfile(category);
  const appState = opts?.appState ?? "background";
  if (!shouldUseOsNotificationForState(profile, appState)) {
    logNotifyMessage("push_dispatch_done", {
      userId: row.user_id,
      eventId: row.id,
      skipped: "policy_profile_foreground_only",
    });
    return;
  }
  await dispatchNotificationPushIfAllowed(sb, row, {
    callPushKind: row.type === "missed_call" ? "missed_call" : undefined,
  });
}
