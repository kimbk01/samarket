"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { communityMessengerRoomIsTrade } from "@/lib/community-messenger/messenger-room-domain";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

/**
 * 거래 탭에서 `trade-chat-list-meta` 를 부를지 — 썸네일이 이미 있어도
 * `productCategoryLabel` 이 비어 있으면(구 부트스트랩·캐시) **방당 1회** 보강을 시도한다.
 */
function tradeChatListSummaryNeedsMetaHydration(
  room: CommunityMessengerRoomSummary,
  attemptedRoomIds: ReadonlySet<string>
): boolean {
  if (room.roomType !== "direct") return false;
  if (!communityMessengerRoomIsTrade(room)) return false;
  const ctx = room.contextMeta;
  if (ctx?.kind === "delivery") return false;

  const thumbOk =
    ctx?.kind === "trade" && typeof ctx.thumbnailUrl === "string" && ctx.thumbnailUrl.trim().length > 0;
  if (!thumbOk) return true;

  const postId = ctx?.kind === "trade" && typeof ctx.postId === "string" ? ctx.postId.trim() : "";
  const hasLeaf =
    ctx?.kind === "trade" &&
    typeof ctx.productCategoryLabel === "string" &&
    ctx.productCategoryLabel.trim().length > 0;
  if (postId && !hasLeaf && !attemptedRoomIds.has(room.id)) return true;

  return false;
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
 * `/community-messenger/trade-chats` — 부트스트랩·캐시만으로 거래 `contextMeta` 가 부족할 때
 * 서버 `hydrateTradeChatListContextMetaForRoomIds` 와 동일 보강을 **배치**로 한 번 더 적용한다.
 */
export function useTradeChatListMetaHydration(args: {
  enabled: boolean;
  viewerUserId: string | null;
  chats: CommunityMessengerRoomSummary[] | null | undefined;
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>;
}): void {
  const { enabled, viewerUserId, chats, setData } = args;
  const tradeMetaFetchAttemptedRef = useRef(new Set<string>());
  const missingKey =
    chats?.length && enabled && viewerUserId
      ? chats
          .filter((r) => tradeChatListSummaryNeedsMetaHydration(r, tradeMetaFetchAttemptedRef.current))
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
        for (const id of roomIds) tradeMetaFetchAttemptedRef.current.add(id);
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
