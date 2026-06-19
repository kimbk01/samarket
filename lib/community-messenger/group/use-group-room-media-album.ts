"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GroupMediaIndexItem } from "@/lib/community-messenger/group/group-room-media-index";
import { communityMessengerGroupRoomApiPath } from "@/lib/community-messenger/group/group-room-deeplink";

export type GroupMediaAlbumFilter = "all" | "image" | "file";

type AlbumPage = {
  items: GroupMediaIndexItem[];
  nextCursor: string | null;
};

export function useGroupRoomMediaAlbum(roomId: string, filter: GroupMediaAlbumFilter, enabled: boolean) {
  const [items, setItems] = useState<GroupMediaIndexItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const inFlightRef = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      const rid = roomId.trim();
      if (!rid || !enabled || inFlightRef.current) return;
      inFlightRef.current = true;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (filter !== "all") qs.set("filter", filter);
        if (cursor) qs.set("cursor", cursor);
        const res = await fetch(
          `${communityMessengerGroupRoomApiPath(rid)}/media${qs.toString() ? `?${qs}` : ""}`
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          page?: AlbumPage;
        };
        if (res.ok && json.ok && json.page) {
          setItems((prev) => (append ? [...prev, ...json.page!.items] : json.page!.items));
          setNextCursor(json.page.nextCursor);
        } else if (!append) {
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [enabled, filter, roomId]
  );

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    void fetchPage(nextCursor, true);
  }, [fetchPage, loadingMore, nextCursor]);

  return { items, loading, loadingMore, hasMore: Boolean(nextCursor), loadMore };
}
