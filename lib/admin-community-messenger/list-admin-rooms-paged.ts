/**
 * 채팅 Admin 방 목록 — 서버 페이지네이션 (C-11 · C-15).
 * SSOT = `community_messenger_rooms` (일반 1:1 · 그룹 · 거래 · 배달 주문 모두 같은 테이블, `chat_domain`).
 * keyset (last_message_at DESC NULLS LAST, id DESC) · 검색(방 제목·참여자 닉네임·방 ID·회원 ID) ·
 * `user_id` 참여자 필터 · 미처리 신고 방 필터. 메시지 본문은 읽지 않는다.
 * Server-only (service-role client) — client 컴포넌트에서 import 금지.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
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
  /** 본문 미리보기는 반환하지 않는다 (고스트 규칙 — 본문은 방 상세 열람 정책·감사 경유). */
  lastMessageType: string;
  lastMessageAt: string;
  createdAt: string;
  openReportCount: number;
  /** 연결 대상 (설계 §3-4): 거래 = 상품, 배달 = 주문번호·매장 */
  linked: { kind: "trade"; postId: string; title: string } | { kind: "store_order"; orderId: string; orderNo: string; storeName: string } | null;
};

export type AdminChatRoomListPage = {
  rows: AdminChatRoomListRow[];
  nextCursor: string | null;
  /** 쪽 번호 모드(`offset` 지정)에서만 — 조건에 맞는 전체 방 수 (`count: "exact"`). */
  total?: number;
};

/** R7 목록 표준 — `offset` 을 주면 keyset 대신 쪽 번호(limit/offset) + 전체 건수. */
export type AdminChatRoomListPaging = { offset?: number | null };

const ROOM_SELECT =
  "id, chat_domain, room_type, room_status, is_readonly, title, created_by, owner_user_id, domain_identity_key, direct_key, last_message_type, last_message_at, created_at";

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
  domain_identity_key: string | null;
  direct_key: string | null;
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

/** 거래 딥링크 → CM 방 id (domain_identity_key · product_chats FK · chat_rooms FK). */
async function roomIdsForTrade(
  sb: ReturnType<typeof getSupabaseServer>,
  q: { postId: string; sellerId: string; buyerId: string }
): Promise<Set<string>> {
  const out = new Set<string>();
  const key = `trade:${q.postId}:${q.sellerId || "%"}:${q.buyerId || "%"}`;
  const byKey = await sb.from("community_messenger_rooms").select("id").like("domain_identity_key", key).limit(500);
  if (byKey.error) throw new Error(byKey.error.message);
  for (const r of (byKey.data ?? []) as Array<{ id: string }>) out.add(r.id);
  let pc = sb.from("product_chats").select("community_messenger_room_id").eq("post_id", q.postId);
  if (q.sellerId) pc = pc.eq("seller_id", q.sellerId);
  if (q.buyerId) pc = pc.eq("buyer_id", q.buyerId);
  const pcRes = await pc.limit(500);
  for (const r of (pcRes.data ?? []) as Array<{ community_messenger_room_id: string | null }>) {
    if (s(r.community_messenger_room_id)) out.add(s(r.community_messenger_room_id));
  }
  let cr = sb.from("chat_rooms").select("community_messenger_room_id").eq("room_type", "item_trade").eq("item_id", q.postId);
  if (q.sellerId) cr = cr.eq("seller_id", q.sellerId);
  if (q.buyerId) cr = cr.eq("buyer_id", q.buyerId);
  const crRes = await cr.limit(500);
  for (const r of (crRes.data ?? []) as Array<{ community_messenger_room_id: string | null }>) {
    if (s(r.community_messenger_room_id)) out.add(s(r.community_messenger_room_id));
  }
  return out;
}

/** 배달 주문 딥링크 → CM 방 id (주문 FK · domain_identity_key · direct_key). */
async function roomIdsForStoreOrder(sb: ReturnType<typeof getSupabaseServer>, orderId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const order = await sb.from("store_orders").select("community_messenger_room_id").eq("id", orderId).maybeSingle();
  const fk = s((order.data as { community_messenger_room_id?: string | null } | null)?.community_messenger_room_id);
  if (fk) out.add(fk);
  const byKey = await sb
    .from("community_messenger_rooms")
    .select("id")
    .or(
      `domain_identity_key.eq.store_order:${orderId},direct_key.eq.store_order:${orderId},direct_key.eq.trade_order:${orderId}`
    )
    .limit(20);
  if (byKey.error) throw new Error(byKey.error.message);
  for (const r of (byKey.data ?? []) as Array<{ id: string }>) out.add(r.id);
  return out;
}

