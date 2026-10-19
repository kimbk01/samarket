/**
 * 채팅방 하드 삭제 전 신고 증거 조회 (서버 전용) — 일괄 삭제·모임 부가 채팅 삭제 공용.
 *
 * - 요청 id 와 **연결된 레거시 방 id**(product_chats ↔ chat_rooms: 같은 상품·판매자·구매자)까지 함께 검사한다.
 *   운영 FK: `reports.room_id → product_chats` SET NULL, `chat_reports` 는 chat_rooms FK 없음 →
 *   한쪽만 지우면 다른 쪽에 걸린 신고의 연결이 끊긴다.
 * - 테이블 부재는 0건, 그 외 조회 실패는 `ok:false` (호출부는 삭제 중단 — fail closed).
 * - 반환 `evidenceRoomIds` 는 **요청 id 기준** (연결 id 에 증거가 있으면 요청 id 를 표시).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatRoomEvidenceCounts = { chat_reports: number; reports: number; moderation_actions: number };

export type ChatRoomEvidenceLookup =
  | {
      ok: true;
      evidenceRoomIds: Set<string>;
      counts: ChatRoomEvidenceCounts;
      /** 요청 id → 함께 검사한 연결 id */
      linkedIds: Record<string, string[]>;
    }
  | { ok: false; error: "evidence_lookup_failed" };

function isMissingTable(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|42P01/i.test(message));
}

type TradeKey = { post: string; seller: string; buyer: string };

async function linkedLegacyRoomIds(sb: SupabaseClient, id: string): Promise<string[]> {
  const out = new Set<string>();
  const db = sb as SupabaseClient<any>;
  const pc = await db.from("product_chats").select("post_id, seller_id, buyer_id").eq("id", id).maybeSingle();
  const pcRow = (pc.data ?? null) as { post_id?: string; seller_id?: string; buyer_id?: string } | null;
  if (pcRow?.post_id && pcRow.seller_id && pcRow.buyer_id) {
    const key: TradeKey = { post: pcRow.post_id, seller: pcRow.seller_id, buyer: pcRow.buyer_id };
    const cr = await db
      .from("chat_rooms")
      .select("id")
      .eq("room_type", "item_trade")
      .eq("item_id", key.post)
      .eq("seller_id", key.seller)
      .eq("buyer_id", key.buyer);
    for (const r of (cr.data ?? []) as Array<{ id: string }>) out.add(r.id);
  }
  const room = await db.from("chat_rooms").select("item_id, seller_id, buyer_id, room_type").eq("id", id).maybeSingle();
  const crRow = (room.data ?? null) as { item_id?: string; seller_id?: string; buyer_id?: string; room_type?: string } | null;
  if (crRow?.room_type === "item_trade" && crRow.item_id && crRow.seller_id && crRow.buyer_id) {
    const pcs = await db
      .from("product_chats")
      .select("id")
      .eq("post_id", crRow.item_id)
      .eq("seller_id", crRow.seller_id)
      .eq("buyer_id", crRow.buyer_id);
    for (const r of (pcs.data ?? []) as Array<{ id: string }>) out.add(r.id);
  }
  out.delete(id);
  return [...out];
}

export async function lookupChatRoomEvidence(
  sb: SupabaseClient,
  requestedIds: readonly string[]
): Promise<ChatRoomEvidenceLookup> {
  const linkedIds: Record<string, string[]> = {};
  const ownerOf = new Map<string, string>();
  for (const id of requestedIds) {
    ownerOf.set(id, id);
    const linked = await linkedLegacyRoomIds(sb, id);
    linkedIds[id] = linked;
    for (const l of linked) if (!ownerOf.has(l)) ownerOf.set(l, id);
  }
  const allIds = [...ownerOf.keys()];
  const evidenceRoomIds = new Set<string>();
  const counts: ChatRoomEvidenceCounts = { chat_reports: 0, reports: 0, moderation_actions: 0 };
  const mark = (roomId: string | null | undefined) => {
    const owner = roomId ? ownerOf.get(roomId) : undefined;
    if (owner) evidenceRoomIds.add(owner);
  };
  if (allIds.length === 0) return { ok: true, evidenceRoomIds, counts, linkedIds };

  const chatReports = await sb.from("chat_reports").select("id, room_id").in("room_id", allIds);
  if (chatReports.error && !isMissingTable(chatReports.error.message)) return { ok: false, error: "evidence_lookup_failed" };
  for (const row of (chatReports.data ?? []) as Array<{ room_id?: string | null }>) {
    mark(row.room_id);
    counts.chat_reports += 1;
  }

  const reportsByRoom = await sb.from("reports").select("id, room_id").in("room_id", allIds);
  if (reportsByRoom.error && !isMissingTable(reportsByRoom.error.message)) return { ok: false, error: "evidence_lookup_failed" };
  const reportsByTarget = await sb
    .from("reports")
    .select("id, target_id")
    .eq("target_type", "chat_room")
    .in("target_id", allIds);
  if (reportsByTarget.error && !isMissingTable(reportsByTarget.error.message)) {
    return { ok: false, error: "evidence_lookup_failed" };
  }
  const reportIds = new Set<string>();
  for (const row of (reportsByRoom.data ?? []) as Array<{ id: string; room_id?: string | null }>) {
    mark(row.room_id);
    reportIds.add(row.id);
  }
  for (const row of (reportsByTarget.data ?? []) as Array<{ id: string; target_id?: string | null }>) {
    mark(row.target_id);
    reportIds.add(row.id);
  }
  counts.reports = reportIds.size;

  const modActions = await sb
    .from("moderation_actions")
    .select("id", { count: "exact", head: true })
    .eq("target_type", "room")
    .in("target_id", allIds);
  if (modActions.error && !isMissingTable(modActions.error.message)) return { ok: false, error: "evidence_lookup_failed" };
  counts.moderation_actions = Number(modActions.count ?? 0);

  return { ok: true, evidenceRoomIds, counts, linkedIds };
}
