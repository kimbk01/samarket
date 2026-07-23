"use client";

/**
 * Domain list bootstrap refresh for trade/delivery pillars (slice-1).
 * Loads Domain RPC path into projection writers; list paint still uses CM home.
 */

import { useEffect, useRef } from "react";
import {
  loadStoreOrderListBootstrap,
  loadTradeListBootstrap,
} from "@/lib/chat-domain/bootstrap";
import { getSupabaseClient } from "@/lib/supabase/client";

export function useDomainListPillarBootstrapRefresh(args: {
  pillar: "trade" | "delivery" | null | undefined;
  userId: string | null | undefined;
  enabled?: boolean;
}): void {
  const { pillar, userId, enabled = true } = args;
  const ranForRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;
    if (pillar !== "trade" && pillar !== "delivery") return;
    const uid = typeof userId === "string" ? userId.trim() : "";
    if (!uid) return;
    const key = `${pillar}:${uid}`;
    if (ranForRef.current === key) return;
    ranForRef.current = key;

    let cancelled = false;
    void (async () => {
      const sb = getSupabaseClient();
      if (!sb || cancelled) return;
      if (pillar === "trade") {
        await loadTradeListBootstrap({ userId: uid, sb, limit: 100 });
      } else {
        await loadStoreOrderListBootstrap({ userId: uid, sb, limit: 100 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, pillar, userId]);
}
