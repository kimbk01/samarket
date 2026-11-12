import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { isUuidString } from "@/lib/shared/uuid-string";

/**
 * 메신저 방 → 모임 (설계 moim §6 P11 · M6). 모임 채팅방 = community_messenger_rooms.owner_domain='moim'.
 * 모임 어드민 신고 큐(모임 방 메신저 신고)와 메신저 신고 큐(「모임」 배지)가 같이 쓴다. 서버 전용.
 */

export type MoimRoomRef = { roomId: string; moimId: string; scheduleId: string | null };

/** 방 id → 모임 (모임 전체 방은 owner_ref_id = 모임 id, 일정 방은 owner_ref_id = 일정 id) */
export async function resolveMoimRooms(sb: SupabaseServer, roomIds: string[]): Promise<Map<string, MoimRoomRef>> {
  const out = new Map<string, MoimRoomRef>();
  const uniq = [...new Set(roomIds.filter((x) => isUuidString(x)))];
  if (!uniq.length) return out;
  const rooms: { id: string; owner_ref_id: string }[] = [];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await sb.from("community_messenger_rooms").select("id, owner_ref_id").eq("owner_domain", "moim").in("id", uniq.slice(i, i + 200));
    rooms.push(...((data ?? []) as { id: string; owner_ref_id: string }[]));
  }
  if (!rooms.length) return out;
  const refs = [...new Set(rooms.map((x) => x.owner_ref_id))];
  const [{ data: moims }, { data: schedules }] = await Promise.all([
    sb.from("moims").select("id").in("id", refs),
    sb.from("moim_schedules").select("id, moim_id").in("id", refs),
  ]);
  const moimSet = new Set(((moims ?? []) as { id: string }[]).map((m) => m.id));
  const schedMap = new Map(((schedules ?? []) as { id: string; moim_id: string }[]).map((x) => [x.id, x.moim_id]));
  for (const room of rooms) {
    if (moimSet.has(room.owner_ref_id)) out.set(room.id, { roomId: room.id, moimId: room.owner_ref_id, scheduleId: null });
    else if (schedMap.has(room.owner_ref_id)) out.set(room.id, { roomId: room.id, moimId: schedMap.get(room.owner_ref_id) as string, scheduleId: room.owner_ref_id });
  }
  return out;
}
