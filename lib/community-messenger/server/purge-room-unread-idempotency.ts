import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 2026-11-19 재감사 D — 읽음·보내기 중복 방지 기록(`dibay_room_unread_idempotency`) 7일 보존.
 * 매일 메신저 정리 예약 작업에서 1번(Supabase 1건). 실패해도 그날 연락처 정리는 그대로 진행한다.
 * 함수가 아직 운영에 없으면(마이그레이션 전) 오류만 기록하고 넘어간다.
 */
export const ROOM_UNREAD_IDEMPOTENCY_KEEP_DAYS = 7;

export async function purgeRoomUnreadIdempotency(
  sb: SupabaseClient
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  try {
    const { data, error } = await sb.rpc("dibay_purge_room_unread_idempotency", {
      p_keep_days: ROOM_UNREAD_IDEMPOTENCY_KEEP_DAYS,
    });
    if (error) return { ok: false, error: error.message || "rpc_failed" };
    const n = typeof data === "number" ? data : Number(data);
    return { ok: true, deleted: Number.isFinite(n) ? n : 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "rpc_threw" };
  }
}
