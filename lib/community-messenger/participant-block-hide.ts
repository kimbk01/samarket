/**
 * Block → bilateral direct room inbox hide (blocker + blocked peer).
 * Messages preserved; communication gated separately via social-relations block.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { messengerDirectKeyForUserPair } from "@/lib/community-messenger/messenger-room-domain";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseOrNull() {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

function isMissingColumnError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /does not exist|42703|blocked_hidden_at/i.test(msg);
}

async function resolveDirectRoomIdsForPair(
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>,
  viewerUserId: string,
  peerUserId: string,
  roomIdHint?: string
): Promise<string[]> {
  const hint = trimText(roomIdHint);
  if (hint) return [hint];

  const directKey = messengerDirectKeyForUserPair(viewerUserId, peerUserId);
  const { data: byKey } = await (sb as any)
    .from("community_messenger_rooms")
    .select("id")
    .eq("room_type", "direct")
    .eq("direct_key", directKey);

  const ids = new Set(
    ((byKey ?? []) as Array<{ id?: string }>).map((row) => trimText(row.id)).filter(Boolean)
  );

  if (ids.size > 0) return [...ids];

  const { data: viewerParts } = await (sb as any)
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", viewerUserId);

  const viewerRoomIds = ((viewerParts ?? []) as Array<{ room_id?: string }>)
    .map((row) => trimText(row.room_id))
    .filter(Boolean);
  if (!viewerRoomIds.length) return [];

  const { data: peerParts } = await (sb as any)
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", peerUserId)
    .in("room_id", viewerRoomIds);

  return ((peerParts ?? []) as Array<{ room_id?: string }>)
    .map((row) => trimText(row.room_id))
    .filter(Boolean);
}

async function hideDirectRoomForParticipantUser(input: {
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>;
  roomId: string;
  participantUserId: string;
  now: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { sb, roomId, participantUserId, now } = input;

  const { data: roomRow } = await (sb as any)
    .from("community_messenger_rooms")
    .select("id, room_type")
    .eq("id", roomId)
    .maybeSingle();
  if (trimText(roomRow?.room_type) !== "direct") return { ok: true };

  const { data: lastMsg } = await (sb as any)
    .from("community_messenger_messages")
    .select("id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    blocked_hidden_at: now,
    hidden_at: now,
  };
  const lastVisibleId = trimText(lastMsg?.id);
  if (lastVisibleId) patch.last_visible_message_id = lastVisibleId;

  const { error } = await (sb as any)
    .from("community_messenger_participants")
    .update(patch)
    .eq("room_id", roomId)
    .eq("user_id", participantUserId);

  if (error) {
    if (isMissingColumnError(error)) {
      return { ok: false, error: "migration_required" };
    }
    return { ok: false, error: String(error.message ?? "block_hide_failed") };
  }

  return { ok: true };
}

async function restoreDirectRoomForParticipantUser(input: {
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>;
  roomId: string;
  participantUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { sb, roomId, participantUserId } = input;

  const { error } = await (sb as any)
    .from("community_messenger_participants")
    .update({ blocked_hidden_at: null })
    .eq("room_id", roomId)
    .eq("user_id", participantUserId)
    .not("blocked_hidden_at", "is", null);

  if (error) {
    if (isMissingColumnError(error)) return { ok: true };
    return { ok: false, error: String(error.message ?? "unblock_restore_failed") };
  }

  return { ok: true };
}

/** P3 — blocker + blocked peer both hide shared direct rooms from inbox. */
export async function hideDirectRoomsOnBlockForViewer(input: {
  viewerUserId: string;
  peerUserId: string;
  roomId?: string;
}): Promise<{ ok: boolean; hiddenRoomIds: string[]; error?: string }> {
  const viewer = trimText(input.viewerUserId);
  const peer = trimText(input.peerUserId);
  if (!viewer || !peer || viewer === peer) return { ok: false, hiddenRoomIds: [], error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, hiddenRoomIds: [], error: "supabase_unavailable" };

  const roomIds = await resolveDirectRoomIdsForPair(sb, viewer, peer, input.roomId);
  if (!roomIds.length) return { ok: true, hiddenRoomIds: [] };

  const now = new Date().toISOString();
  const hiddenRoomIds: string[] = [];
  const participantUserIds = [viewer, peer];

  for (const roomId of roomIds) {
    for (const participantUserId of participantUserIds) {
      const result = await hideDirectRoomForParticipantUser({ sb, roomId, participantUserId, now });
      if (!result.ok) {
        return { ok: false, hiddenRoomIds, error: result.error };
      }
    }
    hiddenRoomIds.push(roomId);
  }

  return { ok: true, hiddenRoomIds };
}

/** P3 — unblock restores inbox visibility for both participants on shared direct rooms. */
export async function restoreDirectRoomsOnUnblockForViewer(
  viewerUserId: string,
  peerUserId: string
): Promise<{ ok: boolean; restoredRoomIds: string[]; error?: string }> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  if (!viewer || !peer) return { ok: false, restoredRoomIds: [], error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, restoredRoomIds: [], error: "supabase_unavailable" };

  const roomIds = await resolveDirectRoomIdsForPair(sb, viewer, peer);
  if (!roomIds.length) return { ok: true, restoredRoomIds: [] };

  const participantUserIds = [viewer, peer];

  for (const roomId of roomIds) {
    for (const participantUserId of participantUserIds) {
      const result = await restoreDirectRoomForParticipantUser({ sb, roomId, participantUserId });
      if (!result.ok) {
        return { ok: false, restoredRoomIds: [], error: result.error };
      }
    }
  }

  return { ok: true, restoredRoomIds: roomIds };
}

export function participantViewerBlockedHidden(
  me: { blocked_hidden_at?: string | null; blockedHiddenAt?: string | null } | undefined | null
): boolean {
  if (!me) return false;
  if ("blocked_hidden_at" in me && trimText(me.blocked_hidden_at)) return true;
  if ("blockedHiddenAt" in me && trimText(me.blockedHiddenAt)) return true;
  return false;
}
