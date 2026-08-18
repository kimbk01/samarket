"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  getMessengerBackgroundHydrationScheduler,
  subscribeMessengerHomeHydrationSurfaceResume,
} from "@/lib/community-messenger/background-hydration-scheduler";
import { shouldDeferTradeChatListMetaHydration } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { resolveMessengerHomeBootstrapSetData } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import type { MessengerHomeShadowDispatch } from "@/lib/community-messenger/home/inbox-pipeline/shadow";
import { communityMessengerRoomIsConfirmedDelivery, communityMessengerRoomIsTrade } from "@/lib/community-messenger/messenger-room-domain";
import { resolveStoreOrderDisplayIdentity } from "@/lib/community-messenger/store-order-display-identity";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

type TradeMetaPatch = { roomId: string; contextMeta: CommunityMessengerRoomContextMetaV1 | null };

const TRADE_CONTEXT_META_KEYS: (keyof CommunityMessengerRoomContextMetaV1)[] = [
  "v",
  "kind",
  "headline",
  "priceLabel",
  "thumbnailUrl",
  "stepLabel",
  "roleLabel",
  "itemStateLabel",
  "categoryMenuLabel",
  "productCategoryLabel",
  "productChatId",
  "postId",
  "sellerDisplayName",
  "tradeFlowStatus",
  "storeOrderId",
  "orderNo",
  "storeId",
  "storeDisplayName",
  "fulfillmentType",
];

/** 동일 roomId batch가 동시에 두 번 돌지 않도록 */
const tradeMetaHydrationInFlightKeys = new Set<string>();

/** 마지막으로 API가 돌려준 패치 내용 fingerprint — 동일이면 재요청·재적용 생략 */
let tradeMetaLastSuccessfulBatchFingerprint = "";

