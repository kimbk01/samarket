import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 오픈채팅 비밀번호 입장 잠금 (모임 감사 5번 묶음 P3 · docs/audit/moim-bundle5-design-2026-11-28.md)
 * 방·계정마다 15분 안에 5번까지만 비밀번호를 검사하고, 5번째 시도에서 15분 잠근다.
 * 운영에 Redis 가 없어(메모리 제한은 서버마다 따로 셈) 운영 DB 에 센다.
 * 재감사 M1: 비밀번호를 검사하기 **전에** 센다(`cm_open_group_join_begin` 한 문장) — 동시 요청도 창마다 5번까지만 검사.
 * 맞으면 `cm_open_group_join_clear` 로 기록을 지운다. 둘 다 service_role 전용.
 * 비밀번호 방 입장에서만 부른다 — 자유 입장 방은 요청이 늘지 않는다.
 */

export const OPEN_GROUP_JOIN_LOCK_MINUTES = 15;

function futureIso(v: unknown): string | null {
  const s = typeof v === "string" ? v : null;
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) && ms > Date.now() ? new Date(ms).toISOString() : null;
}

/** 비밀번호 검사 직전 1회. allowed=false 면 검사하지 않는다. lockedUntil 이 있으면 이번 시도가 틀릴 때 잠금 안내. 오류는 막는 쪽으로. */
export async function beginOpenGroupJoinAttempt(
  sb: SupabaseClient,
  roomId: string,
  userId: string
): Promise<{ ok: true; allowed: boolean; lockedUntil: string | null } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc("cm_open_group_join_begin", { p_room: roomId, p_user: userId });
  if (error) return { ok: false, error: "join_lock_check_failed" };
  const row = (data ?? null) as { allowed?: unknown; locked_until?: unknown } | null;
  if (!row || typeof row.allowed !== "boolean") return { ok: false, error: "join_lock_check_failed" };
  return { ok: true, allowed: row.allowed, lockedUntil: futureIso(row.locked_until) };
}

/** 비밀번호가 맞았을 때 1회 — 시도 기록 삭제(잠금도 풀림). */
export async function clearOpenGroupJoinAttempts(
  sb: SupabaseClient,
  roomId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.rpc("cm_open_group_join_clear", { p_room: roomId, p_user: userId });
  if (error) return { ok: false, error: "join_lock_record_failed" };
  return { ok: true };
}

export function openGroupJoinRetryAfterSec(lockedUntil: string): number {
  return Math.max(1, Math.ceil((Date.parse(lockedUntil) - Date.now()) / 1000));
}
