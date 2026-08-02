/**
 * P2-b — orphan missed_call + room-bound byRoom from ONE thin SELECT.
 *
 * Q3 audit: `missedCallByRoom` is consumed by Domain canary list badges and mapped to
 * Projection `rowUnreadByRoomId` — byRoom MUST stay (cannot orphan-COUNT-only).
 *
 * Slice 2-3: also expose distinct call/session ids for B_member unresolved missed
 * (call_id dedupe). Room-bound missed stays on row/byRoom; orphan drives B_missed.
 *
 * Without a new migration, SQL COUNT cannot apply `notification_badge_event_eligible`.
 * This path transfers only `room_id` + `display_payload` (no muted_snapshot) and aggregates
 * orphan as an in-memory COUNT — meaning-identical to the prior row scan.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotificationEventBadgeEligible } from "@/lib/notifications/core/notification-event-repository";
import { resolveMissedCallIdForBMember } from "@/lib/notifications/badge-authority-rebuild/member-communication-b-projection";

export type OrphanMissedCallFacts = Readonly<{
  orphan: number;
  /** Orphan missed_call event ids (room_id null) — Badge Explain Matrix. */
  orphanEventIds: readonly string[];
  /** Distinct call/session ids among orphan unresolved missed (Slice 2-3 B_member). */
  orphanCallIds: readonly string[];
  byRoom: Record<string, number>;
}>;

export function aggregateOrphanMissedCallFacts(
  rows: ReadonlyArray<{
    id?: string | null;
    room_id?: string | null;
    dedupe_key?: string | null;
    call_session_id?: string | null;
    display_payload?: unknown;
    muted_snapshot?: boolean | null;
  }>
): OrphanMissedCallFacts {
  let orphan = 0;
  const orphanEventIds: string[] = [];
  const callIdSet = new Set<string>();
  const byRoom: Record<string, number> = {};
  for (const row of rows) {
    if (!isNotificationEventBadgeEligible(row)) continue;
    const roomId = typeof row.room_id === "string" ? row.room_id.trim() : "";
    if (!roomId) {
      orphan += 1;
      const eid = typeof row.id === "string" ? row.id.trim() : "";
      if (eid) orphanEventIds.push(eid);
      const callId = resolveMissedCallIdForBMember(row);
      if (callId) callIdSet.add(callId);
      else if (eid) callIdSet.add(`event:${eid}`);
      continue;
    }
    byRoom[roomId] = (byRoom[roomId] ?? 0) + 1;
  }
  return {
    orphan,
    orphanEventIds,
    orphanCallIds: [...callIdSet].sort(),
    byRoom,
  };
}

export async function loadOrphanMissedCallFacts(
  sb: SupabaseClient,
  userId: string
): Promise<OrphanMissedCallFacts> {
  const uid = userId.trim();
  if (!uid) return { orphan: 0, orphanEventIds: [], orphanCallIds: [], byRoom: {} };

  const { data, error } = await sb
    .from("notification_events")
    .select("id, room_id, dedupe_key, display_payload")
    .eq("user_id", uid)
    .eq("unread", true)
    .is("read_at", null)
    .eq("category", "missed_call");

  if (error || !data) return { orphan: 0, orphanEventIds: [], orphanCallIds: [], byRoom: {} };
  return aggregateOrphanMissedCallFacts(
    data as Array<{
      id?: string | null;
      room_id?: string | null;
      dedupe_key?: string | null;
      display_payload?: unknown;
    }>
  );
}
