import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicProfileHidden } from "@/lib/users/public-profile-exposure";

/**
 * 관심이웃 목록·개수의 단일 정의 (설계 C · 전체 수정 설계 v2 §5-3).
 * 저장된 neighbor_follow 행 = 보이는 관심이웃 — 탈퇴·삭제·차단 상대를 가리키는 행은 **DB 가 지운다**
 * (`supabase/migrations/20271128250000_neighbor_follow_invariants.sql`: 차단·탈퇴·삭제 트리거, 추가는 `neighbor_follow_set_for`).
 * 그래서 여기서는 프로필·차단을 다시 거르지 않는다(예전: 목록만 걸러 상한·피드·메신저와 수가 달랐다 — 감사 D9·R2).
 * `type`·`relation_type` 은 CHECK 로 항상 같다 — `type` 으로 거른다(R3).
 *
 * 보이는 관심이웃 = 공개 프로필과 같은 규칙 하나(Owner 결정 2 「권장안대로」 2026-11-28):
 * 로그인이 막힌 회원(운영자 이용 제한·탈퇴 — `isPublicProfileHidden`)은 목록·개수에서 숨긴다. 행은 지우지 않는다
 * (제한이 풀리면 다시 보인다). 쓰기만 막힌 정지 회원은 그대로 보인다. 상한 100 은 저장 행 기준(DB 함수) 그대로.
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
  const visible = await visibleNeighborTargetIds(sb, rows.map((r) => r.targetId));
  if (!visible.ok) return visible;
  return { ok: true, rows: rows.filter((r) => visible.ids.has(r.targetId)) };
}

/** 공개 프로필이 보이는 대상만 — 조회 오류면 오류(숨김 판정을 건너뛰어 다 보여 주지 않는다) */
async function visibleNeighborTargetIds(
  sb: Parameters<typeof listNeighborFollowRows>[0],
  targetIds: string[],
): Promise<{ ok: true; ids: Set<string> } | { ok: false; error: string }> {
  const ids = [...new Set(targetIds)];
  if (ids.length === 0) return { ok: true, ids: new Set() };
  const { data, error } = await sb.from("profiles").select("id, status, deleted_at").in("id", ids);
  if (error) return { ok: false, error: error.message ?? "neighbor_profile_fetch_failed" };
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ id?: string; status?: string | null; deleted_at?: string | null }>) {
    const id = String(row.id ?? "").trim();
    if (id && !isPublicProfileHidden(row)) out.add(id);
  }
  return { ok: true, ids: out };
}

/** 내가 맺은 관심이웃 수(보이는 것만) — 화면 「n / 100」·내정보 요약 공통. 목록과 같은 정의(`listNeighborFollowRows`). 오류면 null */
export async function countNeighborFollows(sb: SupabaseClient<any>, userId: string): Promise<number | null> {
  const r = await listNeighborFollowRows(sb, userId);
  return r.ok ? r.rows.length : null;
}
