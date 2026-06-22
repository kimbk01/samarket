import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationRuntimeAppState } from "@/lib/notifications/policy/notification-policy-profiles";
import { loadRecipientPresenceSnapshot } from "@/lib/notifications/policy/notification-presence-policy";

const PRESENCE_STALE_MS = 30_000;

/**
 * Resolve recipient runtime app state for campaign push gating.
 * Foreground users must not receive OS push (in-app surface only).
 */
export async function resolveCampaignUserAppState(
  svc: SupabaseClient,
  userId: string,
  nowMs = Date.now()
): Promise<NotificationRuntimeAppState> {
  const presence = await loadRecipientPresenceSnapshot(svc, userId);
  const vis = String(presence.appVisibility ?? "").toLowerCase();
  const pingFresh =
    presence.lastPingAtMs != null && nowMs - presence.lastPingAtMs <= PRESENCE_STALE_MS;

  if (vis === "lockscreen" && pingFresh) return "lockscreen";
  if (vis === "foreground" && pingFresh) return "foreground";
  if (vis === "background" && pingFresh) return "background";
  // No fresh presence — treat as background/killed for push eligibility (not foreground bypass).
  return "background";
}