const TRADE_KEY_RE = /^trade:([0-9a-f-]{36}):/i;
const ORDER_KEY_RE = /^(?:store_order|trade_order):([0-9a-f-]{36})$/i;

/** 페이지 행의 연결 대상 (상품 제목 · 주문번호·매장명) — 페이지 단위 2~3회 조회. */
async function loadLinkedTargets(
  sb: ReturnType<typeof getSupabaseServer>,
  rows: RoomRow[]
): Promise<Map<string, AdminChatRoomListRow["linked"]>> {
  const out = new Map<string, AdminChatRoomListRow["linked"]>();
  const postByRoom = new Map<string, string>();
  const orderByRoom = new Map<string, string>();
  const storeOrderRooms: string[] = [];
  for (const r of rows) {
    if (r.chat_domain === "trade") {
      const m = TRADE_KEY_RE.exec(s(r.domain_identity_key));
      if (m) postByRoom.set(r.id, m[1].toLowerCase());
    } else if (r.chat_domain === "store_order") {
      storeOrderRooms.push(r.id);
      const m = ORDER_KEY_RE.exec(s(r.domain_identity_key)) ?? ORDER_KEY_RE.exec(s(r.direct_key));
      if (m) orderByRoom.set(r.id, m[1].toLowerCase());
    }
  }
  const postIds = [...new Set(postByRoom.values())];
  const [posts, ordersByFk] = await Promise.all([
    postIds.length
      ? sb.from(POSTS_TABLE_READ).select("id, title").in("id", postIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title?: string | null }> }),
    storeOrderRooms.length
      ? sb.from("store_orders").select("id, order_no, store_id, community_messenger_room_id").in("community_messenger_room_id", storeOrderRooms)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const titleById = new Map<string, string>();
  for (const p of (posts.data ?? []) as Array<{ id: string; title?: string | null }>) titleById.set(p.id, s(p.title));
  for (const [roomId, postId] of postByRoom) {
    out.set(roomId, { kind: "trade", postId, title: titleById.get(postId) ?? "" });
  }
  type OrderRow = { id: string; order_no?: string | null; store_id?: string | null; community_messenger_room_id?: string | null };
  const orderRows = [...((ordersByFk.data ?? []) as OrderRow[])];
  const fkRoomIds = new Set(orderRows.map((o) => s(o.community_messenger_room_id)));
  const missingOrderIds = [...orderByRoom.entries()].filter(([roomId]) => !fkRoomIds.has(roomId)).map(([, id]) => id);
  if (missingOrderIds.length) {
    const more = await sb.from("store_orders").select("id, order_no, store_id, community_messenger_room_id").in("id", missingOrderIds);
    orderRows.push(...((more.data ?? []) as OrderRow[]));
  }
  const storeIds = [...new Set(orderRows.map((o) => s(o.store_id)).filter(Boolean))];
  const stores = storeIds.length ? await sb.from("stores").select("id, store_name").in("id", storeIds) : { data: [] };
  const storeName = new Map<string, string>();
  for (const st of (stores.data ?? []) as Array<{ id: string; store_name?: string | null }>) storeName.set(st.id, s(st.store_name));
  const orderById = new Map(orderRows.map((o) => [o.id, o]));
  for (const roomId of storeOrderRooms) {
    const o =
      orderRows.find((x) => s(x.community_messenger_room_id) === roomId) ??
      (orderByRoom.get(roomId) ? orderById.get(orderByRoom.get(roomId)!) : undefined);
    if (o) {
      out.set(roomId, {
        kind: "store_order",
        orderId: o.id,
        orderNo: s(o.order_no),
        storeName: storeName.get(s(o.store_id)) ?? "",
      });
    }
  }
  return out;
}

