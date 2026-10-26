"use client";

import { useEffect, useRef } from "react";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight, runSingleFlightWithTrailing } from "@/lib/http/run-single-flight";
import { subscribeCallLogsRealtimeChanged } from "@/lib/community-messenger/call-history/call-logs-realtime-listeners";

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
    /** D-5: 첫 페이지는 진행 중 조회가 있으면 끝난 뒤 1회 더 — 기록 저장 전 조회에 합류해 새 통화를 놓치지 않게 */
    const run = cursor ? runSingleFlight : runSingleFlightWithTrailing;
    return await run(flightKey, async () => {
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
  /**
   * D-5: `home_meta` = 홈 실시간이 이미 call_logs 를 받는 화면(메신저 홈 통화 탭) — 자체 구독 없이 홈 신호만.
   * `own` = 홈 실시간이 없는 단독 페이지 — call_logs 자체 구독.
   */
  realtimeSource?: "home_meta" | "own";
};

/**
 * 통화 목록 Realtime — `community_messenger_call_logs`(홈 신호 또는 자체 구독) · 터미널 bus.
 * D-5: `call_sessions` UPDATE 구독은 제거 — 세션 갱신(통화당 약 9회)마다 목록이 그대로인 조회를 만들고
 * 기록 저장 전 조회로 새 행을 놓치게 했다. 기록이 바뀌면 call_logs 신호가 온다.
 * CUT-2C: all same-purpose invalidations → one coalesce scheduler → one first-page refetch.
 * CUT-2B: refetch = first page replace (Panel clears older pages).
 */
export function useCommunityCallHistoryRealtimeSync({
  enabled,
  viewerUserId,
  onRefetch,
  realtimeSource = "own",
}: Args): void {
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

    const stopRealtime: () => void =
      realtimeSource === "home_meta"
        ? subscribeCallLogsRealtimeChanged(scheduleHistoryRefetch)
        : (() => {
            const bound = subscribeWithRetry({
              sb,
              name: `community-messenger:call-logs:${userId}`,
              scope: "community-messenger:call-logs",
              channelOptions: messengerPrivateBroadcastChannelOptions(),
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
                  ),
            });
            return () => bound.stop();
          })();

    const unsubBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      scheduleHistoryRefetch();
    });

    if (cancelled) {
      scheduler.cancel();
      stopRealtime();
      unsubBus();
      return;
    }

    return () => {
      cancelled = true;
      scheduler.cancel();
      stopRealtime();
      unsubBus();
    };
  }, [enabled, realtimeSource, viewerUserId]);
}
