/**
 * Community author display SSOT (STEP 1).
 * Do not reuse Messenger / lib/chats resolve-author-nickname as Community SSOT.
 */

import {
  COMMUNITY_IMPORTED_AUTHOR_FALLBACK,
  isCommunityImportedOrigin,
  normalizeCommunityPostOriginKind,
  type CommunityPostOriginKind,
} from "@/lib/community/community-post-origin";

export type CommunityAuthorResolveInput = {
  origin_kind?: unknown;
  user_id?: unknown;
  display_author_name?: unknown;
  display_author_avatar_url?: unknown;
  /** Member/admin: nickname from profiles batch. Ignored for imported. */
  profile_display_name?: string | null;
  /** Member/admin: avatar from profiles batch. Ignored for imported. */
  profile_avatar_url?: string | null;
};

export type CommunityAuthorResolved = {
  origin_kind: CommunityPostOriginKind;
  display_name: string;
  avatar_url: string | null;
  /**
   * Internal ownership id (always post.user_id when present).
   * Not for member-peer CTA when imported.
   */
  owner_user_id: string;
  /** Neighbor / follow / peer-block target — null for imported. */
  member_peer_user_id: string | null;
};

function trimOrEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

/**
 * Canonical Community author resolver.
 * imported → display_* only (never principal nickname / user_id slice / email).
 * member|admin → profile display; empty profile → community anonymous fallback string caller may replace.
 */
export function resolveCommunityAuthor(input: CommunityAuthorResolveInput): CommunityAuthorResolved {
  const origin_kind = normalizeCommunityPostOriginKind(input.origin_kind);
  const owner_user_id = trimOrEmpty(input.user_id);

  if (isCommunityImportedOrigin(origin_kind)) {
    const name = trimOrEmpty(input.display_author_name);
    const avatar = trimOrEmpty(input.display_author_avatar_url);
    return {
      origin_kind: "imported",
      display_name: name || COMMUNITY_IMPORTED_AUTHOR_FALLBACK,
      avatar_url: avatar || null,
      owner_user_id,
      member_peer_user_id: null,
    };
  }

  const profileName = trimOrEmpty(input.profile_display_name);
  const profileAvatar = trimOrEmpty(input.profile_avatar_url);
  return {
    origin_kind,
    display_name: profileName,
    avatar_url: profileAvatar || null,
    owner_user_id,
    member_peer_user_id: owner_user_id || null,
  };
}

/**
 * Feed/Detail mapping helper — member missing nickname keeps prior uid-slice / 익명 fallback;
 * imported never uses that path (DIBAY product fallback only).
 */
export function resolveCommunityAuthorForFeedRow(
  input: CommunityAuthorResolveInput,
  memberMissingNameFallback: (ownerUserId: string) => string
): CommunityAuthorResolved {
  const base = resolveCommunityAuthor(input);
  if (base.origin_kind === "imported") return base;
  if (base.display_name) return base;
  return {
    ...base,
    display_name: memberMissingNameFallback(base.owner_user_id),
  };
}
