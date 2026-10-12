"use client";

import { useEffect, useRef } from "react";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const CALL_LOGS_FETCH_FLIGHT_KEY = "cm:call-logs-list";

/**
 * CUT-2C: single History refresh coalesce window.
 * Was: table 60ms + terminal 120ms (two owners → up to 2 GET /calls).
 * 120ms keeps prior terminal wait for call_logs INSERT after session/bus,
 * while trailing debounce merges the whole burst into one schedule.
 */
export const CALL_HISTORY_REFETCH_COALESCE_MS = 120;

type CallHistoryRefreshScheduler = {
  schedule: () => void;
  cancel: () => void;
  hasPending: () => boolean;
};

/** Testable trailing debounce — every invalidation source shares one timer. */
export function createCallHistoryRefreshScheduler(
  run: () => void,
  options?: {
    coalesceMs?: number;
    isCancelled?: () => boolean;
  }
): CallHistoryRefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const coalesceMs = Math.max(
    0,
    Math.floor(Number(options?.coalesceMs ?? CALL_HISTORY_REFETCH_COALESCE_MS) || CALL_HISTORY_REFETCH_COALESCE_MS)
  );
  const schedule = () => {
    if (options?.isCancelled?.()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (options?.isCancelled?.()) return;
      run();
    }, coalesceMs);
  };
  const cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  return {
    schedule,
    cancel,
    hasPending: () => timer != null,
  };
}

export type CommunityMessengerCallLogsClientPage = {
  calls: CommunityMessengerCallLog[];
  nextCursor: string | null;
  hasMore: boolean;
};

export async function fetchCommunityMessengerCallLogsClient(options?: {
  cursor?: string | null;
}): Promise<CommunityMessengerCallLogsClientPage | null> {
  const cursor = options?.cursor?.trim() || "";
  const flightKey = cursor ? `${CALL_LOGS_FETCH_FLIGHT_KEY}:cursor:${cursor}` : CALL_LOGS_FETCH_FLIGHT_KEY;
  try {
    return await runSingleFlight(flightKey, async () => {
      const url = cursor
        ? `/api/community-messenger/calls?cursor=${encodeURIComponent(cursor)}`
        : "/api/community-messenger/calls";
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        calls?: CommunityMessengerCallLog[];
        nextCursor?: string | null;
        hasMore?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) return null;
      return {
        calls: json.calls ?? [],
        nextCursor: typeof json.nextCursor === "string" ? json.nextCursor : null,
        hasMore: Boolean(json.hasMore),
      };
    });
  } catch {
    return null;
  }
}

/** Append page rows by id; preserve existing order then append unseen in server order. */
export function appendCommunityMessengerCallLogsById(
  existing: CommunityMessengerCallLog[],
  incoming: CommunityMessengerCallLog[]
): CommunityMessengerCallLog[] {
  const seen = new Set(existing.map((row) => row.id));
  const out = [...existing];
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

type Args = {
  enabled: boolean;
  viewerUserId: string | null | undefined;
  onRefetch: () => void | Promise<void>;
};

/**
 * 통화 목록 Realtime — `community_messenger_call_logs` · `call_sessions` · 터미널 bus.
 * CUT-2C: all same-purpose invalidations → one coalesce scheduler → one first-page refetch.
 * CUT-2B: refetch = first page replace (Panel clears older pages).
 */
export function useCommunityCallHistoryRealtimeSync({ enabled, viewerUserId, onRefetch }: Args): void {
  const onRefetchRef = useRef(onRefetch);
  onRefetchRef.current = onRefetch;

  useEffect(() => {
    const userId = viewerUserId?.trim() ?? "";
    if (!enabled || !userId) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const scheduler = createCallHistoryRefreshScheduler(
      () => {
        if (cancelled) return;
        void onRefetchRef.current();
      },
      { isCancelled: () => cancelled }
    );

    /** Same-purpose History refresh — producers stay independent; scheduling is shared. */
    const scheduleHistoryRefetch = () => {
      scheduler.schedule();
    };

    const bound = subscribeWithRetry({
      sb,
      name: `community-messenger:call-logs:${userId}`,
      scope: "community-messenger:call-logs",
      isCancelled: () => cancelled,
      build: (ch) =>
        ch
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_call_logs",
              filter: `caller_user_id=eq.${userId}`,
            },
            () => scheduleHistoryRefetch()
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_call_logs",
              filter: `peer_user_id=eq.${userId}`,
            },
            () => scheduleHistoryRefetch()
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "community_messenger_call_sessions",
              filter: `initiator_user_id=eq.${userId}`,
            },
            () => scheduleHistoryRefetch()
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "community_messenger_call_sessions",
              filter: `recipient_user_id=eq.${userId}`,
            },
            () => scheduleHistoryRefetch()
          ),
    });

    const unsubBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      scheduleHistoryRefetch();
    });

    if (cancelled) {
      scheduler.cancel();
      bound.stop();
      unsubBus();
      return;
    }

    return () => {
      cancelled = true;
      scheduler.cancel();
      bound.stop();
      unsubBus();
    };
  }, [enabled, viewerUserId]);
}
