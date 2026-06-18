import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE_ROOM_STALE_MS = 30_000;

export type RecipientPresenceSnapshot = {
  appVisibility: string | null;
  activeRoomId: string | null;
  lastPingAtMs: number | null;
};

export type PresenceSuppressDecision = {
  suppressPush: boolean;
  suppressSound: boolean;
  suppressBadge: boolean;
  autoRead: boolean;
  reason: "same_room_foreground" | null;
};

export async function loadRecipientPresenceSnapshot(
  sb: SupabaseClient<any>,
  userId: string
): Promise<RecipientPresenceSnapshot> {
  const { data } = await sb
    .from("community_messenger_presence_snapshots")
    .select("app_visibility, active_room_id, last_ping_at")
    .eq("user_id", userId.trim())
    .maybeSingle();
  const row = data as {
    app_visibility?: string | null;
    active_room_id?: string | null;
    last_ping_at?: string | null;
  } | null;
  const pingMs = row?.last_ping_at ? Date.parse(row.last_ping_at) : NaN;
  return {
    appVisibility: row?.app_visibility ?? null,
    activeRoomId: row?.active_room_id ?? null,
    lastPingAtMs: Number.isFinite(pingMs) ? pingMs : null,
  };
}

export function resolvePresenceSuppressDecision(
  presence: RecipientPresenceSnapshot,
  targetRoomId: string,
  nowMs = Date.now()
): PresenceSuppressDecision {
  const roomId = targetRoomId.trim();
  const vis = String(presence.appVisibility ?? "").toLowerCase();
  const active = presence.activeRoomId?.trim() ?? "";
  const pingFresh =
    presence.lastPingAtMs != null && nowMs - presence.lastPingAtMs <= ACTIVE_ROOM_STALE_MS;

  if (vis === "foreground" && pingFresh && active && active === roomId) {
    return {
      suppressPush: true,
      suppressSound: true,
      suppressBadge: true,
      autoRead: true,
      reason: "same_room_foreground",
    };
  }
  return {
    suppressPush: false,
    suppressSound: false,
    suppressBadge: false,
    autoRead: false,
    reason: null,
  };
}
