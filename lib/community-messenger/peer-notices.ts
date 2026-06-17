/**
 * CM 1:1 unknown peer top notice — dismiss state (separate from user_social_relations).
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { logSocialRelationEvent } from "@/lib/community-messenger/social-relations";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type CommunityMessengerPeerNoticeType = "unknown_peer";

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

function isMissingTableError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /does not exist|relation .* does not exist/i.test(msg);
}

export function shouldShowUnknownPeerNotice(input: {
  isFriend: boolean;
  blockedByMe: boolean;
  dismissed: boolean;
}): boolean {
  if (input.blockedByMe || input.isFriend || input.dismissed) return false;
  return true;
}

export async function isUnknownPeerNoticeDismissed(
  viewerUserId: string,
  peerUserId: string,
  roomId: string,
  noticeType: CommunityMessengerPeerNoticeType = "unknown_peer"
): Promise<boolean> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  const room = trimText(roomId);
  if (!viewer || !peer || !room || viewer === peer) return false;

  const sb = getSupabaseOrNull();
  if (!sb) return false;

  const { data, error } = await (sb as any)
    .from("community_messenger_peer_notices")
    .select("dismissed_at")
    .eq("viewer_user_id", viewer)
    .eq("peer_user_id", peer)
    .eq("room_id", room)
    .eq("notice_type", noticeType)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return false;
    return false;
  }

  return Boolean(trimText(data?.dismissed_at));
}

async function validateDirectRoomPeerAccess(input: {
  viewerUserId: string;
  peerUserId: string;
  roomId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = trimText(input.viewerUserId);
  const peer = trimText(input.peerUserId);
  const roomId = trimText(input.roomId);
  if (!viewer || !peer || !roomId || viewer === peer) {
    return { ok: false, error: "bad_target" };
  }

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "storage_unavailable" };

  const [roomRes, participantsRes] = await Promise.all([
    (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type")
      .eq("id", roomId)
      .maybeSingle(),
    (sb as any)
      .from("community_messenger_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .in("user_id", [viewer, peer]),
  ]);

  const roomType = trimText(roomRes.data?.room_type);
  if (roomRes.error || !roomRes.data || roomType !== "direct") {
    return { ok: false, error: "room_not_found" };
  }

  const participantIds = new Set(
    ((participantsRes.data ?? []) as Array<{ user_id?: string }>).map((row) => trimText(row.user_id)).filter(Boolean)
  );
  if (!participantIds.has(viewer) || !participantIds.has(peer)) {
    return { ok: false, error: "room_not_found" };
  }

  return { ok: true };
}

export async function dismissUnknownPeerNotice(input: {
  viewerUserId: string;
  peerUserId: string;
  roomId: string;
  noticeType?: CommunityMessengerPeerNoticeType;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const noticeType = input.noticeType ?? "unknown_peer";
  if (noticeType !== "unknown_peer") {
    return { ok: false, error: "bad_notice_type" };
  }

  const access = await validateDirectRoomPeerAccess(input);
  if (!access.ok) return access;

  const viewer = trimText(input.viewerUserId);
  const peer = trimText(input.peerUserId);
  const roomId = trimText(input.roomId);

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "storage_unavailable" };

  const now = new Date().toISOString();
  const { error } = await (sb as any).from("community_messenger_peer_notices").upsert(
    {
      viewer_user_id: viewer,
      peer_user_id: peer,
      room_id: roomId,
      notice_type: noticeType,
      dismissed_at: now,
    },
    { onConflict: "viewer_user_id,peer_user_id,room_id,notice_type" }
  );

  if (error) {
    if (isMissingTableError(error)) return { ok: false, error: "migration_required" };
    return { ok: false, error: String(error.message ?? "dismiss_failed") };
  }

  logSocialRelationEvent("unknown_peer_notice_dismissed", { notice_type: noticeType });
  return { ok: true };
}
