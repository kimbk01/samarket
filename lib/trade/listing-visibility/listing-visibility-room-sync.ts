import "server-only";
/**
 * 서버 전용 — 거래 글 공개 자격이 바뀔 때 그 글의 거래 채팅방 정보(`community_messenger_rooms.summary`)의
 * 글 상태 문구(`itemStateLabel`)를 맞춘다 (2차 실기 D1 · 설계 G2 2026-11-04).
 * 방 정보는 방을 만들 때 한 번 저장돼, 숨김·삭제 뒤에도 「판매중」이 남았다(운영 422개 중 415개).
 * - 바꾸는 칸 = `itemStateLabel` 하나. 제목·가격·사진·역할 등 다른 칸·`updated_at`(방 순서)은 그대로.
 * - 실패해도 조치(숨김·삭제)는 그대로다 — 방 화면은 상세 글 상태로도 판정한다(G1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getChatListingItemStateLabel } from "@/lib/products/seller-listing-state";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";

const ROOM_SCAN_LIMIT = 500;

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

export async function syncTradeRoomItemStateLabels(
  postId: string,
  sbIn?: SupabaseClient | null
): Promise<{ updated: number; failed: number } | null> {
  const id = postId.trim();
  if (!id) return null;
  const sb = sbIn ?? resolveServiceSupabaseForApi();
  if (!sb) return null;
  const { data: post } = await sb.from("posts").select("status, seller_listing_state").eq("id", id).maybeSingle();
  const row = post as { status?: string | null; seller_listing_state?: string | null } | null;
  const label = row ? getChatListingItemStateLabel(row.seller_listing_state, row.status ?? undefined) : "삭제됨";
  const { data: rooms, error } = await sb
    .from("community_messenger_rooms")
    .select("id, summary")
    .like("summary", `%"postId":"${id}"%`)
    .limit(ROOM_SCAN_LIMIT);
  if (error || !Array.isArray(rooms)) return { updated: 0, failed: 1 };
  let updated = 0;
  let failed = 0;
  for (const r of rooms as { id: string; summary: string | null }[]) {
    const next = patchTradeRoomSummaryItemStateLabel(String(r.summary ?? ""), id, label);
    if (!next) continue;
    const { error: upErr } = await sb.from("community_messenger_rooms").update({ summary: next }).eq("id", r.id);
    if (upErr) failed += 1;
    else updated += 1;
  }
  return { updated, failed };
}
