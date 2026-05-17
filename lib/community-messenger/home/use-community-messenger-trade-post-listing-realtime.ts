"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";

const POSTS_LISTING_IN_FILTER_MAX = 90;

/**
 * 메신저 홈 목록의 거래 행 `contextMeta.itemStateLabel`을 `posts` Realtime으로 즉시 맞춘다.
 * (`postId`는 부트스트랩 enrich·브릿지에서 채워짐)
 */
export function useCommunityMessengerTradePostListingRealtime(args: {
  viewerUserId: string | null;
  tradePostIds: string[];
  enabled: boolean;
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>;
}): void {
  const setDataRef = useRef(args.setData);
  useEffect(() => {
    setDataRef.current = args.setData;
  }, [args.setData]);

  const fp = [...new Set(args.tradePostIds.map((x) => String(x).trim()).filter(Boolean))].sort().join("\0");

  useEffect(() => {
    const userId = args.viewerUserId?.trim();
    if (!args.enabled || !userId || !fp) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const mountedChannels: Array<{ stop: () => void }> = [];
    const ids = fp.split("\0").filter(Boolean);
    for (let offset = 0; offset < ids.length; offset += POSTS_LISTING_IN_FILTER_MAX) {
      if (cancelled) break;
      const chunk = ids.slice(offset, offset + POSTS_LISTING_IN_FILTER_MAX);
      const filter = `id=in.(${chunk.join(",")})`;
      let markRealtimeSignal = () => {};
      const sub = subscribeWithRetry({
        sb,
        name: `cm-home:posts-trade-meta:${userId}:${offset}`,
        scope: `cm-home:posts-trade-meta:${userId}`,
        isCancelled: () => cancelled,
        silentAfterMs: 18_000,
        build: (ch) =>
          ch.on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "posts", filter },
            (payload) => {
              markRealtimeSignal();
              if (cancelled) return;
              try {
                const n = payload.new as { id?: unknown; seller_listing_state?: unknown; status?: unknown } | undefined;
                const id = typeof n?.id === "string" ? n.id.trim() : "";
                if (!id) return;
                setDataRef.current((prev) => {
                  const next = applyHomeListPatch(
                    prev,
                    {
                      kind: "trade_post_listing_meta",
                      postId: id,
                      sellerListingStateRaw: n?.seller_listing_state,
                      postStatus: typeof n?.status === "string" ? n.status : null,
                    },
                    "realtime"
                  );
                  if (!next || next === prev) return prev;
                  primeBootstrapCache(next);
                  return next;
                });
              } catch {
                /* ignore */
              }
            }
          ),
      });
      markRealtimeSignal = sub.markSignal;
      mountedChannels.push(sub);
    }

    return () => {
      cancelled = true;
      for (const ch of mountedChannels) {
        ch.stop();
      }
      mountedChannels.length = 0;
    };
  }, [args.enabled, args.viewerUserId, fp]);
}
