"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { StoreOrdersRealtimeHandlers } from "@/hooks/useSupabaseStoreOrdersRealtime";

/**
 * 구매자 본인 주문 목록용 — `buyer_user_id` 일치 행의 INSERT/UPDATE/DELETE.
 */
export function useSupabaseBuyerStoreOrdersRealtime(handlers: StoreOrdersRealtimeHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    let ch: RealtimeChannel | null = null;
    let cancelled = false;
    let debTimer: ReturnType<typeof setTimeout> | null = null;
    let boundUid = "";

    const clearDebounce = () => {
      if (debTimer) {
        clearTimeout(debTimer);
        debTimer = null;
      }
    };

    const scheduleChange = () => {
      const ms = handlersRef.current.debounceMs ?? 380;
      clearDebounce();
      debTimer = setTimeout(() => {
        debTimer = null;
        handlersRef.current.onChange?.();
      }, ms);
    };

    const subscribeForUser = (uid: string) => {
      const u = uid.trim();
      if (!u || cancelled) return;
      if (u === boundUid && ch) return;
      boundUid = u;
      if (ch) void sb.removeChannel(ch);
      clearDebounce();
      ch = sb
        .channel(`buyer-store-orders-rt:${u}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "store_orders",
            filter: `buyer_user_id=eq.${u}`,
          },
          (payload) => {
            const eventType = payload.eventType;
            if (eventType === "INSERT") {
              const row = payload.new as Record<string, unknown> | null;
              if (row && typeof row === "object") {
                handlersRef.current.onInsert?.(row);
              }
            }
            if (eventType === "INSERT" || eventType === "UPDATE" || eventType === "DELETE") {
              scheduleChange();
            }
          }
        )
        .subscribe();
    };

    const teardownChannel = () => {
      boundUid = "";
      clearDebounce();
      if (ch) void sb.removeChannel(ch);
      ch = null;
    };

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || !session?.user?.id) {
        teardownChannel();
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        subscribeForUser(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      clearDebounce();
      subscription.unsubscribe();
      if (ch) void sb.removeChannel(ch);
    };
  }, []);
}
