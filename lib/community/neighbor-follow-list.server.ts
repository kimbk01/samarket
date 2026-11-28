import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBlockedAuthorIdsForViewer } from "@/lib/neighborhood/social-filter";

/**
 * 관심이웃 목록·개수·글 거름의 단일 정의 (설계 C).
 * 보이는 관심이웃 = 내가 맺은 neighbor_follow 중 — 프로필이 있고, 탈퇴(`status='deleted'`·`deleted_at`)가 아니고,
 * 양방향 차단 관계가 아닌 대상. (레거시 FAQ 102: 상대가 탈퇴하면 목록에서 제외)
 */
export type NeighborFollowRow = { id: string; targetId: string; createdAt: string };

export type NeighborFollowRowsResult =
  | { ok: true; rows: NeighborFollowRow[] }
  | { ok: false; error: string };

export async function listVisibleNeighborFollowRows(
  sb: SupabaseClient<any>,
  userId: string,
): Promise<NeighborFollowRowsResult> {
  const uid = userId.trim();
  if (!uid) return { ok: true, rows: [] };

  const { data, error } = await sb
    .from("user_relationships")
    .select("id, target_user_id, created_at")
    .eq("user_id", uid)
    .or("relation_type.eq.neighbor_follow,type.eq.neighbor_follow")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message ?? "neighbor_fetch_failed" };

  const raw = ((data ?? []) as Array<{ id?: string; target_user_id?: string; created_at?: string }>)
    .map((r) => ({
      id: String(r.id ?? "").trim(),
      targetId: String(r.target_user_id ?? "").trim(),
      createdAt: String(r.created_at ?? ""),
    }))
    .filter((r) => r.id && r.targetId && r.targetId !== uid);
  if (raw.length === 0) return { ok: true, rows: [] };

  const targetIds = [...new Set(raw.map((r) => r.targetId))];
  const [profilesRes, blocked] = await Promise.all([
    sb.from("profiles").select("id, status, deleted_at").in("id", targetIds),
    fetchBlockedAuthorIdsForViewer(sb, uid),
  ]);
  if (profilesRes.error) return { ok: false, error: profilesRes.error.message ?? "profile_fetch_failed" };

  const alive = new Set<string>();
  for (const p of (profilesRes.data ?? []) as Array<{ id?: string; status?: string | null; deleted_at?: string | null }>) {
    const id = String(p.id ?? "").trim();
    if (!id) continue;
    if (String(p.status ?? "").trim() === "deleted") continue;
    if (p.deleted_at) continue;
    alive.add(id);
  }
  return { ok: true, rows: raw.filter((r) => alive.has(r.targetId) && !blocked.has(r.targetId)) };
}

/** 내가 맺은 관심이웃 행 수 (상한 판정용 — 탈퇴·차단 제외 전 저장 행 기준) */
export async function countStoredNeighborFollows(sb: SupabaseClient<any>, userId: string): Promise<number | null> {
  const { count, error } = await sb
    .from("user_relationships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId.trim())
    .or("relation_type.eq.neighbor_follow,type.eq.neighbor_follow");
  if (error) return null;
  return typeof count === "number" ? count : 0;
}

/**
 * 두 회원 사이 관심이웃 행을 양쪽 모두 지운다 — 차단(모든 경로)·탈퇴·영구 삭제 공통 (설계 C).
 * 실패는 호출 쪽 본 동작을 막지 않는다(로그만). `type`·`relation_type` 은 NOT NULL·항상 같은 값(운영 2026-11-28 조회),
 * 유일 인덱스가 `type` 기준이라 `type` 으로 거른다.
 */
export async function deleteNeighborFollowsBetween(
  sb: SupabaseClient<any>,
  userA: string,
  userB: string,
): Promise<void> {
  const a = userA.trim();
  const b = userB.trim();
  if (!a || !b || a === b) return;
  try {
    const { error } = await sb
      .from("user_relationships")
      .delete()
      .eq("type", "neighbor_follow")
      .or(`and(user_id.eq.${a},target_user_id.eq.${b}),and(user_id.eq.${b},target_user_id.eq.${a})`);
    if (error) console.error("[neighbor-follow] delete between failed", error.message);
  } catch (e) {
    console.error("[neighbor-follow] delete between threw", e instanceof Error ? e.message : e);
  }
}

/** 한 회원이 맺은·받은 관심이웃 행 전부 삭제 — 탈퇴·영구 삭제 (설계 C). 실패해도 탈퇴는 막지 않는다(로그만). */
export async function deleteAllNeighborFollowsForUser(sb: SupabaseClient<any>, userId: string): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  try {
    const { error } = await sb
      .from("user_relationships")
      .delete()
      .eq("type", "neighbor_follow")
      .or(`user_id.eq.${uid},target_user_id.eq.${uid}`);
    if (error) console.error("[neighbor-follow] delete all for user failed", error.message);
  } catch (e) {
    console.error("[neighbor-follow] delete all for user threw", e instanceof Error ? e.message : e);
  }
}
