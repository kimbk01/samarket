/**
 * 채팅 Admin 방 목록 — 서버 페이지네이션 (C-11 · C-15).
 * SSOT = `community_messenger_rooms` (일반 1:1 · 그룹 · 거래 · 배달 주문 모두 같은 테이블, `chat_domain`).
 * keyset (last_message_at DESC NULLS LAST, id DESC) · 검색(방 제목·참여자 닉네임·방 ID·회원 ID) ·
 * `user_id` 참여자 필터 · 미처리 신고 방 필터. 메시지 본문은 읽지 않는다.
 * Server-only (service-role client) — client 컴포넌트에서 import 금지.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveRoomLastMessageForViewer } from "@/lib/community-messenger/call-stub-room-tip";
import { chatActiveWindowFromIso, chatIdleCutoffIso } from "@/lib/admin/metrics/chat-metrics";
import {
  decodeAdminKeysetCursor,
  encodeAdminKeysetCursor,
  isAdminUuid,
  type AdminChatRoomListQuery,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";

export type AdminChatRoomListMember = { userId: string; label: string; role: string };

export type AdminChatRoomListRow = {
  id: string;
  chatDomain: string;
  roomType: string;
  roomStatus: string;
  isReadonly: boolean;
  title: string;
  memberCount: number;
  members: AdminChatRoomListMember[];
  lastMessage: string;
  lastMessageType: string;
  lastMessageAt: string;
  createdAt: string;
  openReportCount: number;
};

export type AdminChatRoomListPage = { rows: AdminChatRoomListRow[]; nextCursor: string | null };

const ROOM_SELECT =
  "id, chat_domain, room_type, room_status, is_readonly, title, created_by, owner_user_id, last_message, last_message_type, last_message_at, created_at";

/** URL 길이 보호 — `id.in.(…)` 후보 상한. */
const MAX_ID_CANDIDATES = 300;
const OPEN_CM_REPORT_STATUSES = ["received", "reviewing"] as const;

type RoomRow = {
  id: string;
  chat_domain: string | null;
  room_type: string | null;
  room_status: string | null;
  is_readonly: boolean | null;
  title: string | null;
  created_by: string | null;
  owner_user_id: string | null;
  last_message: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  created_at: string | null;
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** PostgREST 논리식 값 인용 (타임스탬프의 `:` `+` `.` 보호). */
const quote = (v: string) => `"${v.replace(/"/g, "")}"`;

function intersect(a: Set<string> | null, b: Set<string>): Set<string> {
  if (!a) return b;
  return new Set([...a].filter((x) => b.has(x)));
}

async function roomIdsForUsers(sb: ReturnType<typeof getSupabaseServer>, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const { data, error } = await sb
    .from("community_messenger_participants")
    .select("room_id")
    .in("user_id", userIds)
    .limit(2000);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ room_id: string | null }>).map((r) => s(r.room_id)).filter(Boolean));
}

