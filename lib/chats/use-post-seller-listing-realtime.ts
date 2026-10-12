"use client";

import { useEffect, useRef } from "react";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { getSupabaseClient } from "@/lib/supabase/client";

/** `in` 필터 청크 — 커뮤니티 메신저 홈·통합 채팅 목록과 동일 상한 */
const POSTS_LISTING_IN_FILTER_MAX = 90;
const POSTS_LIST_STALE_DEBOUNCE_MS = 380;

function useStableCallback(callback: () => void) {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  return ref;
}

/**
 * `posts.seller_listing_state` 변경을 Realtime으로 받는다.
 * (자동 문의중/판매중 동기화, 상대가 메뉴에서 단계 변경, 다른 기기 반영)
 *
 * **운영**: Supabase `Database → Replication` 에 `posts` 가 publication 에 포함되어야 한다.
 */
export function usePostSellerListingRealtime(args: {
  postId: string | null;
  enabled: boolean;
  onSellerListingState: (next: { sellerListingState: string | null; postStatus: string | null }) => void;
}): void {
  const onRef = useRef(args.onSellerListingState);
  useEffect(() => {
    onRef.current = args.onSellerListingState;
  }, [args.onSellerListingState]);

  useEffect(() => {
    const pid = args.postId?.trim() ?? "";
    if (!args.enabled || !pid) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let markRealtimeSignal = () => {};
    const sub = subscribeWithRetry({
      sb,
      name: `post-seller-listing:${pid}`,
      scope: `post-seller-listing:${pid}`,
      isCancelled: () => cancelled,
      silentAfterMs: 18_000,
      build: (ch) =>
        ch.on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "posts", filter: `id=eq.${pid}` },
          (payload) => {
            markRealtimeSignal();
            try {
              const n = payload.new as { seller_listing_state?: string | null; status?: string | null } | undefined;
              if (!n) return;
              onRef.current({
                sellerListingState: n.seller_listing_state ?? null,
                postStatus: typeof n.status === "string" ? n.status : null,
              });
            } catch {
              /* ignore */
            }
          }
        ),
    });
    markRealtimeSignal = sub.markSignal;

    return () => {
      cancelled = true;
      sub.stop();
    };
  }, [args.postId, args.enabled]);
}

/**
 * 채팅 **목록**에 보이는 여러 `posts.id`에 대해 `seller_listing_state`·`status` 변경을 한 번에 구독한다.
 * (`chat_rooms`만 구독할 때 레거시 `product_chat` 행이나 메타 지연으로 배지가 늦게 바뀌는 경우 보완)
 */
export function usePostsSellerListingRealtimeBatch(args: {
  userId: string | null;
  postIds: string[];
  enabled: boolean;
  onListStale: () => void;
}): void {
  const onStaleRef = useStableCallback(args.onListStale);
  const fp = [...new Set(args.postIds.map((x) => String(x).trim()).filter(Boolean))].sort().join("\0");

  useEffect(() => {
    const userId = args.userId?.trim();
    if (!args.enabled || !userId || !fp) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const mountedChannels: Array<{ stop: () => void }> = [];

    const scheduleStale = () => {
      if (debounceTimer != null) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!cancelled) onStaleRef.current();
      }, POSTS_LIST_STALE_DEBOUNCE_MS);
    };

    const ids = fp.split("\0").filter(Boolean);
    for (let offset = 0; offset < ids.length; offset += POSTS_LISTING_IN_FILTER_MAX) {
      if (cancelled) break;
      const chunk = ids.slice(offset, offset + POSTS_LISTING_IN_FILTER_MAX);
      const filter = `id=in.(${chunk.join(",")})`;
      let markRealtimeSignal = () => {};
      const sub = subscribeWithRetry({
        sb,
        name: `chat-list:posts-listing:${userId}:${offset}`,
        scope: `chat-list:posts-listing:${userId}`,
        isCancelled: () => cancelled,
        silentAfterMs: 18_000,
        build: (ch) =>
          ch.on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "posts", filter },
            () => {
              markRealtimeSignal();
              if (!cancelled) scheduleStale();
            }
          ),
      });
      markRealtimeSignal = sub.markSignal;
      mountedChannels.push(sub);
    }

    return () => {
      cancelled = true;
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const ch of mountedChannels) {
        ch.stop();
      }
      mountedChannels.length = 0;
    };
  }, [args.enabled, args.userId, fp, onStaleRef]);
}
