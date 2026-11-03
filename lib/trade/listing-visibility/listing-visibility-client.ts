"use client";
/**
 * 브라우저 — 거래 글 공개 자격 변경 수신 (설계 §1-3). 탭 하나에 구독 1개(듣는 화면이 있을 때만).
 * 받은 「안 보임」 글 id 는 이번 실행 동안 기억한다 → 목록은 카드를 빼고, 상세·채팅·찜·최근 본은 「볼 수 없는 글」.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dropPostFromHomePostsCache } from "@/lib/posts/getPostsForHome";
import {
  TRADE_LISTING_VISIBILITY_EVENT,
  TRADE_LISTING_VISIBILITY_TOPIC,
  parseTradeListingVisibilityPayload,
  type TradeListingVisibilityPayload,
} from "@/lib/trade/listing-visibility/listing-visibility-shared";

type Listener = (p: TradeListingVisibilityPayload) => void;

const listeners = new Set<Listener>();
const storeListeners = new Set<() => void>();
let removed: ReadonlySet<string> = new Set();
let stopSub: (() => void) | null = null;

function notifyStore() {
  for (const l of storeListeners) l();
}

/** 서버 방송·복귀 재확인 모두 이 함수로 「안 보임/다시 보임」을 기록한다 */
export function noteTradeListingVisibility(postId: string, visible: boolean): void {
  const id = postId.trim();
  if (!id) return;
  if (visible === !removed.has(id)) return;
  const next = new Set(removed);
  if (visible) next.delete(id);
  else next.add(id);
  removed = next;
  notifyStore();
}

function ensureSubscribed(): void {
  if (stopSub || typeof window === "undefined") return;
  const sb = getSupabaseClient();
  if (!sb) return;
  let cancelled = false;
  const sub = subscribeWithRetry({
    sb,
    name: TRADE_LISTING_VISIBILITY_TOPIC,
    scope: TRADE_LISTING_VISIBILITY_TOPIC,
    channelOptions: messengerPrivateBroadcastChannelOptions(),
    isCancelled: () => cancelled,
    build: (ch) =>
      ch.on("broadcast", { event: TRADE_LISTING_VISIBILITY_EVENT }, (msg) => {
        const p = parseTradeListingVisibilityPayload((msg as { payload?: unknown }).payload);
        if (!p) return;
        noteTradeListingVisibility(p.postId, p.visible);
        /** 기기 목록 캐시에서도 뺀다 — 다시 열었을 때 캐시 목록에 다시 나오지 않게 */
        if (!p.visible) dropPostFromHomePostsCache(p.postId);
        for (const l of listeners) l(p);
      }),
  });
  stopSub = () => {
    cancelled = true;
    sub.stop();
  };
}

function maybeStop(): void {
  if (listeners.size === 0 && storeListeners.size === 0 && stopSub) {
    stopSub();
    stopSub = null;
  }
}

/** 목록처럼 받은 즉시 처리할 화면 — 해제 함수를 돌려준다 */
export function subscribeTradeListingVisibility(listener: Listener): () => void {
  listeners.add(listener);
  ensureSubscribed();
  return () => {
    listeners.delete(listener);
    maybeStop();
  };
}

/** 목록 화면용 — 「안 보임」 방송을 받으면 `onRemoved(postId)` (최신 콜백을 쓴다) */
export function useTradeListingVisibilityRemoval(onRemoved: (postId: string) => void): void {
  const ref = useRef(onRemoved);
  useEffect(() => {
    ref.current = onRemoved;
  });
  useEffect(
    () =>
      subscribeTradeListingVisibility((p) => {
        if (!p.visible) ref.current(p.postId);
      }),
    []
  );
}

function subscribeStore(cb: () => void): () => void {
  storeListeners.add(cb);
  ensureSubscribed();
  return () => {
    storeListeners.delete(cb);
    maybeStop();
  };
}

/** 카드·상세 1개 단위 — 이번 실행 중 「안 보임」 방송을 받은 글이면 true */
export function useTradeListingRemoved(postId: string | null | undefined): boolean {
  const id = String(postId ?? "").trim();
  return useSyncExternalStore(
    subscribeStore,
    () => (id ? removed.has(id) : false),
    () => false
  );
}