function tradeContextMetaContentEqual(
  a: CommunityMessengerRoomContextMetaV1 | null | undefined,
  b: CommunityMessengerRoomContextMetaV1 | null | undefined
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  for (const key of TRADE_CONTEXT_META_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function findBootstrapRoom(
  bootstrap: CommunityMessengerBootstrap | null,
  roomId: string
): CommunityMessengerRoomSummary | null {
  if (!bootstrap) return null;
  return (
    bootstrap.chats.find((r) => r.id === roomId) ??
    bootstrap.groups.find((r) => r.id === roomId) ??
    null
  );
}

function filterTradeMetaPatchesNeedingApply(
  bootstrap: CommunityMessengerBootstrap | null,
  patches: TradeMetaPatch[]
): TradeMetaPatch[] {
  return patches.filter((patch) => {
    if (patch.contextMeta == null) return false;
    const room = findBootstrapRoom(bootstrap, patch.roomId);
    if (!room) return true;
    return !tradeContextMetaContentEqual(room.contextMeta, patch.contextMeta);
  });
}

function tradeMetaPatchesContentFingerprint(patches: TradeMetaPatch[]): string {
  return patches
    .filter((p) => p.contextMeta != null)
    .map((p) => `${p.roomId}:${JSON.stringify(p.contextMeta)}`)
    .sort()
    .join("|");
}

function logTradeMetaSetDataSkipped(
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>,
  reason: string,
  roomId: string | undefined,
  changedRoomCount: number
): void {
  setData((prev) => {
    resolveMessengerHomeBootstrapSetData("trade-meta", prev, prev, {
      reason,
      roomId,
      changedRoomCount,
    });
    return prev;
  });
}

/**
 * 거래 탭에서 `trade-chat-list-meta` 를 부를지 — 썸네일이 이미 있어도
 * `productCategoryLabel` 이 비어 있으면(구 부트스트랩·캐시) **방당 1회** 보강을 시도한다.
 */
function tradeChatListSummaryNeedsMetaHydration(
  room: CommunityMessengerRoomSummary,
  attemptedRoomIds: ReadonlySet<string>
): boolean {
  if (attemptedRoomIds.has(room.id)) return false;
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
  if (postId && !hasLeaf) return true;

  return false;
}

function deliveryChatListSummaryNeedsMetaHydration(
  room: CommunityMessengerRoomSummary,
  attemptedRoomIds: ReadonlySet<string>
): boolean {
  if (attemptedRoomIds.has(room.id)) return false;
  if (!communityMessengerRoomIsConfirmedDelivery(room)) return false;
  return resolveStoreOrderDisplayIdentity(room)?.hasResolvedStoreName !== true;
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
  shadowDispatch?: MessengerHomeShadowDispatch;
  /** 한 번에 hydrate 할 roomId 상한 — 거래 탭 첫 페인트 우선 */
  maxBatchSize?: number;
}): void {
  const { enabled, viewerUserId, chats, setData, shadowDispatch, maxBatchSize } = args;
  const shadowGenerationRef = useRef(0);
  const tradeMetaFetchAttemptedRef = useRef(new Set<string>());
  const [surfaceResumeTick, setSurfaceResumeTick] = useState(0);

  useEffect(() => {
    return subscribeMessengerHomeHydrationSurfaceResume(() => {
      setSurfaceResumeTick((tick) => tick + 1);
    });
  }, []);

  const missingKey =
    chats?.length && enabled && viewerUserId
      ? chats
          .filter(
            (r) =>
              tradeChatListSummaryNeedsMetaHydration(r, tradeMetaFetchAttemptedRef.current) ||
              deliveryChatListSummaryNeedsMetaHydration(r, tradeMetaFetchAttemptedRef.current)
          )
          .map((r) => r.id)
          .sort()
          .join(",")
      : "";

  const hydratePriority =
    chats?.some((r) => deliveryChatListSummaryNeedsMetaHydration(r, tradeMetaFetchAttemptedRef.current))
      ? "medium"
      : "low";

  useEffect(() => {
    if (!enabled || !viewerUserId || !missingKey) return;
    shadowDispatch?.markTradeMetaInFlight();
    if (shouldDeferTradeChatListMetaHydration()) return;
    let roomIds = missingKey.split(",").filter(Boolean);
    if (maxBatchSize != null && maxBatchSize > 0) {
      roomIds = roomIds.slice(0, maxBatchSize);
    }
    if (roomIds.length === 0) return;

    const dedupeKey = `trade-chat-list-meta:${missingKey}`;
    if (tradeMetaHydrationInFlightKeys.has(dedupeKey)) return;

    let stale = false;
    getMessengerBackgroundHydrationScheduler().schedule({
      id: dedupeKey,
      dedupeKey,
      priority: hydratePriority,
      run: async (signal) => {
        if (tradeMetaHydrationInFlightKeys.has(dedupeKey)) return;
        tradeMetaHydrationInFlightKeys.add(dedupeKey);
        try {
          if (stale || signal.aborted) return;
          const res = await fetch("/api/community-messenger/trade-chat-list-meta", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomIds }),
            signal,
          });
          if (signal.aborted || stale) return;
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            patches?: TradeMetaPatch[];
          };
          if (stale || signal.aborted) return;
          if (!res.ok || !json.ok || !Array.isArray(json.patches)) return;

          const toApply = json.patches.filter((p) => p.contextMeta != null);
          const contentFingerprint = tradeMetaPatchesContentFingerprint(toApply);
          for (const id of roomIds) tradeMetaFetchAttemptedRef.current.add(id);

          if (toApply.length === 0) {
            logTradeMetaSetDataSkipped(
              setData,
              "trade_context_meta_batch:empty_patches",
              roomIds[0],
              0
            );
            return;
          }

          if (
            contentFingerprint.length > 0 &&
            contentFingerprint === tradeMetaLastSuccessfulBatchFingerprint
          ) {
            logTradeMetaSetDataSkipped(
              setData,
              "trade_context_meta_batch:same_fingerprint",
              toApply[0]?.roomId,
              0
            );
            return;
          }

          setData((prev) => {
            const filtered = filterTradeMetaPatchesNeedingApply(prev, toApply);
            const changedRoomCount = filtered.length;
            if (changedRoomCount === 0) {
              if (contentFingerprint.length > 0) {
                tradeMetaLastSuccessfulBatchFingerprint = contentFingerprint;
              }
              resolveMessengerHomeBootstrapSetData("trade-meta", prev, prev, {
                reason: "trade_context_meta_batch:content_equal",
                roomId: toApply[0]?.roomId,
                changedRoomCount: 0,
              });
              return prev;
            }
            for (const patch of filtered) {
              shadowGenerationRef.current += 1;
              shadowDispatch?.dispatchPatch("trade_meta", shadowGenerationRef.current, {
                roomId: patch.roomId,
                contextMeta: patch.contextMeta,
              });
            }
            const next = applyHomeListPatch(
              prev,
              { kind: "trade_context_meta", patches: filtered },
              "trade-meta"
            );
            const resolved = resolveMessengerHomeBootstrapSetData("trade-meta", prev, next, {
              reason: "trade_context_meta_batch",
              roomId: filtered[0]?.roomId,
              changedRoomCount,
            });
            if (resolved && resolved !== prev) {
              primeBootstrapCache(resolved);
              tradeMetaLastSuccessfulBatchFingerprint = tradeMetaPatchesContentFingerprint(filtered);
            }
            return resolved;
          });
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          if (signal.aborted || stale) return;
        } finally {
          tradeMetaHydrationInFlightKeys.delete(dedupeKey);
          shadowDispatch?.markTradeMetaSettled();
        }
      },
    });

    return () => {
      stale = true;
    };
  }, [enabled, hydratePriority, maxBatchSize, missingKey, setData, shadowDispatch, viewerUserId, surfaceResumeTick]);
}