export async function listAdminChatRoomsPaged(
  query: AdminChatRoomListQuery,
  limit: number
): Promise<AdminChatRoomListPage> {
  const sb = getSupabaseServer();

  // 1) 후보 방 ID 제한 (참여 회원 · 미처리 신고 · UUID 검색)
  let restrict: Set<string> | null = null;
  if (query.userId) {
    restrict = intersect(restrict, await roomIdsForUsers(sb, [query.userId]));
  }
  if (query.reported) {
    const { data, error } = await sb
      .from("community_messenger_reports")
      .select("room_id")
      .in("status", [...OPEN_CM_REPORT_STATUSES])
      .limit(2000);
    if (error) throw new Error(error.message);
    const ids = new Set(((data ?? []) as Array<{ room_id: string | null }>).map((r) => s(r.room_id)).filter(Boolean));
    restrict = intersect(restrict, ids);
  }
  const q = query.q;
  const qIsUuid = isAdminUuid(q);
  if (q && qIsUuid) {
    const ids = await roomIdsForUsers(sb, [q.toLowerCase()]);
    ids.add(q.toLowerCase());
    restrict = intersect(restrict, ids);
  }
  if (restrict && restrict.size === 0) return { rows: [], nextCursor: null };

  // 2) 텍스트 검색 — 방 제목 OR 닉네임/아이디가 일치하는 회원이 참여한 방
  let textOr: string | null = null;
  if (q && !qIsUuid) {
    const { data: profiles, error: pErr } = await sb
      .from("profiles")
      .select("id")
      .or(`nickname.ilike.*${q}*,username.ilike.*${q}*`)
      .limit(50);
    if (pErr) throw new Error(pErr.message);
    const userIds = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);
    let memberRooms = [...(await roomIdsForUsers(sb, userIds))];
    if (restrict) memberRooms = memberRooms.filter((id) => restrict!.has(id));
    memberRooms = memberRooms.slice(0, MAX_ID_CANDIDATES);
    textOr = memberRooms.length
      ? `title.ilike.*${q}*,id.in.(${memberRooms.join(",")})`
      : `title.ilike.*${q}*`;
  }

  // 3) keyset 조건
  const cursor = decodeAdminKeysetCursor(query.cursor);
  let keysetOr: string | null = null;
  if (cursor?.ts) {
    keysetOr = `last_message_at.lt.${quote(cursor.ts)},and(last_message_at.eq.${quote(cursor.ts)},id.lt.${cursor.id}),last_message_at.is.null`;
  }

  let rq = sb
    .from("community_messenger_rooms")
    .select(ROOM_SELECT)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (query.type !== "all") rq = rq.eq("chat_domain", query.type);
  if (query.status) rq = rq.eq("room_status", query.status);
  // 대시보드 지표와 같은 경계 (마닐라 자정 기준) — chat-metrics 의 같은 함수.
  if (query.activity === "7d") rq = rq.gte("last_message_at", chatActiveWindowFromIso());
  if (query.idleDays > 0) rq = rq.lt("last_message_at", chatIdleCutoffIso(new Date(), query.idleDays));
  if (restrict) rq = rq.in("id", [...restrict].slice(0, MAX_ID_CANDIDATES));
  if (cursor && !cursor.ts) rq = rq.is("last_message_at", null).lt("id", cursor.id);
  if (textOr && keysetOr) rq = rq.or(`and(or(${textOr}),or(${keysetOr}))`);
  else if (textOr) rq = rq.or(textOr);
  else if (keysetOr) rq = rq.or(keysetOr);

  const { data: roomData, error } = await rq;
  if (error) throw new Error(error.message);
  const all = (roomData ?? []) as RoomRow[];
  const page = all.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    all.length > limit && last ? encodeAdminKeysetCursor({ ts: s(last.last_message_at), id: last.id }) : null;
  if (!page.length) return { rows: [], nextCursor: null };

  // 4) 페이지 단위 보조 조회 — 참여자 · 미처리 신고 수 · 프로필
  const roomIds = page.map((r) => r.id);
  const [{ data: partData, error: partErr }, { data: repData }] = await Promise.all([
    sb
      .from("community_messenger_participants")
      .select("room_id, user_id, role, store_order_role, joined_at")
      .in("room_id", roomIds),
    sb
      .from("community_messenger_reports")
      .select("room_id")
      .in("room_id", roomIds)
      .in("status", [...OPEN_CM_REPORT_STATUSES]),
  ]);
  if (partErr) throw new Error(partErr.message);
  const participants = (partData ?? []) as Array<{
    room_id: string;
    user_id: string;
    role: string | null;
    store_order_role?: string | null;
  }>;
  const reportCount = new Map<string, number>();
  for (const r of (repData ?? []) as Array<{ room_id: string | null }>) {
    const rid = s(r.room_id);
    if (rid) reportCount.set(rid, (reportCount.get(rid) ?? 0) + 1);
  }
  const userIds = [...new Set(participants.map((p) => p.user_id).filter(Boolean))];
  const labelById = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname, username").in("id", userIds);
    for (const p of (profiles ?? []) as Array<{ id: string; nickname?: string | null; username?: string | null }>) {
      labelById.set(p.id, s(p.nickname) || s(p.username));
    }
  }
  const memberLabel = (uid: string) => labelById.get(uid) || `회원 ${uid.replace(/-/g, "").slice(0, 8)}`;
  const byRoom = new Map<string, typeof participants>();
  for (const p of participants) {
    const list = byRoom.get(p.room_id) ?? [];
    list.push(p);
    byRoom.set(p.room_id, list);
  }

  const rows = page.map<AdminChatRoomListRow>((room) => {
    const ps = byRoom.get(room.id) ?? [];
    const members = ps.map((p) => ({
      userId: p.user_id,
      label: memberLabel(p.user_id),
      role: s(p.store_order_role) || s(p.role) || "member",
    }));
    const title =
      s(room.title) ||
      (room.room_type === "direct" || room.chat_domain === "trade" || room.chat_domain === "store_order"
        ? members.slice(0, 2).map((m) => m.label).join(", ")
        : "");
    return {
      id: room.id,
      chatDomain: s(room.chat_domain),
      roomType: s(room.room_type),
      roomStatus: s(room.room_status) || "active",
      isReadonly: room.is_readonly === true,
      title,
      memberCount: ps.length,
      members: members.slice(0, 6),
      lastMessage: s(resolveRoomLastMessageForViewer(room.last_message, null)),
      lastMessageType: s(room.last_message_type),
      lastMessageAt: s(room.last_message_at),
      createdAt: s(room.created_at),
      openReportCount: reportCount.get(room.id) ?? 0,
    };
  });
  return { rows, nextCursor };
}
