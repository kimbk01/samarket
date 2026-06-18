/**
 * CM direct room — block SSOT communication gate (message/call/push/incoming).
 * `blocked_hidden_at` 는 gate 에 사용하지 않는다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isBlockedEitherWayActive } from "@/lib/community-messenger/social-relations";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseOrNull(): SupabaseClient<any> | null {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

/** direct 1:1 room 의 상대 user id (group/trade 키 방은 null) */
export async function resolveDirectRoomPeerUserId(
  roomId: string,
  viewerUserId: string,
  supabase?: SupabaseClient<any> | null
): Promise<string | null> {
  const rid = trimText(roomId);
  const viewer = trimText(viewerUserId);
  if (!rid || !viewer) return null;
  const sb = supabase ?? getSupabaseOrNull();
  if (!sb) return null;

  const { data: room } = await (sb as any)
    .from("community_messenger_rooms")
    .select("room_type, direct_key")
    .eq("id", rid)
    .maybeSingle();
  const roomType = trimText((room as { room_type?: string } | null)?.room_type);
  if (roomType !== "direct") return null;

  const directKey = trimText((room as { direct_key?: string } | null)?.direct_key);
  if (directKey) {
    const parts = directKey.split(":").filter(Boolean);
    if (parts.length === 2) {
      if (parts[0] === viewer) return parts[1] ?? null;
      if (parts[1] === viewer) return parts[0] ?? null;
    }
  }

  const { data: rows } = await (sb as any)
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", rid);
  const peers = dedupeIds(
    ((rows ?? []) as Array<{ user_id?: string | null }>)
      .map((row) => trimText(row.user_id))
      .filter((id) => id && id !== viewer)
  );
  return peers[0] ?? null;
}

function dedupeIds(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => trimText(v)).filter(Boolean))];
}

export type DirectRoomBlockDeny = { ok: false; error: "blocked_target"; peerUserId: string };

/** active block row (is_active=true) 가 있으면 message/call deny */
export async function assertDirectRoomCommunicationNotBlocked(input: {
  viewerUserId: string;
  roomId: string;
  supabase?: SupabaseClient<any> | null;
}): Promise<{ ok: true; peerUserId: string | null } | DirectRoomBlockDeny> {
  const viewer = trimText(input.viewerUserId);
  const roomId = trimText(input.roomId);
  if (!viewer || !roomId) return { ok: true, peerUserId: null };

  const sb = input.supabase ?? getSupabaseOrNull();
  if (!sb) return { ok: true, peerUserId: null };

  const peerUserId = await resolveDirectRoomPeerUserId(roomId, viewer, sb);
  if (!peerUserId) return { ok: true, peerUserId: null };

  if (await isBlockedEitherWayActive(viewer, peerUserId, sb)) {
    return { ok: false, error: "blocked_target", peerUserId };
  }
  return { ok: true, peerUserId };
}
