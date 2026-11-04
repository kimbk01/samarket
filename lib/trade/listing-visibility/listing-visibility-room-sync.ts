import "server-only";
/**
 * 서버 전용 — 거래 글 공개 자격이 바뀔 때 그 글의 거래 채팅방 정보(`community_messenger_rooms.summary`)의
 * 글 상태 문구(`itemStateLabel`)를 맞춘다 (2차 실기 D1 · 설계 G2 2026-11-04).
 * 방 정보는 방을 만들 때 한 번 저장돼, 숨김·삭제 뒤에도 「판매중」이 남았다(운영 422개 중 415개).
 * - 바꾸는 칸 = `itemStateLabel` 하나. 제목·가격·사진·역할 등 다른 칸·`updated_at`(방 순서)은 그대로.
 * - 실패해도 조치(숨김·삭제)는 그대로다 — 방 화면은 상세 글 상태로도 판정한다(G1).
 * - 방 찾기 = `product_chats(post_id → community_messenger_room_id)` 인덱스 (최종 결함 F3 — 방 표 전체 LIKE 탐색 대체).
 *   거래방 summary 의 postId 는 product_chats 에서 채워지고, product_chats 는 posts 외래키가 없어 글을 지워도 남는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getChatListingItemStateLabel } from "@/lib/products/seller-listing-state";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";

/** `.in()` 한 번에 넣는 id 수 */
export const ROOM_SYNC_CHUNK = 200;
/** 방 저장 동시 요청 수 */
export const ROOM_SYNC_WRITE_CONCURRENCY = 4;
/** 글이 없을 때(영구삭제) 문구 */
export const ROOM_SYNC_DELETED_LABEL = "삭제됨";

/** 방 정보 JSON 한 개 → 글 상태 문구만 바꾼 새 JSON (해당 없으면 null) */
export function patchTradeRoomSummaryItemStateLabel(raw: string, postId: string, label: string): string | null {
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (obj.kind !== "trade" || obj.postId !== postId) return null;
  if (obj.itemStateLabel === label) return null;
  return JSON.stringify({ ...obj, itemStateLabel: label });
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * 여러 글의 거래방 문구를 한 번에 맞춘다 — 글 상태 읽기·방 찾기·방 읽기를 각각 200개씩 묶어 조회.
 * 글이 없으면(영구삭제) 「삭제됨」.
 */
export async function syncTradeRoomItemStateLabelsForPosts(
  postIds: string[],
  sbIn?: SupabaseClient | null
): Promise<{ updated: number; failed: number } | null> {
  const ids = [...new Set(postIds.map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) return null;
  const sb = sbIn ?? resolveServiceSupabaseForApi();
  if (!sb) return null;

  let failed = 0;
  const labelByPost = new Map<string, string>();
  const roomPost = new Map<string, Set<string>>();
  for (const part of chunk(ids, ROOM_SYNC_CHUNK)) {
    const { data: posts, error: postErr } = await sb
      .from("posts")
      .select("id, status, seller_listing_state")
      .in("id", part);
    if (postErr) return { updated: 0, failed: failed + 1 };
    for (const p of (posts ?? []) as { id: string; status?: string | null; seller_listing_state?: string | null }[]) {
      labelByPost.set(String(p.id), getChatListingItemStateLabel(p.seller_listing_state, p.status ?? undefined));
    }
    const { data: links, error: linkErr } = await sb
      .from("product_chats")
      .select("post_id, community_messenger_room_id")
      .in("post_id", part)
      .not("community_messenger_room_id", "is", null);
    if (linkErr) return { updated: 0, failed: failed + 1 };
    for (const l of (links ?? []) as { post_id: string; community_messenger_room_id: string | null }[]) {
      const roomId = String(l.community_messenger_room_id ?? "").trim();
      if (!roomId) continue;
      const set = roomPost.get(roomId) ?? new Set<string>();
      set.add(String(l.post_id));
      roomPost.set(roomId, set);
    }
  }

  const writes: { id: string; summary: string }[] = [];
  for (const part of chunk([...roomPost.keys()], ROOM_SYNC_CHUNK)) {
    const { data: rooms, error } = await sb.from("community_messenger_rooms").select("id, summary").in("id", part);
    if (error) {
      failed += 1;
      continue;
    }
    for (const r of (rooms ?? []) as { id: string; summary: string | null }[]) {
      for (const postId of roomPost.get(String(r.id)) ?? []) {
        const label = labelByPost.get(postId) ?? ROOM_SYNC_DELETED_LABEL;
        const next = patchTradeRoomSummaryItemStateLabel(String(r.summary ?? ""), postId, label);
        if (next) writes.push({ id: String(r.id), summary: next });
      }
    }
  }

  let updated = 0;
  await runLimited(writes, ROOM_SYNC_WRITE_CONCURRENCY, async (w) => {
    const { error: upErr } = await sb.from("community_messenger_rooms").update({ summary: w.summary }).eq("id", w.id);
    if (upErr) failed += 1;
    else updated += 1;
  });
  return { updated, failed };
}

export async function syncTradeRoomItemStateLabels(
  postId: string,
  sbIn?: SupabaseClient | null
): Promise<{ updated: number; failed: number } | null> {
  return syncTradeRoomItemStateLabelsForPosts([postId], sbIn);
}
