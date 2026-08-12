/**
 * posts.author_id / user_id → Member public identity (nickname + dibay_id)
 * Community / Trade / chat author labels — MEMBER DOMAIN only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEMBER_IDENTITY_PROFILE_SELECT,
  memberCompactLabelFromRow,
  memberDisplayLabelFromRow,
  resolvePublicMemberIdentity,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";

/** 비어 있지 않은 문자열만 (null·""·공백은 무시) */
function nonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalIdForOwnershipCompare(id: string): string {
  const t = id.trim();
  if (!t) return t;
  return UUID_SHAPE.test(t) ? t.toLowerCase() : t;
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
  const u = canonicalIdForOwnershipCompare(userId.trim());
  const a = nonEmptyString(post.author_id);
  const w = nonEmptyString(post.user_id);
  const ac = a != null ? canonicalIdForOwnershipCompare(a) : null;
  const wc = w != null ? canonicalIdForOwnershipCompare(w) : null;
  return (ac != null && ac === u) || (wc != null && wc === u);
}

/**
 * 가격 제안·RLS(`posts.user_id = price_offers.seller_id`)와 동일: 계정 소유는 `user_id` 우선.
 * (표시용 `postAuthorUserId`는 author_id 우선이라 여기와 다를 수 있음)
 */
export function postTradeListingOwnerUserId(
  post: Record<string, unknown> | undefined | null
): string | undefined {
  if (!post) return undefined;
  return nonEmptyString(post.user_id) ?? nonEmptyString(post.author_id);
}

/**
 * Supabase — `profiles` 일괄 `.in("id", …)` 후, 닉이 아직 없는 ID만 `test_users` 조회 (중복·불필요 왕복 감소).
 * 채팅 목록/방 상세·주문채팅 방 생성 등 공통 사용.
 */
export type AuthorPublicProfile = {
  displayName: string;
  avatarUrl: string | null;
  dibayId?: string | null;
  nickname?: string | null;
};

function profileRowToPublicProfile(row: Record<string, unknown> | null | undefined): AuthorPublicProfile | null {
  if (!row) return null;
  const id = nonEmptyString(row.id);
  const identity = resolvePublicMemberIdentity(row as MemberIdentityProfileFields, {
    userId: id ?? undefined,
  });
  if (!identity) return null;
  return {
    displayName: identity.displayLabel,
    avatarUrl: identity.avatarUrl,
    dibayId: identity.dibayId,
    nickname: identity.nickname,
  };
}

function testUserToPublicProfile(row: Record<string, unknown> | null | undefined): AuthorPublicProfile | null {
  if (!row) return null;
  const id = nonEmptyString(row.id);
  if (!id) return null;
  /** test_users has no dibay_id — nickname-like display_name only; never treat as store. */
  const nick = nonEmptyString(row.display_name) ?? nonEmptyString(row.username);
  if (!nick) return null;
  return { displayName: nick, avatarUrl: null, nickname: nick, dibayId: null };
}

export async function fetchAuthorPublicProfilesForUserIds(
  sbAny: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, AuthorPublicProfile>> {
  const map = new Map<string, AuthorPublicProfile>();
  const ids = [...new Set(userIds.filter((x) => typeof x === "string" && x.length > 0))];
  if (ids.length === 0) return map;

  if (ids.length === 1) {
    const onlyId = ids[0]!;
    const { data: profile } = await sbAny
      .from("profiles")
      .select(MEMBER_IDENTITY_PROFILE_SELECT)
      .eq("id", onlyId)
      .maybeSingle();
    const parsed = profileRowToPublicProfile(profile as Record<string, unknown> | null);
    if (parsed) {
      map.set(onlyId, parsed);
      return map;
    }
    const { data: testUser } = await sbAny
      .from("test_users")
      .select("id, display_name, username")
      .eq("id", onlyId)
      .maybeSingle();
    const testParsed = testUserToPublicProfile(testUser as Record<string, unknown> | null);
    if (testParsed) map.set(onlyId, testParsed);
    return map;
  }

  const { data: profiles } = await sbAny
    .from("profiles")
    .select(MEMBER_IDENTITY_PROFILE_SELECT)
    .in("id", ids);
  (profiles as Record<string, unknown>[] | null | undefined)?.forEach((p) => {
    const id = p.id as string;
    const parsed = profileRowToPublicProfile(p);
    if (id && parsed) map.set(id, parsed);
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
    const parsed = testUserToPublicProfile(t);
    if (id && parsed) map.set(id, parsed);
  });

  return map;
}

/**
 * Community / meeting labels — Member displayLabel (nickname; UI may strip @).
 * Prefer displayLabel so CommunityAuthorRow shows nickname without forcing handle in every surface.
 */
export async function fetchNicknamesForUserIds(
  sbAny: SupabaseClient<any>,
  userIds: string[],
  metrics?: { profileSelect: number; testUsersSelect: number }
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(userIds.filter((x) => typeof x === "string" && x.length > 0))];
  if (ids.length === 0) return map;

  const applyProfile = (id: string, row: Record<string, unknown> | null | undefined) => {
    const label = memberDisplayLabelFromRow(row as MemberIdentityProfileFields, { userId: id });
    if (label) map.set(id, label);
  };

  if (ids.length === 1) {
    const onlyId = ids[0]!;
    if (metrics) metrics.profileSelect += 1;
    const { data: profile } = await sbAny
      .from("profiles")
      .select(MEMBER_IDENTITY_PROFILE_SELECT)
      .eq("id", onlyId)
      .maybeSingle();
    if (profile) {
      applyProfile(onlyId, profile as Record<string, unknown>);
      return map;
    }
    if (metrics) metrics.testUsersSelect += 1;
    const { data: testUser } = await sbAny
      .from("test_users")
      .select("id, display_name, username")
      .eq("id", onlyId)
      .maybeSingle();
    const testParsed = testUserToPublicProfile(testUser as Record<string, unknown> | null);
    if (testParsed) map.set(onlyId, testParsed.displayName);
    return map;
  }

  if (metrics) metrics.profileSelect += 1;
  const { data: profiles } = await sbAny
    .from("profiles")
    .select(MEMBER_IDENTITY_PROFILE_SELECT)
    .in("id", ids);
  (profiles as Record<string, unknown>[] | null | undefined)?.forEach((p) => {
    const id = p.id as string;
    if (id) applyProfile(id, p);
  });

  const needTest = ids.filter((id) => !map.has(id));
  if (needTest.length === 0) return map;

  if (metrics) metrics.testUsersSelect += 1;
  const { data: testUsers } = await sbAny
    .from("test_users")
    .select("id, display_name, username")
    .in("id", needTest);
  (testUsers as Record<string, unknown>[] | null | undefined)?.forEach((t) => {
    const id = t.id as string;
    if (map.has(id)) return;
    const parsed = testUserToPublicProfile(t);
    if (id && parsed) map.set(id, parsed.displayName);
  });

  return map;
}

/** Trade list seller line — compact `nickname (@dibay_id)`. */
export async function fetchMemberCompactLabelsForUserIds(
  sbAny: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(userIds.filter((x) => typeof x === "string" && x.length > 0))];
  if (ids.length === 0) return map;
  const { data: profiles } = await sbAny
    .from("profiles")
    .select(MEMBER_IDENTITY_PROFILE_SELECT)
    .in("id", ids);
  for (const p of (profiles as Record<string, unknown>[] | null | undefined) ?? []) {
    const id = typeof p.id === "string" ? p.id.trim() : "";
    if (!id) continue;
    map.set(id, memberCompactLabelFromRow(p as MemberIdentityProfileFields, { userId: id }));
  }
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
