/**
 * DIBAY 차단 SSOT — `user_social_relations.relation_type = 'blocked'`
 *
 * 신규 저장·해제·판단 기준: `user_social_relations` (owner_user_id → target_user_id, 단방향)
 * Legacy 읽기 fallback: `user_relationships`, `user_blocks` (마이그레이션 완료 후 제거 예정)
 *
 * TODO(migration): legacy-only 차단 row → SSOT backfill 스크립트 후 fallback 쿼리 축소
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type BlockedRelation = {
  blockedByMe: boolean;
  blockedByPeer: boolean;
  blockedEitherWay: boolean;
};

export type CommentRowForBlockFilter = {
  id: string;
  user_id: unknown;
  parent_id: unknown;
};

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addIdsFromRows(rows: unknown, key: string, out: Set<string>): void {
  if (!Array.isArray(rows)) return;
  for (const r of rows as Record<string, unknown>[]) {
    const id = trimId(r[key]);
    if (id) out.add(id);
  }
}

/**
 * viewer 기준 피드·댓글에서 제외할 작성자 ID (양방향 차단 합집합)
 * SSOT `user_social_relations` + legacy fallback 병합
 */
export async function fetchBlockedAuthorIdsForViewerSb(
  sb: SupabaseClient<any>,
  viewerId: string,
  metrics?: { supabaseSelectCalls: number }
): Promise<Set<string>> {
  const out = new Set<string>();
  const v = trimId(viewerId);
  if (!v) return out;

  if (metrics) metrics.supabaseSelectCalls += 6;
  const [
    { data: socialOut },
    { data: socialIn },
    { data: relOut },
    { data: relIn },
    { data: legacyBlocksOut },
    { data: legacyBlocksIn },
  ] = await Promise.all([
    // remove after migration complete — legacy fallback read only
    sb.from("user_social_relations").select("target_user_id").eq("owner_user_id", v).eq("relation_type", "blocked"),
    sb.from("user_social_relations").select("owner_user_id").eq("target_user_id", v).eq("relation_type", "blocked"),
    // remove after migration complete
    sb.from("user_relationships").select("target_user_id").eq("user_id", v).or("relation_type.eq.blocked,type.eq.blocked"),
    sb.from("user_relationships").select("user_id").eq("target_user_id", v).or("relation_type.eq.blocked,type.eq.blocked"),
    // remove after migration complete
    sb.from("user_blocks").select("blocked_user_id").eq("user_id", v),
    sb.from("user_blocks").select("user_id").eq("blocked_user_id", v),
  ]);

  addIdsFromRows(socialOut, "target_user_id", out);
  addIdsFromRows(socialIn, "owner_user_id", out);
  addIdsFromRows(relOut, "target_user_id", out);
  addIdsFromRows(relIn, "user_id", out);
  addIdsFromRows(legacyBlocksOut, "blocked_user_id", out);
  addIdsFromRows(legacyBlocksIn, "user_id", out);
  return out;
}

/** pairwise 차단 (SSOT 우선 + legacy fallback) */
export async function fetchBlockedPairFromSb(
  sb: SupabaseClient<any> | null,
  userId: string,
  targetUserId: string
): Promise<BlockedRelation> {
  const a = trimId(userId);
  const b = trimId(targetUserId);
  if (!sb || !a || !b || a === b) {
    return { blockedByMe: false, blockedByPeer: false, blockedEitherWay: false };
  }

  const [
    { data: socialRows },
    { data: relRows },
    { data: blockOut },
    { data: blockIn },
  ] = await Promise.all([
    (sb as any)
      .from("user_social_relations")
      .select("owner_user_id")
      .eq("relation_type", "blocked")
      .or(`and(owner_user_id.eq.${a},target_user_id.eq.${b}),and(owner_user_id.eq.${b},target_user_id.eq.${a})`),
    // remove after migration complete
    (sb as any)
      .from("user_relationships")
      .select("user_id")
      .or(`and(user_id.eq.${a},target_user_id.eq.${b}),and(user_id.eq.${b},target_user_id.eq.${a})`)
      .or("relation_type.eq.blocked,type.eq.blocked"),
    // remove after migration complete
    (sb as any).from("user_blocks").select("id").eq("user_id", a).eq("blocked_user_id", b).maybeSingle(),
    // remove after migration complete
    (sb as any).from("user_blocks").select("id").eq("user_id", b).eq("blocked_user_id", a).maybeSingle(),
  ]);

  let blockedByMe = Boolean(blockOut?.id);
  let blockedByPeer = Boolean(blockIn?.id);

  for (const row of (socialRows ?? []) as Array<{ owner_user_id?: string }>) {
    const owner = trimId(row.owner_user_id);
    if (owner === a) blockedByMe = true;
    if (owner === b) blockedByPeer = true;
  }
  for (const row of (relRows ?? []) as Array<{ user_id?: string }>) {
    const owner = trimId(row.user_id);
    if (owner === a) blockedByMe = true;
    if (owner === b) blockedByPeer = true;
  }

  return {
    blockedByMe,
    blockedByPeer,
    blockedEitherWay: blockedByMe || blockedByPeer,
  };
}

/**
 * 차단 작성자 댓글 + 해당 댓글 하위 답글(조상 중 차단 작성자 있음) 제외
 */
export function filterCommentRowsExcludingBlockedRelations<T extends CommentRowForBlockFilter>(
  rows: T[],
  blockExclude: Set<string>
): T[] {
  if (blockExclude.size === 0 || rows.length === 0) return rows;

  const byId = new Map<string, T>();
  for (const row of rows) {
    const id = trimId(row.id);
    if (id) byId.set(id, row);
  }

  const hidden = new Set<string>();
  const isRowHidden = (rowId: string): boolean => {
    if (hidden.has(rowId)) return true;
    const start = byId.get(rowId);
    if (!start) return false;

    let cur: T | undefined = start;
    const visited = new Set<string>();
    while (cur) {
      const uid = trimId(cur.user_id);
      if (uid && blockExclude.has(uid)) {
        hidden.add(rowId);
        return true;
      }
      const parentId = cur.parent_id != null ? trimId(cur.parent_id) : "";
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      cur = byId.get(parentId);
    }
    return false;
  };

  return rows.filter((row) => !isRowHidden(trimId(row.id)));
}

/** 알림·FCM 억제 — 수신자↔행위자 차단(양방향) */
export function isNotificationSuppressedForActor(
  relation: BlockedRelation
): boolean {
  return relation.blockedEitherWay;
}