export async function listAdminChatRoomsPaged(
  query: AdminChatRoomListQuery,
  limit: number,
  paging: AdminChatRoomListPaging = {}
): Promise<AdminChatRoomListPage> {
  const sb = getSupabaseServer();
  const offsetMode = typeof paging.offset === "number" && Number.isFinite(paging.offset) && paging.offset >= 0;
  const offset = offsetMode ? Math.floor(paging.offset as number) : 0;
  const empty = (): AdminChatRoomListPage => (offsetMode ? { rows: [], nextCursor: null, total: 0 } : { rows: [], nextCursor: null });

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
  if (query.postId) {
    restrict = intersect(
      restrict,
      await roomIdsForTrade(sb, { postId: query.postId, sellerId: query.sellerId, buyerId: query.buyerId })
    );
  }
  if (query.orderId) {
    restrict = intersect(restrict, await roomIdsForStoreOrder(sb, query.orderId));
  }
  const q = query.q;
  const qIsUuid = isAdminUuid(q);
  if (q && qIsUuid) {
    const ids = await roomIdsForUsers(sb, [q.toLowerCase()]);
    ids.add(q.toLowerCase());
    restrict = intersect(restrict, ids);
  }
  if (restrict && restrict.size === 0) return empty();

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

  // 3) keyset 조건 — 정렬 열: 최근 메시지(기본) · 생성 시각(`sort=created`)
  const col = query.sort === "created" ? "created_at" : "last_message_at";
  const cursor = offsetMode ? null : decodeAdminKeysetCursor(query.cursor);
  let keysetOr: string | null = null;
  if (cursor?.ts) {
    keysetOr = `${col}.lt.${quote(cursor.ts)},and(${col}.eq.${quote(cursor.ts)},id.lt.${cursor.id}),${col}.is.null`;
  }

  let rq = sb
    .from("community_messenger_rooms")
    .select(ROOM_SELECT, offsetMode ? { count: "exact" } : undefined)
    .order(col, { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  rq = offsetMode ? rq.range(offset, offset + limit - 1) : rq.limit(limit + 1);
  if (query.type !== "all") rq = rq.eq("chat_domain", query.type);
  if (query.status) rq = rq.eq("room_status", query.status);
  // 대시보드 지표와 같은 경계 (마닐라 자정 기준) — chat-metrics 의 같은 함수.
  if (query.activity === "7d") rq = rq.gte("last_message_at", chatActiveWindowFromIso());
  if (query.idleDays > 0) rq = rq.lt("last_message_at", chatIdleCutoffIso(new Date(), query.idleDays));
  if (restrict) rq = rq.in("id", [...restrict].slice(0, MAX_ID_CANDIDATES));
  if (cursor && !cursor.ts) rq = rq.is(col, null).lt("id", cursor.id);
  if (textOr && keysetOr) rq = rq.or(`and(or(${textOr}),or(${keysetOr}))`);
  else if (textOr) rq = rq.or(textOr);
  else if (keysetOr) rq = rq.or(keysetOr);

  const { data: roomData, error, count } = await rq;
  if (error) throw new Error(error.message);
  const all = (roomData ?? []) as RoomRow[];
  const page = all.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    !offsetMode && all.length > limit && last
      ? encodeAdminKeysetCursor({ ts: s(col === "created_at" ? last.created_at : last.last_message_at), id: last.id })
      : null;
  const total = offsetMode ? (typeof count === "number" ? count : offset + page.length) : undefined;
  if (!page.length) return offsetMode ? { rows: [], nextCursor: null, total } : { rows: [], nextCursor: null };

  // 4) 페이지 단위 보조 조회 — 참여자 · 미처리 신고 수 · 프로필
  const roomIds = page.map((r) => r.id);
  const [{ data: partData, error: partErr }, { data: repData }, linkedByRoom] = await Promise.all([
    sb
      .from("community_messenger_participants")
      .select("room_id, user_id, role, store_order_role, joined_at")
      .in("room_id", roomIds),
    sb
      .from("community_messenger_reports")
      .select("room_id")
      .in("room_id", roomIds)
      .in("status", [...OPEN_CM_REPORT_STATUSES]),
    loadLinkedTargets(sb, page),
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
      lastMessageType: s(room.last_message_type),
      lastMessageAt: s(room.last_message_at),
      createdAt: s(room.created_at),
      openReportCount: reportCount.get(room.id) ?? 0,
      linked: linkedByRoom.get(room.id) ?? null,
    };
  });
  return offsetMode ? { rows, nextCursor, total } : { rows, nextCursor };
}
