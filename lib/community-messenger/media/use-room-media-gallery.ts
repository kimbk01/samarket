"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import type {
  RoomCollectionItem,
  RoomCollectionPage,
  RoomMediaGalleryCounts,
  RoomMediaGalleryItem,
  RoomMediaGalleryPage,
} from "@/lib/community-messenger/media/room-media-gallery-service";

/** 방 사진·음성 모음 — 서버 조회(설계 M4). 화면에 불러온 메시지로 세지 않는다. */
export function useRoomMediaGallery(roomId: string | null | undefined, enabled: boolean) {
  const [items, setItems] = useState<RoomMediaGalleryItem[]>([]);
  const [counts, setCounts] = useState<RoomMediaGalleryCounts | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      /** 방 id 가 아직 없을 수 있다(시트 초기·시험) — 문자열로만 다룬다 */
      const rid = String(roomId ?? "").trim();
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

/** 파일·링크 모음 — 서버 조회(D2). 화면에 불러온 메시지로 세지 않는다. */
export function useRoomMessageCollection(roomId: string | null | undefined, kind: "file" | "link", enabled: boolean) {
  const [items, setItems] = useState<RoomCollectionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const rid = String(roomId ?? "").trim();
      if (!rid || !enabled || inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      try {
        const qs = new URLSearchParams({ kind });
        if (cursor) qs.set("cursor", cursor);
        const res = await fetch(`${communityMessengerRoomResourcePath(rid)}/media?${qs}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; page?: RoomCollectionPage };
        if (res.ok && json.ok && json.page) {
          const page = json.page;
          setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
          setNextCursor(page.nextCursor);
        }
      } catch {
        /* 다음 열기에서 다시 */
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [enabled, kind, roomId]
  );

  useEffect(() => {
    if (!enabled) return;
    void fetchPage(null);
  }, [enabled, fetchPage]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) void fetchPage(nextCursor);
  }, [fetchPage, loading, nextCursor]);

  return { items, loading, hasMore: Boolean(nextCursor), loadMore };
}
