import type { GroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";
import { parseMentionTokens } from "@/lib/community-messenger/group/group-room-mention-parser";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeNickname(value: string): string {
  return value.trim().toLowerCase();
}

export async function resolveMentionUserIdsForGroupRoom(
  sb: GroupRoomSupabase,
  roomId: string,
  content: string
): Promise<string[]> {
  const tokens = parseMentionTokens(content);
  if (!tokens.length) return [];
  const rid = trimText(roomId);
  if (!rid) return [];

  const { data: participantRows } = await (sb as any)
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", rid)
    .is("left_at", null)
    .is("blocked_hidden_at", null);
  const userIds = ((participantRows ?? []) as Array<{ user_id?: string }>)
    .map((r) => trimText(r.user_id))
    .filter(Boolean);
  if (!userIds.length) return [];

  const { data: profiles } = await (sb as any)
    .from("profiles")
    .select("id, nickname, full_name, display_name, username")
    .in("id", userIds);
  const nicknameToId = new Map<string, string>();
  for (const row of (profiles ?? []) as Array<Record<string, unknown>>) {
    const id = trimText(row.id);
    if (!id) continue;
    for (const key of ["nickname", "display_name", "full_name", "username"]) {
      const label = normalizeNickname(trimText(row[key]));
      if (label && !nicknameToId.has(label)) nicknameToId.set(label, id);
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const uid = nicknameToId.get(normalizeNickname(token.nickname));
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

export async function persistMessageMentionUserIds(
  sb: GroupRoomSupabase,
  messageId: string,
  mentionUserIds: string[]
): Promise<void> {
  const mid = trimText(messageId);
  if (!mid || !mentionUserIds.length) return;
  await (sb as any)
    .from("community_messenger_messages")
    .update({ mention_user_ids: mentionUserIds })
    .eq("id", mid);
}
