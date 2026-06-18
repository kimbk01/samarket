/**
 * DIBAY 차단 SSOT 타입 — `user_social_relations.relation_type = 'blocked'` + `is_active`.
 * participant `blocked_hidden_at` 는 목록 숨김만 (권한 gate 아님).
 */

export type BlockSource = "friend_list" | "chat_room" | "profile" | "incoming_call" | "call_log";

export type SocialBlockRow = {
  owner_user_id?: string;
  target_user_id?: string;
  relation_type?: string | null;
  is_active?: boolean | null;
  block_source?: BlockSource | string | null;
  blocked_at?: string | null;
  unblocked_at?: string | null;
  last_action_at?: string | null;
};

/** is_active=false 는 해제된 차단 이력 — gate 에서 제외 */
export function isActiveSocialBlockRow(row: Pick<SocialBlockRow, "relation_type" | "is_active"> | null | undefined): boolean {
  if (!row || row.relation_type !== "blocked") return false;
  return row.is_active !== false;
}

/** Supabase filter — active blocked rows only (null is_active = legacy active) */
export const SOCIAL_BLOCK_ACTIVE_OR_LEGACY = "is_active.is.null,is_active.eq.true";
