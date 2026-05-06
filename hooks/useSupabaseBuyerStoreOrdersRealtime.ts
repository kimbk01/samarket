"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { StoreOrdersRealtimeHandlers } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { dvDeliveryLatencyLog, dvDeliveryLatencyValue } from "@/lib/perf/dv-delivery-latency";

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
    let lastSig = "";
    let lastSigAt = 0;

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
            try {
              const commitTs = (payload as any)?.commit_timestamp;
              const sig = `${String(payload.eventType)}:${String(commitTs ?? "")}`;
              const now = Date.now();
              if (sig && sig === lastSig && now - lastSigAt < 1500) {
                dvDeliveryLatencyLog("duplicate_realtime_event_ms", {
                  table: "store_orders",
                  scope: "buyer",
                  eventType: payload.eventType,
                  commit_timestamp: commitTs,
                });
              }
              lastSig = sig;
              lastSigAt = now;
              const commitMs = typeof commitTs === "string" ? new Date(commitTs).getTime() : NaN;
              if (Number.isFinite(commitMs)) {
                dvDeliveryLatencyValue("buyer_realtime_received_ms", Date.now() - commitMs, {
                  table: "store_orders",
                  eventType: payload.eventType,
                  commit_timestamp: commitTs,
                  buyer_user_id: u,
                });
              } else {
                dvDeliveryLatencyLog("buyer_realtime_received_ms", {
                  table: "store_orders",
                  eventType: payload.eventType,
                  buyer_user_id: u,
                });
              }
            } catch {
              /* ignore */
            }
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
