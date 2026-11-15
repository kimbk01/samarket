"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import type { RoomMediaGalleryItem, RoomMediaGalleryPage } from "@/lib/community-messenger/media/room-media-gallery-service";

/** 방 사진·음성 모음 — 서버 조회(설계 M4). 화면에 불러온 메시지로 세지 않는다. */
export function useRoomMediaGallery(roomId: string, enabled: boolean) {
  const [items, setItems] = useState<RoomMediaGalleryItem[]>([]);
  const [counts, setCounts] = useState<{ image: number; voice: number } | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const rid = roomId.trim();
      if (!rid || !enabled || inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      try {
        const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
        const res = await fetch(`${communityMessengerRoomResourcePath(rid)}/media${qs}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; page?: RoomMediaGalleryPage };
        if (res.ok && json.ok && json.page) {
          const page = json.page;
          setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
          if (page.counts) setCounts(page.counts);
          setNextCursor(page.nextCursor);
          setFailed(false);
        } else if (!cursor) {
          setFailed(true);
        }
      } catch {
        if (!cursor) setFailed(true);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [enabled, roomId]
  );

  useEffect(() => {
    if (!enabled) return;
    void fetchPage(null);
  }, [enabled, fetchPage]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) void fetchPage(nextCursor);
  }, [fetchPage, loading, nextCursor]);

  return { items, counts, loading, failed, hasMore: Boolean(nextCursor), loadMore };
}
