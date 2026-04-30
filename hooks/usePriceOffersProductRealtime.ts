"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { normalizeOfferProductId } from "@/lib/offers/normalize-offer-product-id";
import { waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";

/** 너무 짧으면 postgres_changes 연속 이벤트로 요청 폭주, 너무 길면 체감 지연 */
const STALE_DEBOUNCE_MS = 100;

/**
 * `public.price_offers` 에서 해당 상품(`product_id`) 행이 바뀔 때 콜백.
 * RLS: 구매자·판매자·글 소유자만 해당 행을 SELECT 할 수 있으면 이벤트를 받는다.
 * 운영 DB에 `20260630140000_price_offers_realtime_publication.sql` 적용 필요.
 */
export function usePriceOffersProductRealtime(
  productId: string | null | undefined,
  enabled: boolean,
  onStale: () => void
): void {
  const onStaleRef = useRef(onStale);
  useEffect(() => {
    onStaleRef.current = onStale;
  }, [onStale]);

  useEffect(() => {
    const pid = normalizeOfferProductId(productId ?? "");
    if (!enabled || !pid) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDebounce = () => {
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };

    const scheduleStale = () => {
      if (cancelled) return;
      clearDebounce();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!cancelled) onStaleRef.current();
      }, STALE_DEBOUNCE_MS);
    };

    const removeChannel = () => {
      clearDebounce();
      if (ch) {
        void sb.removeChannel(ch);
        ch = null;
      }
    };

    const subscribe = async () => {
      if (cancelled) return;
      removeChannel();
      const ok = await waitForSupabaseRealtimeAuth(sb);
      if (cancelled) return;
      if (!ok) return;

      ch = sb
        .channel(`price-offers-product:${pid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "price_offers",
            filter: `product_id=eq.${pid}`,
          },
          () => {
            scheduleStale();
          }
        )
        .subscribe();
    };

    void subscribe();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        removeChannel();
        return;
      }
      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session?.user) {
        void subscribe();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      removeChannel();
    };
  }, [productId, enabled]);
}
