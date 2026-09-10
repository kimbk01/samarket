"use client";

import { useEffect, useRef, useState } from "react";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import {
  COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH,
  type CommunityMessengerUserSearchResult,
} from "@/lib/community-messenger/user-public-id-search";

function mapSearchRow(
  row: CommunityMessengerUserSearchResult
): CommunityMessengerProfileLite {
  return {
    id: row.id,
    label: row.displayName,
    subtitle: row.publicId ? `@${row.publicId}` : undefined,
    avatarUrl: row.avatarUrl,
    following: false,
    blocked: row.isBlockedByMe || row.isBlockedByPeer,
    isFriend: row.isFriend,
    isFavoriteFriend: false,
  };
}

/**
 * Shared Create/Invite discovery — GET `/api/community-messenger/users` only.
 * Do not invent a second search API.
 */
export function useGroupMemberPickerUserSearch(args: {
  enabled: boolean;
  query: string;
  viewerUserId: string | null | undefined;
}) {
  const [results, setResults] = useState<CommunityMessengerProfileLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!args.enabled) {
      seqRef.current += 1;
      setResults([]);
      setBusy(false);
      setFailed(false);
      return;
    }
    const trimmed = args.query.trim();
    if (!trimmed || trimmed.length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) {
      seqRef.current += 1;
      setResults([]);
      setBusy(false);
      setFailed(false);
      return;
    }
    const seq = ++seqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        setFailed(false);
        try {
          const res = await fetch(
            `/api/community-messenger/users?q=${encodeURIComponent(trimmed)}`,
            { cache: "no-store" }
          );
          if (seq !== seqRef.current) return;
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            users?: CommunityMessengerUserSearchResult[];
          };
          if (!res.ok || !json.ok) {
            setResults([]);
            setFailed(true);
            return;
          }
          const viewerId = (args.viewerUserId ?? "").trim();
          const users = (json.users ?? [])
            .map(mapSearchRow)
            .filter((user) => !viewerId || user.id !== viewerId);
          setResults(users);
        } catch {
          if (seq !== seqRef.current) return;
          setResults([]);
          setFailed(true);
        } finally {
          if (seq === seqRef.current) setBusy(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [args.enabled, args.query, args.viewerUserId]);

  return { results, busy, failed };
}
