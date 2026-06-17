/**
 * CM @아이디 / 닉네임 ranked search — exact → prefix → contains → name.
 */

import { normalizeProfileUserSearchKeyword } from "@/lib/community-messenger/profile-user-search-filter";
import {
  escapeIlikePatternFragment,
  escapePostgrestDoubleQuotedIlike,
} from "@/lib/community-messenger/profile-user-search-filter";
import { batchResolveSearchGuards } from "@/lib/community-messenger/friendship/search-response-mapper";
import type { CommunityMessengerPeerRelationStatus } from "@/lib/community-messenger/types";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH = 2;
export const COMMUNITY_MESSENGER_USER_SEARCH_LIMIT = 20;

export type CommunityMessengerUserSearchMatchType = "exact" | "prefix" | "contains" | "name";

export type CommunityMessengerUserSearchResult = {
  id: string;
  userId: string;
  displayName: string;
  nickname: string;
  avatarUrl: string | null;
  publicId: string | null;
  isFriend: boolean;
  isBlockedByMe: boolean;
  isBlockedByPeer: boolean;
  relationshipStatus: CommunityMessengerPeerRelationStatus;
  friendshipStatus?: "none" | "pending" | "accepted" | "blocked" | "removed";
  friendshipId?: string | null;
  readdBlockedUntil?: string | null;
  requestRoomId?: string | null;
  requestMessageId?: string | null;
  canMessage: boolean;
  canCall: boolean;
  canSendFriendRequest: boolean;
  matchType: CommunityMessengerUserSearchMatchType;
  highlightRanges: Array<{ start: number; end: number }>;
};

type ProfileCandidate = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  username: string | null;
  dibay_id: string | null;
  avatar_url: string | null;
  username_confirmed: boolean | null;
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

function resolvePublicId(row: ProfileCandidate): string | null {
  const dibay = trimText(row.dibay_id);
  if (dibay) return dibay.toLowerCase();
  if (row.username_confirmed === true) {
    const username = trimText(row.username);
    if (username) return username.toLowerCase();
  }
  return null;
}

function displayLabel(row: ProfileCandidate): string {
  return (
    trimText(row.display_name) ||
    trimText(row.nickname) ||
    trimText(row.username) ||
    trimText(row.id)
  );
}

function rankMatchType(
  row: ProfileCandidate,
  query: string
): CommunityMessengerUserSearchMatchType | null {
  const q = query.toLowerCase();
  const publicId = resolvePublicId(row);
  if (publicId) {
    if (publicId === q) return "exact";
    if (publicId.startsWith(q)) return "prefix";
    if (publicId.includes(q)) return "contains";
  }
  const name = displayLabel(row).toLowerCase();
  if (name.includes(q)) return "name";
  return null;
}

function matchRank(type: CommunityMessengerUserSearchMatchType): number {
  switch (type) {
    case "exact":
      return 0;
    case "prefix":
      return 1;
    case "contains":
      return 2;
    case "name":
      return 3;
    default:
      return 9;
  }
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

function buildSearchOrFilter(query: string): string | null {
  const keyword = normalizeProfileUserSearchKeyword(query);
  if (keyword.length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) return null;
  const escaped = escapeIlikePatternFragment(keyword);
  const exact = escapePostgrestDoubleQuotedIlike(escaped);
  const prefix = escapePostgrestDoubleQuotedIlike(`${escaped}%`);
  const contains = escapePostgrestDoubleQuotedIlike(`%${escaped}%`);
  return [
    `dibay_id.ilike.${exact}`,
    `dibay_id.ilike.${prefix}`,
    `dibay_id.ilike.${contains}`,
    `and(username.ilike.${exact},username_confirmed.eq.true)`,
    `and(username.ilike.${prefix},username_confirmed.eq.true)`,
    `and(username.ilike.${contains},username_confirmed.eq.true)`,
    `nickname.ilike.${contains}`,
    `display_name.ilike.${contains}`,
  ].join(",");
}

function isEligibleProfile(row: ProfileCandidate): boolean {
  if (trimText(row.dibay_id)) return true;
  return row.username_confirmed === true && Boolean(trimText(row.username));
}

export async function searchCommunityMessengerUsersRanked(
  viewerUserId: string,
  rawQuery: string
): Promise<CommunityMessengerUserSearchResult[]> {
  const viewer = trimText(viewerUserId);
  const query = normalizeProfileUserSearchKeyword(rawQuery);
  if (!viewer || query.length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) return [];

  const orFilter = buildSearchOrFilter(rawQuery);
  if (!orFilter) return [];

  const sb = getSupabaseOrNull();
  if (!sb) return [];

  const { data, error } = await (sb as any)
    .from("profiles")
    .select(
      "id, display_name, nickname, username, dibay_id, avatar_url, username_confirmed"
    )
    .or(orFilter)
    .neq("id", viewer)
    .limit(60);

  if (error) return [];

  const candidates = ((data ?? []) as ProfileCandidate[]).filter(isEligibleProfile);
  const ranked = candidates
    .map((row) => {
      const matchType = rankMatchType(row, query);
      if (!matchType) return null;
      const publicId = resolvePublicId(row);
      const displayName = displayLabel(row);
      const highlightRanges =
        matchType === "name"
          ? computeDisplayNameHighlightRanges(displayName, query)
          : publicId
            ? computePublicIdHighlightRanges(publicId, query)
            : [];
      return {
        row,
        matchType,
        rank: matchRank(matchType),
        publicId,
        displayName,
        highlightRanges,
        publicIdSort: publicId ?? "",
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.matchType !== "name" && b.matchType !== "name") {
        return a.publicIdSort.localeCompare(b.publicIdSort);
      }
      return a.displayName.localeCompare(b.displayName);
    })
    .slice(0, COMMUNITY_MESSENGER_USER_SEARCH_LIMIT);

  const results: CommunityMessengerUserSearchResult[] = [];
  const guards = await batchResolveSearchGuards(viewer, ranked.map((item) => item.row.id));
  for (const item of ranked) {
    const guard = guards.get(item.row.id) ?? {
      isFriend: false,
      isBlockedByMe: false,
      isBlockedByPeer: false,
      relationshipStatus: "none" as const,
      friendshipStatus: "none" as const,
      friendshipId: null,
      readdBlockedUntil: null,
      canMessage: false,
      canCall: false,
      canSendFriendRequest: true,
    };
    results.push({
      id: item.row.id,
      userId: item.row.id,
      displayName: item.displayName,
      nickname: item.displayName,
      avatarUrl: trimText(item.row.avatar_url) || null,
      publicId: item.publicId,
      isFriend: guard.isFriend,
      isBlockedByMe: guard.isBlockedByMe,
      isBlockedByPeer: guard.isBlockedByPeer,
      relationshipStatus: guard.relationshipStatus,
      friendshipStatus: guard.friendshipStatus,
      friendshipId: guard.friendshipId ?? null,
      readdBlockedUntil: guard.readdBlockedUntil ?? null,
      requestRoomId: guard.requestRoomId ?? null,
      requestMessageId: guard.requestMessageId ?? null,
      canMessage: guard.canMessage,
      canCall: guard.canCall,
      canSendFriendRequest: guard.canSendFriendRequest,
      matchType: item.matchType,
      highlightRanges: item.highlightRanges,
    });
  }

  return results;
}
