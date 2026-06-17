import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommunityMessengerPeerPresenceSnapshot,
  CommunityMessengerPresenceState,
} from "@/lib/community-messenger/types";
import { derivePresenceFromDbRow } from "@/lib/community-messenger/presence/presence-policy";

export const PRESENCE_UPSERT_SOFT_TIMEOUT_MS = 2_500;
export const PRESENCE_EXPIRES_SECONDS = 60;

export type PresenceUpsertInput = {
  userId: string;
  status?: CommunityMessengerPresenceState | null;
  surface?: string | null;
  roomId?: string | null;
  callId?: string | null;
  lastSeenAt?: string | null;
  lastPingAt?: string | null;
  lastActivityAt?: string | null;
  appVisibility?: string | null;
  sessionEnd?: boolean;
};

type PresenceSnapshotRow = {
  user_id?: string | null;
  last_seen_at?: string | null;
  updated_at?: string | null;
  last_ping_at?: string | null;
  last_activity_at?: string | null;
  app_visibility?: string | null;
  presence_state_cached?: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseStatus(raw: unknown): CommunityMessengerPresenceState | null {
  if (raw === "online" || raw === "away" || raw === "offline") return raw;
  return null;
}

function parseSurface(raw: unknown): "home" | "room" | "call" | "background" {
  const v = trimText(raw).toLowerCase();
  if (v === "home" || v === "room" || v === "call" || v === "background") return v;
  return "home";
}

function mapSurfaceToAppVisibility(surface: string): string {
  return surface === "background" ? "background" : "foreground";
}

function expiresAtIso(): string {
  return new Date(Date.now() + PRESENCE_EXPIRES_SECONDS * 1000).toISOString();
}

export function buildPresenceUpsertRow(input: PresenceUpsertInput): Record<string, unknown> {
  const userId = trimText(input.userId);
  const now = nowIso();
  const sessionEnd = input.sessionEnd === true;

  if (sessionEnd) {
    const lastSeenAt = trimText(input.lastSeenAt) || now;
    return {
      user_id: userId,
      last_seen_at: lastSeenAt,
      updated_at: now,
      last_ping_at: null,
      presence_state_cached: "offline" satisfies CommunityMessengerPresenceState,
      app_visibility: "background",
      surface: "background",
      expires_at: expiresAtIso(),
    };
  }

  const explicitStatus = parseStatus(input.status);
  if (explicitStatus) {
    const surface = parseSurface(input.surface);
    const roomId = trimText(input.roomId) || null;
    const callId = trimText(input.callId) || null;
    return {
      user_id: userId,
      last_seen_at: now,
      updated_at: now,
      last_ping_at: now,
      last_activity_at: now,
      app_visibility: mapSurfaceToAppVisibility(surface),
      presence_state_cached: explicitStatus,
      surface,
      current_room_id: roomId,
      current_call_id: callId,
      expires_at: expiresAtIso(),
    };
  }

  const lastPingAt = trimText(input.lastPingAt) || now;
  const lastActivityAt = trimText(input.lastActivityAt) || lastPingAt;
  const v = trimText(input.appVisibility).toLowerCase();
  const appVisibility = v === "foreground" || v === "background" || v === "unknown" ? v : "unknown";
  const derived = derivePresenceFromDbRow({
    nowMs: Date.now(),
    lastPingAtIso: lastPingAt,
    lastActivityAtIso: lastActivityAt,
    lastSeenAtIso: null,
    updatedAtIso: now,
    appVisibility,
  });
  return {
    user_id: userId,
    last_seen_at: trimText(input.lastSeenAt) || now,
    updated_at: now,
    last_ping_at: lastPingAt,
    last_activity_at: lastActivityAt,
    app_visibility: appVisibility,
    presence_state_cached: derived,
    expires_at: expiresAtIso(),
  };
}

export async function upsertPresenceSnapshot(
  sb: SupabaseClient,
  input: PresenceUpsertInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = trimText(input.userId);
  if (!userId) return { ok: false, error: "user_required" };
  const row = buildPresenceUpsertRow(input);
  const { error } = await sb.from("community_messenger_presence_snapshots").upsert(row, {
    onConflict: "user_id",
  });
  if (error) return { ok: false, error: String(error.message ?? "presence_upsert_failed") };
  return { ok: true };
}

export async function getPresenceSnapshotsByUserIds(
  sb: SupabaseClient,
  ids: string[]
): Promise<Map<string, CommunityMessengerPeerPresenceSnapshot>> {
  const unique = [...new Set(ids.map((id) => trimText(id)).filter(Boolean))];
  const result = new Map<string, CommunityMessengerPeerPresenceSnapshot>();
  if (!unique.length) return result;

  const { data, error } = await sb
    .from("community_messenger_presence_snapshots")
    .select("user_id, last_seen_at, updated_at, last_ping_at, last_activity_at, app_visibility, presence_state_cached")
    .in("user_id", unique);

  if (error) return result;

  const nowMs = Date.now();
  for (const row of (data ?? []) as PresenceSnapshotRow[]) {
    const userId = trimText(row.user_id);
    if (!userId) continue;
    const lastSeenAt = trimText(row.last_seen_at) || trimText(row.updated_at) || null;
    const state = derivePresenceFromDbRow({
      nowMs,
      lastPingAtIso: row.last_ping_at ?? null,
      lastActivityAtIso: row.last_activity_at ?? null,
      lastSeenAtIso: row.last_seen_at ?? null,
      updatedAtIso: row.updated_at ?? null,
      appVisibility: row.app_visibility ?? "unknown",
    });
    result.set(userId, { userId, state, lastSeenAt });
  }
  return result;
}
