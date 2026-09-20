import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPromotionCoordinationChannel,
  type PromotionCoordinationChannel,
} from "@/lib/platform-promotion-lifecycle/content-visit-contract";

export type RecordPromotionContentVisitInput = {
  eventId: string;
  sourceChannel: PromotionCoordinationChannel | string;
  sessionKey: string;
  userId?: string | null;
  anonymousDeviceKey?: string | null;
  distributionId?: string | null;
};

export type RecordPromotionContentVisitResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server writer — promotion-origin DESTINATION_OPEN only.
 * Does not fabricate popup dismiss analytics.
 * Navigation must not block on failure (caller fire-and-forget).
 */
export async function recordPromotionContentVisit(
  sb: SupabaseClient,
  input: RecordPromotionContentVisitInput
): Promise<RecordPromotionContentVisitResult> {
  const eventId = String(input.eventId ?? "").trim();
  const sessionKey = String(input.sessionKey ?? "").trim();
  const channel = String(input.sourceChannel ?? "").trim();
  if (!eventId) return { ok: false, error: "missing_event_id" };
  if (!sessionKey) return { ok: false, error: "missing_session_key" };
  if (!isPromotionCoordinationChannel(channel)) {
    return { ok: false, error: "invalid_source_channel" };
  }

  const userId = String(input.userId ?? "").trim() || null;
  const deviceKey = String(input.anonymousDeviceKey ?? "").trim() || null;
  if (!userId && !deviceKey) return { ok: false, error: "missing_actor" };

  const { error } = await sb.from("platform_promotion_content_visits").insert({
    event_id: eventId,
    user_id: userId,
    anonymous_device_key: userId ? null : deviceKey,
    source_channel: channel,
    distribution_id: String(input.distributionId ?? "").trim() || null,
    session_key: sessionKey,
  });

  if (error) {
    // Idempotent-ish: duplicate inserts in same session are harmless for eligibility.
    console.error("[promotion-lifecycle] content_visit_write_failed", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
