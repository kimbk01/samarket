/**
 * posts.author_id / user_id → 프로필 닉네임 (채팅 목록·방 상단 「작성자」 표시)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** 비어 있지 않은 문자열만 (null·""·공백은 무시) */
function nonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * 표시·채팅 판매자 식별용: author_id 우선, 없거나 빈 값이면 user_id
 * 주의: 소유권(내 글 여부)은 postOwnedByUserId — author_id가 타인 UUID로 잘못 들어간 레거시 행이 있어도 user_id로 매칭됨
 */
export function postAuthorUserId(post: Record<string, unknown> | undefined | null): string | undefined {
  if (!post) return undefined;
  return nonEmptyString(post.author_id) ?? nonEmptyString(post.user_id);
}

/** 내가 이 글의 소유자인지 — author_id / user_id 중 하나라도 현재 사용자와 같으면 true */
export function postOwnedByUserId(
  post: Record<string, unknown> | undefined | null,
  userId: string
): boolean {
  if (!post || !nonEmptyString(userId)) return false;
  const u = userId.trim();
  const a = nonEmptyString(post.author_id);
  const w = nonEmptyString(post.user_id);
  return a === u || w === u;
}

/**
 * Supabase — `profiles` 일괄 `.in("id", …)` 후, 닉이 아직 없는 ID만 `test_users` 조회 (중복·불필요 왕복 감소).
 * 채팅 목록/방 상세·주문채팅 방 생성 등 공통 사용.
 */
export async function fetchNicknamesForUserIds(
  sbAny: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(userIds.filter((x) => typeof x === "string" && x.length > 0))];
  if (ids.length === 0) return map;

  const { data: profiles } = await sbAny.from("profiles").select("id, nickname, username").in("id", ids);
  (profiles as Record<string, unknown>[] | null | undefined)?.forEach((p) => {
    const id = p.id as string;
    const name = (p.nickname ?? p.username) as string;
    if (id && name) map.set(id, String(name).trim());
  });

  const needTest = ids.filter((id) => !map.has(id));
  if (needTest.length === 0) return map;

  const { data: testUsers } = await sbAny
    .from("test_users")
    .select("id, display_name, username")
    .in("id", needTest);
  (testUsers as Record<string, unknown>[] | null | undefined)?.forEach((t) => {
    const id = t.id as string;
    if (map.has(id)) return;
    const name = (t.display_name ?? t.username) as string;
    if (id && name) map.set(id, String(name).trim());
  });

  return map;
}

export function enrichPostWithAuthorNickname(
  post: Record<string, unknown> | undefined,
  nicknameByUserId: Map<string, string>
): Record<string, unknown> | undefined {
  if (!post) return undefined;
  const existing = typeof post.author_nickname === "string" ? post.author_nickname.trim() : "";
  if (existing) return post;
  const aid = postAuthorUserId(post);
  const n = aid ? nicknameByUserId.get(aid)?.trim() : undefined;
  return n ? { ...post, author_nickname: n } : post;
}
