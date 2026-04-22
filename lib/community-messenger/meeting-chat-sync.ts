import type { SupabaseClient } from "@supabase/supabase-js";
import { createOpenGroupRoom } from "@/lib/community-messenger/service";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

type MeetingMessengerRole = "owner" | "admin" | "member";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function createMeetingMessengerRoom(input: {
  ownerUserId: string;
  title: string;
  summary?: string | null;
  coverImageUrl?: string | null;
  discoverable?: boolean;
  /** 모임 `entry_policy: password` 일 때 오픈그룹 비밀 입장과 동기 */
  joinPolicy?: "free" | "password";
  /** `joinPolicy: password` 일 때 평문(서버에서 `createOpenGroupRoom` 이 해시) */
  password?: string | null;
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const ownerUserId = trimText(input.ownerUserId);
  const title = trimText(input.title);
  if (!ownerUserId || !title) return { ok: false, error: "bad_request" };

  const usePassword = input.joinPolicy === "password";
  const passwordPlain = trimText(input.password);
  if (usePassword && !passwordPlain) return { ok: false, error: "password_required" };

  const discoverable = input.discoverable !== false;

  const created = await createOpenGroupRoom({
    userId: ownerUserId,
    title,
    summary: trimText(input.summary),
    joinPolicy: usePassword ? "password" : "free",
    password: usePassword ? passwordPlain : undefined,
    identityPolicy: "real_name",
    isDiscoverable: discoverable,
  });
  if (!created.ok || !created.roomId) return created;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return created;
  }

  await sb
    .from("community_messenger_rooms")
    .update({
      avatar_url: trimText(input.coverImageUrl) || null,
      is_discoverable: discoverable,
      allow_member_invite: false,
      allow_admin_invite: true,
      allow_admin_kick: true,
      allow_admin_edit_notice: true,
      allow_member_upload: true,
      allow_member_call: true,
    })
    .eq("id", created.roomId);

  return created;
}

export async function ensureMeetingMessengerParticipant(input: {
  roomId: string | null | undefined;
  userId: string | null | undefined;
  role?: MeetingMessengerRole;
}) {
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  if (!roomId || !userId) return;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return;
  }

  await sb.from("community_messenger_participants").upsert(
    {
      room_id: roomId,
      user_id: userId,
      role: input.role ?? "member",
      is_archived: false,
    },
    { onConflict: "room_id,user_id" }
  );
}

export async function removeMeetingMessengerParticipant(input: {
  roomId: string | null | undefined;
  userId: string | null | undefined;
}) {
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  if (!roomId || !userId) return;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return;
  }

  await sb.from("community_messenger_participants").delete().eq("room_id", roomId).eq("user_id", userId);
}

export async function updateMeetingMessengerRoomInfo(input: {
  roomId: string | null | undefined;
  title?: string | null;
  summary?: string | null;
  coverImageUrl?: string | null;
}) {
  const roomId = trimText(input.roomId);
  if (!roomId) return;

  const patch: Record<string, unknown> = {};
  if (input.title != null) patch.title = trimText(input.title);
  if (input.summary != null) patch.summary = trimText(input.summary);
  if (input.coverImageUrl !== undefined) patch.avatar_url = trimText(input.coverImageUrl) || null;
  if (Object.keys(patch).length === 0) return;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return;
  }

  await sb.from("community_messenger_rooms").update(patch).eq("id", roomId);
}

/** `meetings.community_messenger_room_id` 로 연결된 모임에서 해당 사용자를 `left` 처리 (채팅 나가기와 정합). */
export async function markMeetingMemberLeftForMessengerRoom(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<void> {
  const rid = trimText(roomId);
  const uid = trimText(userId);
  if (!rid || !uid) return;

  const { data: rows } = await sb.from("meetings").select("id").eq("community_messenger_room_id", rid).limit(20);
  for (const row of (rows ?? []) as Array<{ id?: unknown }>) {
    const mid = trimText(row.id);
    if (!mid) continue;
    await sb
      .from("meeting_members")
      .update({ status: "left" })
      .eq("meeting_id", mid)
      .eq("user_id", uid)
      .in("status", ["joined", "pending"]);
  }
}
