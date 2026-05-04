"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

function tradeChatListSummaryNeedsMetaHydration(room: CommunityMessengerRoomSummary): boolean {
  if (room.roomType !== "direct") return false;
  const ctx = room.contextMeta;
  if (ctx?.kind === "delivery") return false;
  const thumb =
    ctx?.kind === "trade" && typeof ctx.thumbnailUrl === "string" && ctx.thumbnailUrl.trim().length > 0;
  return !thumb;
}

function mergeTradeChatContextPatches(
  prev: CommunityMessengerBootstrap,
  patches: Array<{ roomId: string; contextMeta: CommunityMessengerRoomContextMetaV1 | null }>
): CommunityMessengerBootstrap {
  const map = new Map(patches.map((p) => [p.roomId, p.contextMeta]));
  const patchRooms = (rooms: CommunityMessengerRoomSummary[]) =>
    rooms.map((r) => {
      if (!map.has(r.id)) return r;
      const cm = map.get(r.id) ?? null;
      return { ...r, contextMeta: cm };
    });
  const next: CommunityMessengerBootstrap = {
    ...prev,
    chats: patchRooms(prev.chats ?? []),
    groups: patchRooms(prev.groups ?? []),
  };
  primeBootstrapCache(next);
  return next;
}

/**
 * `/community-messenger/trade-chats` — 서버 부트스트랩만으로 `contextMeta.thumbnailUrl` 이 비는 경우
 * 동일 서버 보강 로직을 배치 호출로 한 번 더 적용한다.
 */
export function useTradeChatListMetaHydration(args: {
  enabled: boolean;
  viewerUserId: string | null;
  chats: CommunityMessengerRoomSummary[] | null | undefined;
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>;
}): void {
  const { enabled, viewerUserId, chats, setData } = args;
  const missingKey =
    chats?.length && enabled && viewerUserId
      ? chats
          .filter(tradeChatListSummaryNeedsMetaHydration)
          .map((r) => r.id)
          .sort()
          .join(",")
      : "";

  useEffect(() => {
    if (!enabled || !viewerUserId || !missingKey) return;
    const roomIds = missingKey.split(",").filter(Boolean);
    if (roomIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/community-messenger/trade-chat-list-meta", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomIds }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          patches?: Array<{ roomId: string; contextMeta: CommunityMessengerRoomContextMetaV1 | null }>;
        };
        if (cancelled || !res.ok || !json.ok || !Array.isArray(json.patches)) return;
        const toApply = json.patches.filter((p) => p.contextMeta != null);
        if (toApply.length === 0) return;
        setData((prev) => {
          if (!prev) return prev;
          return mergeTradeChatContextPatches(prev, toApply);
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, missingKey, setData, viewerUserId]);
}
