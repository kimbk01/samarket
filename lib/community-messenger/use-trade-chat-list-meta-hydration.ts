"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getMessengerBackgroundHydrationScheduler } from "@/lib/community-messenger/background-hydration-scheduler";
import { shouldDeferTradeChatListMetaHydration } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
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
    if (shouldDeferTradeChatListMetaHydration()) return;
    const roomIds = missingKey.split(",").filter(Boolean);
    if (roomIds.length === 0) return;

    let stale = false;
    const dedupeKey = `trade-chat-list-meta:${missingKey}`;
    getMessengerBackgroundHydrationScheduler().schedule({
      id: dedupeKey,
      dedupeKey,
      priority: "low",
      run: async (signal) => {
        if (stale || signal.aborted) return;
        try {
          const res = await fetch("/api/community-messenger/trade-chat-list-meta", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomIds }),
            signal,
          });
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            patches?: Array<{ roomId: string; contextMeta: CommunityMessengerRoomContextMetaV1 | null }>;
          };
          if (stale) return;
          if (!res.ok || !json.ok || !Array.isArray(json.patches)) return;
          for (const id of roomIds) tradeMetaFetchAttemptedRef.current.add(id);
          const toApply = json.patches.filter((p) => p.contextMeta != null);
          if (toApply.length === 0) return;
          setData((prev) => {
            const next = applyHomeListPatch(
              prev,
              { kind: "trade_context_meta", patches: toApply },
              "trade-meta"
            );
            if (next && next !== prev) primeBootstrapCache(next);
            return next;
          });
        } catch {
          /* ignore */
        }
      },
    });

    return () => {
      stale = true;
    };
  }, [enabled, missingKey, setData, viewerUserId]);
}
