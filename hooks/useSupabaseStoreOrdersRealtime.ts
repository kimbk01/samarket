"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * 해당 매장에 주문 행이 INSERT 될 때마다 콜백 (RLS: 오너는 본인 매장 행만 수신).
 */
export function useSupabaseStoreOrdersRealtime(
  storeId: string | null,
  onInsert: (row: Record<string, unknown>) => void
) {
  useEffect(() => {
    const sid = storeId?.trim() ?? "";
    if (!sid) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    let ch: RealtimeChannel | null = null;
    let cancelled = false;

    const subscribe = () => {
      if (cancelled) return;
      if (ch) void sb.removeChannel(ch);
      ch = sb
        .channel(`store-orders-rt:${sid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "store_orders",
            filter: `store_id=eq.${sid}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown> | null;
            if (row && typeof row === "object") onInsert(row);
          }
        )
        .subscribe();
    };

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        if (ch) void sb.removeChannel(ch);
        ch = null;
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        if (session?.user) subscribe();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (ch) void sb.removeChannel(ch);
    };
  }, [storeId, onInsert]);
}
