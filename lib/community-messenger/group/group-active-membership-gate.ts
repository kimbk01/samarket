/**
 * GROUP ACTIVE MEMBERSHIP SSOT — private_group / open_group only.
 *
 * ACTIVE =
 *   room_type ∈ {private_group, open_group}
 *   AND participant exists
 *   AND left_at IS NULL
 *   AND not active group ban
 *
 * DO NOT apply to direct / trade / delivery rooms.
 * Reuses fetchActiveParticipant + isUserBannedFromGroup — no parallel membership model.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUserBannedFromGroup } from "@/lib/community-messenger/group/group-room-ban-service";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  fetchActiveParticipant,
  resolveGroupRoomSupabase,
  type GroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import type { GroupParticipantRow } from "@/lib/community-messenger/group/group-room.types";
import {
  isCommunityMessengerGroupRoomType,
  type CommunityMessengerRoomType,
} from "@/lib/community-messenger/types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isCommunityMessengerGroupRoomTypeString(
  roomType: string | null | undefined
): roomType is "private_group" | "open_group" {
  const t = trimText(roomType);
  return t === "private_group" || t === "open_group";
}

export type GroupActiveMembershipOk = {
  ok: true;
  skipped: false;
  roomType: "private_group" | "open_group";
  participant: GroupParticipantRow;
};

export type GroupActiveMembershipSkipped = {
  ok: true;
  skipped: true;
  reason: "not_group_room";
};

export type GroupActiveMembershipDenied = {
  ok: false;
  error: string;
  roomType?: "private_group" | "open_group" | null;
};

export type GroupActiveMembershipResult =
  | GroupActiveMembershipOk
  | GroupActiveMembershipSkipped
  | GroupActiveMembershipDenied;

async function resolveSb(supabase?: SupabaseClient<any> | null): Promise<GroupRoomSupabase | null> {
  if (supabase) return supabase as GroupRoomSupabase;
  return resolveGroupRoomSupabase();
}

export async function loadCommunityMessengerRoomType(
  sb: GroupRoomSupabase,
  roomId: string
): Promise<string | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const { data, error } = await (sb as any)
    .from("community_messenger_rooms")
    .select("room_type")
    .eq("id", rid)
    .maybeSingle();
  if (error) return null;
  const t = trimText((data as { room_type?: unknown } | null)?.room_type);
  return t || null;
}

/**
 * If room is not a group → skipped (preserve non-group contracts).
 * If group → require active participant + not banned.
 */
export async function assertActiveGroupMembershipIfGroup(input: {
  userId: string;
  roomId: string;
  supabase?: SupabaseClient<any> | null;
  /** When roomType already known, skip room_type SELECT */
  roomType?: string | null;
}): Promise<GroupActiveMembershipResult> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  if (!userId || !roomId) {
    return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  }

  const sb = await resolveSb(input.supabase);
  if (!sb) {
    return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  }

  const roomTypeRaw =
    input.roomType != null && String(input.roomType).trim() !== ""
      ? trimText(input.roomType)
      : await loadCommunityMessengerRoomType(sb, roomId);

  if (!isCommunityMessengerGroupRoomTypeString(roomTypeRaw)) {
    return { ok: true, skipped: true, reason: "not_group_room" };
  }

  if (await isUserBannedFromGroup(sb, roomId, userId)) {
    return { ok: false, error: GROUP_ROOM_ERROR.USER_BANNED, roomType: roomTypeRaw };
  }

  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN, roomType: roomTypeRaw };
  }

  return {
    ok: true,
    skipped: false,
    roomType: roomTypeRaw,
    participant,
  };
}

/** Strict: room must be group + active member (used by group-only admin/send APIs). */
export async function assertActiveGroupParticipant(input: {
  userId: string;
  roomId: string;
  supabase?: SupabaseClient<any> | null;
}): Promise<
  | { ok: true; roomType: "private_group" | "open_group"; participant: GroupParticipantRow }
  | { ok: false; error: string }
> {
  const result = await assertActiveGroupMembershipIfGroup(input);
  if (!result.ok) return { ok: false, error: result.error };
  if (result.skipped) return { ok: false, error: GROUP_ROOM_ERROR.NOT_GROUP_ROOM };
  return { ok: true, roomType: result.roomType, participant: result.participant };
}

/**
 * Active member user ids for GROUP rooms (excludes left/banned).
 * For non-group rooms returns null — caller must preserve existing recipient query.
 */
export async function listActiveGroupRecipientUserIds(input: {
  roomId: string;
  excludeUserId?: string | null;
  roomType?: string | null;
  supabase?: SupabaseClient<any> | null;
}): Promise<string[] | null> {
  const roomId = trimText(input.roomId);
  if (!roomId) return null;
  const sb = await resolveSb(input.supabase);
  if (!sb) return null;

  const roomTypeRaw =
    input.roomType != null && String(input.roomType).trim() !== ""
      ? trimText(input.roomType)
      : await loadCommunityMessengerRoomType(sb, roomId);
  if (!isCommunityMessengerGroupRoomTypeString(roomTypeRaw)) return null;

  const { data, error } = await (sb as any)
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", roomId)
    .is("left_at", null)
    .is("blocked_hidden_at", null);
  if (error) return [];

  const exclude = trimText(input.excludeUserId);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{ user_id?: unknown }>) {
    const id = trimText(row.user_id);
    if (!id || seen.has(id)) continue;
    if (exclude && id === exclude) continue;
    seen.add(id);
    ids.push(id);
  }

  // Ban is orthogonal to left_at — filter active bans for remaining ids.
  if (ids.length === 0) return ids;
  const { data: banRows } = await (sb as any)
    .from("community_messenger_group_bans")
    .select("user_id")
    .eq("room_id", roomId)
    .is("unbanned_at", null)
    .in("user_id", ids);
  if (banRows && Array.isArray(banRows) && banRows.length > 0) {
    const banned = new Set(
      (banRows as Array<{ user_id?: unknown }>).map((r) => trimText(r.user_id)).filter(Boolean)
    );
    return ids.filter((id) => !banned.has(id));
  }
  return ids;
}

export function groupRoomTypeFromSummary(
  roomType: CommunityMessengerRoomType | string | null | undefined
): boolean {
  if (roomType == null) return false;
  if (typeof roomType === "string") {
    return isCommunityMessengerGroupRoomTypeString(roomType);
  }
  return isCommunityMessengerGroupRoomType(roomType);
}
