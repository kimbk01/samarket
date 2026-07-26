"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

export type StoreOrderRowRealtimeDomain = "delivery-customer" | "delivery-owner" | "platform-admin";

export type StoreOrderRowRealtimeHandlers = {
  debounceMs?: number;
  onChange?: () => void;
};

export function storeOrderRowRealtimeChannelName(input: {
  domain: StoreOrderRowRealtimeDomain;
  orderId: string;
  storeId?: string | null;
}): string {
  const oid = input.orderId.trim();
  const sid = input.storeId?.trim() ?? "";
  if (input.domain === "delivery-owner") {
    return `${input.domain}-order-row-rt:${sid}:${oid}`;
  }
  return `${input.domain}-order-row-rt:${oid}`;
}

export function storeOrderRowRealtimeEventSignature(payload: {
  eventType: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}): string {
  const row = payload.new ?? payload.old ?? {};
  const stableEntries = Object.entries(row).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([payload.eventType, stableEntries]);
}

export function storeOrderRowEventMatchesDomain(input: {
  domain: StoreOrderRowRealtimeDomain;
  storeId?: string | null;
  row?: Record<string, unknown> | null;
}): boolean {
  if (input.domain !== "delivery-owner") return true;
  const expectedStoreId = input.storeId?.trim() ?? "";
  if (!expectedStoreId) return false;
  return String(input.row?.store_id ?? "").trim() === expectedStoreId;
}

export function applyStoreOrderRowRealtimeEvent(input: {
  boundDomain: StoreOrderRowRealtimeDomain;
  eventDomain: StoreOrderRowRealtimeDomain;
  payload: {
    eventType: string;
    new?: Record<string, unknown> | null;
    old?: Record<string, unknown> | null;
  };
  lastSignature: string;
  onApply: () => void;
}): { applied: boolean; signature: string } {
  const signature = storeOrderRowRealtimeEventSignature(input.payload);
  if (input.boundDomain !== input.eventDomain || signature === input.lastSignature) {
    return { applied: false, signature: input.lastSignature };
  }
  input.onApply();
  return { applied: true, signature };
}

/**
 * Shared transport only. Product surfaces must use role adapters:
 * `useCustomerStoreOrderRowRealtime` / `useOwnerStoreOrderRowRealtime`.
 */
export function useStoreOrderRowRealtimeTransport(
  domain: StoreOrderRowRealtimeDomain,
  orderId: string | null,
  handlers: StoreOrderRowRealtimeHandlers,
  opts?: { storeId?: string | null }
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const oid = orderId?.trim() ?? "";
    if (!oid) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    let ch: RealtimeChannel | null = null;
    let cancelled = false;
    let debTimer: ReturnType<typeof setTimeout> | null = null;
    let lastEventSignature = "";

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

    const subscribe = () => {
      if (cancelled) return;
      if (ch) void sb.removeChannel(ch);
      clearDebounce();
      ch = sb
        .channel(
          storeOrderRowRealtimeChannelName({
            domain,
            orderId: oid,
            storeId: opts?.storeId,
          })
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "store_orders",
            filter: `id=eq.${oid}`,
          },
          (payload) => {
            const eventType = payload.eventType;
            if (eventType === "INSERT" || eventType === "UPDATE" || eventType === "DELETE") {
              const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
              if (!storeOrderRowEventMatchesDomain({ domain, storeId: opts?.storeId, row })) {
                return;
              }
              const result = applyStoreOrderRowRealtimeEvent({
                boundDomain: domain,
                eventDomain: domain,
                payload: {
                  eventType,
                  new: payload.new as Record<string, unknown> | null,
                  old: payload.old as Record<string, unknown> | null,
                },
                lastSignature: lastEventSignature,
                onApply: scheduleChange,
              });
              lastEventSignature = result.signature;
            }
          }
        )
        .subscribe();
    };

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        clearDebounce();
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
      clearDebounce();
      subscription.unsubscribe();
      if (ch) void sb.removeChannel(ch);
    };
  }, [domain, orderId, opts?.storeId]);
}
