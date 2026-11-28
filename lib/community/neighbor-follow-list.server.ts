import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 관심이웃 목록·개수의 단일 정의 (설계 C · 전체 수정 설계 v2 §5-3).
 * 저장된 neighbor_follow 행 = 보이는 관심이웃 — 탈퇴·삭제·차단 상대를 가리키는 행은 **DB 가 지운다**
 * (`supabase/migrations/20271128250000_neighbor_follow_invariants.sql`: 차단·탈퇴·삭제 트리거, 추가는 `neighbor_follow_set_for`).
 * 그래서 여기서는 프로필·차단을 다시 거르지 않는다(예전: 목록만 걸러 상한·피드·메신저와 수가 달랐다 — 감사 D9·R2).
 * `type`·`relation_type` 은 CHECK 로 항상 같다 — `type` 으로 거른다(R3).
 */
export type NeighborFollowRow = { id: string; targetId: string; createdAt: string };

export type NeighborFollowRowsResult =
  | { ok: true; rows: NeighborFollowRow[] }
  | { ok: false; error: string };

export async function listNeighborFollowRows(
  sb: SupabaseClient<any>,
  userId: string,
): Promise<NeighborFollowRowsResult> {
  const uid = userId.trim();
  if (!uid) return { ok: true, rows: [] };

  const { data, error } = await sb
    .from("user_relationships")
    .select("id, target_user_id, created_at")
    .eq("user_id", uid)
    .eq("type", "neighbor_follow")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message ?? "neighbor_fetch_failed" };

  const rows = ((data ?? []) as Array<{ id?: string; target_user_id?: string; created_at?: string }>)
    .map((r) => ({
      id: String(r.id ?? "").trim(),
      targetId: String(r.target_user_id ?? "").trim(),
      createdAt: String(r.created_at ?? ""),
    }))
    .filter((r) => r.id && r.targetId && r.targetId !== uid);
  return { ok: true, rows };
}

/** 내가 맺은 관심이웃 수 — 화면 「n / 100」·내정보 요약 공통(상한 판정은 DB 함수 안에서 같은 기준). 오류면 null */
export async function countNeighborFollows(sb: SupabaseClient<any>, userId: string): Promise<number | null> {
  const uid = userId.trim();
  if (!uid) return 0;
  const { count, error } = await sb
    .from("user_relationships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("type", "neighbor_follow");
  if (error) return null;
  return typeof count === "number" ? count : 0;
}
