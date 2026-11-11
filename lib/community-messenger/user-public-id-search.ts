/**
 * CM @아이디 / 닉네임 ranked search — exact → prefix → contains → name. 판정은 DB `cm_search_members` (설계안 v3 §3.3).
 */

import { normalizeProfileUserSearchKeyword } from "@/lib/community-messenger/profile-user-search-filter";
import { resolveDirectInteractionGuard } from "@/lib/community-messenger/social-relations";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH = 2;
export const COMMUNITY_MESSENGER_USER_SEARCH_LIMIT = 20;
/** 회원당 하루 검색 횟수 (설계안 v3 §3.3) */
export const COMMUNITY_MESSENGER_USER_SEARCH_DAILY_LIMIT = 500;

export type CommunityMessengerUserSearchMatchType = "exact" | "prefix" | "contains" | "name";

export type CommunityMessengerUserSearchResult = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  publicId: string | null;
  isFriend: boolean;
  isBlockedByMe: boolean;
  isBlockedByPeer: boolean;
  canMessage: boolean;
  canCall: boolean;
  matchType: CommunityMessengerUserSearchMatchType;
  highlightRanges: Array<{ start: number; end: number }>;
};

/** DB `cm_search_members` 결과 행 */
type MemberSearchRow = {
  user_id: string;
  dibay_id: string | null;
  nickname: string | null;
  display_name: string | null;
  avatar_url: string | null;
  match_kind: string | null;
  match_rank: number | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseOrNull() {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

/** 공개 이름 SSOT = nickname (`lib/users/public-member-identity.ts`) — display_name 은 동기화 사본 */
function displayLabel(row: MemberSearchRow): string {
  return trimText(row.nickname) || trimText(row.display_name) || trimText(row.dibay_id) || trimText(row.user_id);
}

function toMatchType(kind: string | null): CommunityMessengerUserSearchMatchType {
  return kind === "exact" || kind === "prefix" || kind === "contains" ? kind : "name";
}

export function computePublicIdHighlightRanges(
  publicId: string,
  query: string
): Array<{ start: number; end: number }> {
  const pid = publicId.toLowerCase();
  const q = query.toLowerCase();
  if (!pid || !q) return [];
  const idx = pid.indexOf(q);
  if (idx < 0) return [];
  return [{ start: idx, end: idx + q.length }];
}

export function computeDisplayNameHighlightRanges(
  displayName: string,
  query: string
): Array<{ start: number; end: number }> {
  const name = displayName.toLowerCase();
  const q = query.toLowerCase();
  const idx = name.indexOf(q);
  if (idx < 0) return [];
  return [{ start: idx, end: idx + q.length }];
}

/**
 * 친구 찾기 (설계안 v3 §3.3) — 조건·정렬·차단·「아이디로 나를 찾기」 설정은 DB `cm_search_members` 한 곳.
 * - 안 바꾼 새 형식(48213sun): 숫자 5자리 또는 아이디 전체
 * - 안 바꾼 옛 형식(dibay…): 아이디 전체
 * - 바뀐·직접 정한 아이디: 4자 이상 앞부분·포함 · 닉네임 2자 이상
 * - 탈퇴·자기 자신·서로 차단 제외 · 기본 아이디(dibay_id_initial)는 쓰지 않음
 */
export async function searchCommunityMessengerUsersRanked(
  viewerUserId: string,
  rawQuery: string
): Promise<CommunityMessengerUserSearchResult[]> {
  const viewer = trimText(viewerUserId);
  const query = normalizeProfileUserSearchKeyword(rawQuery);
  if (!viewer || query.length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) return [];

  const sb = getSupabaseOrNull();
  if (!sb) return [];

  const { data, error } = await (sb as any).rpc("cm_search_members", {
    p_viewer: viewer,
    p_query: query,
    p_limit: COMMUNITY_MESSENGER_USER_SEARCH_LIMIT,
  });
  if (error) return [];

  const rows = ((data ?? []) as MemberSearchRow[]).filter((row) => trimText(row.user_id));
  const results: CommunityMessengerUserSearchResult[] = [];
  for (const row of rows) {
    const matchType = toMatchType(row.match_kind);
    const publicId = trimText(row.dibay_id).toLowerCase() || null;
    const displayName = displayLabel(row);
    const highlightRanges =
      matchType === "name"
        ? computeDisplayNameHighlightRanges(displayName, query)
        : publicId
          ? computePublicIdHighlightRanges(publicId, query)
          : [];
    const guard = await resolveDirectInteractionGuard(viewer, row.user_id);
    results.push({
      id: row.user_id,
      displayName,
      avatarUrl: trimText(row.avatar_url) || null,
      publicId,
      isFriend: guard.isFriend,
      isBlockedByMe: guard.isBlockedByMe,
      isBlockedByPeer: guard.isBlockedByPeer,
      canMessage: guard.canMessage,
      canCall: guard.canCall,
      matchType,
      highlightRanges,
    });
  }
  return results;
}
