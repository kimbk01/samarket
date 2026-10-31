/**
 * DIBAY 차단 SSOT — `user_social_relations.relation_type = 'blocked'` + `is_active = true`
 *
 * 신규 저장·해제·판단 기준: `user_social_relations` (owner_user_id → target_user_id, 단방향)
 * 해제: row 삭제 금지 — `is_active=false`, `unblocked_at` 저장 (자동 친구 복구 금지)
 * 판단은 SSOT 만 읽는다 (2026-10-31 이관 완료 확인 — 운영: `user_blocks` 0행, legacy 에만 있는 차단 0건,
 * SSOT 해제·legacy 활성 불일치 0건, 차단 저장 경로는 모두 SSOT 먼저 기록 후 legacy 를 따라 씀).
 * legacy `user_relationships`·`user_blocks` 는 저장 경로의 보조 동기화만 남는다 (판단에 쓰지 않음).
 * `community_messenger_participants.blocked_hidden_at` — 채팅 목록 숨김만 (gate 아님)
 *
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isActiveSocialBlockRow,
  SOCIAL_BLOCK_ACTIVE_OR_LEGACY,
  type BlockSource,
  type SocialBlockRow,
} from "@/lib/social/block-ssot-types";

export type { BlockSource, SocialBlockRow };
export { isActiveSocialBlockRow, SOCIAL_BLOCK_ACTIVE_OR_LEGACY };

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

  // SSOT 양방향 1회 (legacy 표는 판단에 쓰지 않음 — 파일 머리 주석)
  if (metrics) metrics.supabaseSelectCalls += 1;
  const { data: rows } = await sb
    .from("user_social_relations")
    .select("owner_user_id, target_user_id")
    .eq("relation_type", "blocked")
    .or(`owner_user_id.eq.${v},target_user_id.eq.${v}`)
    .or(SOCIAL_BLOCK_ACTIVE_OR_LEGACY);
  if (Array.isArray(rows)) {
    for (const row of rows as Array<{ owner_user_id?: string; target_user_id?: string }>) {
      const owner = trimId(row.owner_user_id);
      const target = trimId(row.target_user_id);
      if (owner === v && target) out.add(target);
      if (target === v && owner) out.add(owner);
    }
  }
  return out;
}

/** Opt-in wall split for T5 block-gate isolation (query vs CPU merge). */
export type FetchBlockedPairTiming = {
  queryMs: number;
  transformMs: number;
};

/**
 * pairwise 차단 — SSOT `user_social_relations` 1회 (양방향).
 * 예전에는 SSOT 에 활성 차단이 없으면(대부분의 경우) legacy 표 2개를 더 읽어 확인 1번에 3회 조회였다
 * (운영 24시간 약 8,500회). legacy 는 판단에 쓰지 않는다 — 파일 머리 주석의 이관 완료 근거.
 */
export async function fetchBlockedPairFromSb(
  sb: SupabaseClient<any> | null,
  userId: string,
  targetUserId: string,
  outTiming?: FetchBlockedPairTiming
): Promise<BlockedRelation> {
  const a = trimId(userId);
  const b = trimId(targetUserId);
  if (!sb || !a || !b || a === b) {
    if (outTiming) {
      outTiming.queryMs = 0;
      outTiming.transformMs = 0;
    }
    return { blockedByMe: false, blockedByPeer: false, blockedEitherWay: false };
  }

  const queryT0 = performance.now();
  const { data: socialRows } = await (sb as any)
    .from("user_social_relations")
    .select("owner_user_id, is_active, relation_type")
    .eq("relation_type", "blocked")
    .or(`and(owner_user_id.eq.${a},target_user_id.eq.${b}),and(owner_user_id.eq.${b},target_user_id.eq.${a})`);
  if (outTiming) outTiming.queryMs = Math.round(performance.now() - queryT0);

  const transformT0 = performance.now();
  let blockedByMe = false;
  let blockedByPeer = false;
  for (const row of (socialRows ?? []) as Array<{
    owner_user_id?: string;
    is_active?: boolean | null;
    relation_type?: string;
  }>) {
    if (!isActiveSocialBlockRow(row)) continue;
    const owner = trimId(row.owner_user_id);
    if (owner === a) blockedByMe = true;
    if (owner === b) blockedByPeer = true;
  }
  if (outTiming) outTiming.transformMs = Math.round(performance.now() - transformT0);

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
