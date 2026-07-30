/**
 * Phase 3 S2-3 — Group Online Members SSOT (read-only aggregate).
 *
 * Online =
 *   Active Participant (left_at IS NULL)
 *   ∩ Presence online (derivePresenceFromDbRow)
 *   − active ban
 *
 * Ghost / Pending are not participants → auto-excluded.
 * memberCount = active participant count (same authority as countActiveParticipants).
 *
 * DO NOT: new presence table/writer/engine/store; mutate presence-policy / heartbeat / TTL.
 */

import { derivePresenceFromDbRow } from "@/lib/community-messenger/presence/presence-policy";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";
import type { GroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";

const PRESENCE_IN_BATCH = 100;

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isMissingRelationError(error: { message?: string } | null | undefined): boolean {
  return /does not exist|relation/i.test(String(error?.message ?? ""));
}

export type GroupRoomOnlineAuthority = {
  memberCount: number;
  onlineCount: number;
  onlineUserIds: string[];
};

export function isGroupPresenceOnline(state: CommunityMessengerPresenceState | null | undefined): boolean {
  return state === "online";
}

/**
 * Pure SSOT compute — Header / Group Info / Member List must share this result.
 */
export function computeGroupRoomOnlineAuthority(input: {
  activeParticipantUserIds: readonly string[];
  bannedUserIds?: Iterable<string>;
  presenceStateByUserId: ReadonlyMap<string, CommunityMessengerPresenceState> | Readonly<Record<string, CommunityMessengerPresenceState>>;
}): GroupRoomOnlineAuthority {
  const banned = new Set<string>();
  if (input.bannedUserIds) {
    for (const id of input.bannedUserIds) {
      const uid = trimText(id);
      if (uid) banned.add(uid);
    }
  }

  const getState = (userId: string): CommunityMessengerPresenceState | undefined => {
    const map = input.presenceStateByUserId;
    if (map instanceof Map) return map.get(userId);
    return (map as Record<string, CommunityMessengerPresenceState>)[userId];
  };

  const activeIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.activeParticipantUserIds) {
    const uid = trimText(raw);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    activeIds.push(uid);
  }

  const onlineUserIds: string[] = [];
  for (const uid of activeIds) {
    if (banned.has(uid)) continue;
    if (isGroupPresenceOnline(getState(uid))) onlineUserIds.push(uid);
  }

  return {
    memberCount: activeIds.length,
    onlineCount: onlineUserIds.length,
    onlineUserIds,
  };
}

type PresenceSnapshotDbRow = {
  user_id?: string | null;
  last_seen_at?: string | null;
  updated_at?: string | null;
  last_ping_at?: string | null;
  last_activity_at?: string | null;
  app_visibility?: string | null;
};

async function fetchPresenceStatesByUserIds(
  sb: GroupRoomSupabase,
  userIds: string[]
): Promise<Map<string, CommunityMessengerPresenceState>> {
  const out = new Map<string, CommunityMessengerPresenceState>();
  const ids = [...new Set(userIds.map(trimText).filter(Boolean))];
  if (!ids.length) return out;

  const nowMs = Date.now();
  for (let i = 0; i < ids.length; i += PRESENCE_IN_BATCH) {
    const chunk = ids.slice(i, i + PRESENCE_IN_BATCH);
    const { data, error } = await (sb as any)
      .from("community_messenger_presence_snapshots")
      .select("user_id, last_seen_at, updated_at, last_ping_at, last_activity_at, app_visibility")
      .in("user_id", chunk);
    if (error && !isMissingRelationError(error)) continue;
    for (const row of (data ?? []) as PresenceSnapshotDbRow[]) {
      const userId = trimText(row.user_id);
      if (!userId) continue;
      out.set(
        userId,
        derivePresenceFromDbRow({
          nowMs,
          lastPingAtIso: row.last_ping_at ?? null,
          lastActivityAtIso: row.last_activity_at ?? null,
          lastSeenAtIso: row.last_seen_at ?? null,
          updatedAtIso: row.updated_at ?? null,
          appVisibility: row.app_visibility ?? "unknown",
        })
      );
    }
  }
  return out;
}

/**
 * Server aggregate for one group room. Presence read only — no writer side effects.
 */
export async function resolveGroupRoomOnlineAuthority(
  sb: GroupRoomSupabase,
  roomId: string
): Promise<GroupRoomOnlineAuthority> {
  const rid = trimText(roomId);
  if (!rid) return { memberCount: 0, onlineCount: 0, onlineUserIds: [] };

  const [participantsRes, bansRes] = await Promise.all([
    (sb as any)
      .from("community_messenger_participants")
      .select("user_id")
      .eq("room_id", rid)
      .is("left_at", null),
    (sb as any)
      .from("community_messenger_group_bans")
      .select("user_id")
      .eq("room_id", rid)
      .is("unbanned_at", null),
  ]);

  const activeParticipantUserIds = (
    ((participantsRes?.data ?? []) as Array<{ user_id?: string | null }>) ?? []
  )
    .map((row) => trimText(row.user_id))
    .filter(Boolean);

  let bannedUserIds: string[] = [];
  if (bansRes?.error && isMissingRelationError(bansRes.error)) {
    bannedUserIds = [];
  } else if (!bansRes?.error) {
    bannedUserIds = (((bansRes?.data ?? []) as Array<{ user_id?: string | null }>) ?? [])
      .map((row) => trimText(row.user_id))
      .filter(Boolean);
  }

  const bannedSet = new Set(bannedUserIds);
  const presenceEligibleIds = activeParticipantUserIds.filter((id) => !bannedSet.has(id));
  const presenceStateByUserId = await fetchPresenceStatesByUserIds(sb, presenceEligibleIds);

  return computeGroupRoomOnlineAuthority({
    activeParticipantUserIds,
    bannedUserIds,
    presenceStateByUserId,
  });
}
